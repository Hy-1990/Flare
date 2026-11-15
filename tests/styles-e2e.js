import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { createApp } from "../server/app.js";
import { browserPath } from "../server/render.js";
import { starter } from "../shared/model.js";
import { UPSTREAM_STYLES } from "../shared/styles.js";
import { contentOf, Store } from "../server/store.js";
const root = process.cwd(),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "flare-style-e2e-")),
  out = path.join(root, "docs/verification"),
  checks = [],
  errors = [];
fs.mkdirSync(out, { recursive: true });
fs.cpSync(
  path.join(root, ".flare/style-library"),
  path.join(dir, "style-library"),
  { recursive: true },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 1200; i++) {
    if (await fn()) return;
    await delay(100);
  }
  throw Error("timeout");
}
let browser, server;
try {
  const a = await createApp({ dir, port: 4330, root });
  server = a.app.listen(4330, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:4330";
  a.queue.baseUrl = base;
  const request = async (url, method = "GET", body) => {
    const r = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    assert.ok(r.ok, JSON.stringify(d));
    return d;
  };
  browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base);
  await page.getByRole("button", { name: "风格库", exact: true }).click();
  await page.getByRole("heading", { name: "风格库", exact: true }).waitFor();
  const search = page.getByRole("textbox", { name: "搜索风格" });
  for (const q of ["白板", "Whiteboard", "whiteboard", "Online courses"]) {
    await search.fill(q);
    await page
      .getByRole("button", { name: "查看风格·白板讲解", exact: true })
      .waitFor();
  }
  await search.fill("not-a-style-1234");
  assert.equal(await page.locator(".reference-card").count(), 0);
  await search.fill("");
  await page
    .getByRole("combobox", { name: "制作方式筛选" })
    .selectOption("native");
  assert.equal(await page.locator(".reference-card").count(), 8);
  await page
    .getByRole("combobox", { name: "制作方式筛选" })
    .selectOption("all");
  await page.getByRole("button", { name: /速写板书/ }).click();
  assert.equal(
    await page.locator(".reference-card").count(),
    UPSTREAM_STYLES.filter((s) => s.categoryName === "速写板书").length,
  );
  await page.getByRole("button", { name: /全部风格/ }).click();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({
      width,
      height: width === 1440 ? 1000 : width === 1024 ? 768 : 844,
    });
    await page.screenshot({
      path: path.join(out, `styles-library-${width}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await search.fill("whiteboard");
  await page
    .getByRole("button", { name: "查看风格·白板讲解", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByText(/原项目样片参考/)
    .first()
    .waitFor();
  await dialog.getByText("CC BY-NC 4.0", { exact: false }).first().waitFor();
  const link = await dialog
    .getByRole("link", { name: /打开规范原文/ })
    .getAttribute("href");
  assert.ok(link.includes("/3a7132b996be0241c1ea0ab180d519f06e6f10b6/"));
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(
      () => !!document.activeElement.closest('[role="dialog"]'),
    ),
  );
  await page.screenshot({
    path: path.join(out, "styles-detail-whiteboard.png"),
    fullPage: true,
  });
  const initial = a.store.state.projects[0],
    before = contentOf(initial),
    source = initial.source;
  await page
    .getByRole("button", { name: "应用到当前短片", exact: true })
    .click();
  await until(() => initial.style === "opuscar:whiteboard");
  assert.deepEqual({ ...contentOf(initial), style: before.style }, before);
  assert.equal(initial.source, source);
  await page.getByRole("button", { name: "风格库", exact: true }).click();
  await search.fill("watercolor");
  const watercolor = UPSTREAM_STYLES.find((s) => s.slug === "watercolor");
  await page
    .getByRole("button", { name: "查看风格·" + watercolor.name, exact: true })
    .click();
  await dialog
    .getByText(/需要全部镜头有图片/)
    .first()
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: path.join(out, "styles-detail-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "用此风格新建", exact: true }).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "视觉风格", exact: true })
      .inputValue(),
    "opuscar:watercolor",
  );
  await page
    .getByRole("textbox", { name: "短片名称", exact: true })
    .fill("风格新建验收");
  await page
    .getByRole("textbox", { name: "剧本或主题", exact: true })
    .fill("第一朵云落成雨，第二朵云变成河流。");
  await page.getByRole("button", { name: "创建分镜", exact: true }).click();
  await until(() =>
    a.store.state.projects.some(
      (p) => p.title === "风格新建验收" && p.style === "opuscar:watercolor",
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push(
    "Real library: four search modes, categories,8native filter,99reference posters, source/guide labels, focus, responsive layouts, protected apply and preselected creation",
  );
  const guide = await request("/api/styles/whiteboard/guide");
  assert.ok(guide.markdown.length > 100);
  const poster = await fetch(base + "/api/styles/whiteboard/poster.jpg");
  assert.equal(poster.status, 200);
  assert.ok((await poster.arrayBuffer()).byteLength > 1000);
  const render = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await render.goto(base + "/renderer.html");
  await render.waitForFunction(() => !!window.flareRenderer);
  const frames = [];
  for (const s of UPSTREAM_STYLES.filter((s) => s.mode === "native")) {
    const p = { ...starter(), style: s.id };
    const data = await render.evaluate(async (p) => {
      await window.flareRenderer.setProject(p, 1280, 720);
      window.flareRenderer.render(2);
      return document.querySelector("canvas").toDataURL();
    }, p);
    assert.ok(!frames.some((x) => x.data === data));
    frames.push({ name: s.name, data });
    fs.writeFileSync(
      path.join(out, `style-native-${s.slug}.png`),
      Buffer.from(data.split(",")[1], "base64"),
    );
  }
  const sheet = await browser.newPage({
    viewport: { width: 1280, height: 1600 },
  });
  await sheet.setContent(
    '<body style="margin:0;background:#eee;display:grid;grid-template-columns:1fr 1fr;font:20px sans-serif"></body>',
  );
  await sheet.evaluate((frames) => {
    for (const f of frames) {
      const d = document.createElement("div");
      d.textContent = f.name;
      const img = document.createElement("img");
      img.src = f.data;
      img.style.width = "100%";
      d.append(img);
      document.body.append(d);
    }
  }, frames);
  await sheet.screenshot({
    path: path.join(out, "styles-native-contact-sheet.png"),
    fullPage: true,
  });
  checks.push(
    "8distinct native source-derived frames rendered by actual shared Canvas entry point",
  );
  const image = await render.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    const x = c.getContext("2d");
    x.fillStyle = "#d6b690";
    x.fillRect(0, 0, 1280, 720);
    x.fillStyle = "#366560";
    x.fillRect(0, 400, 1280, 320);
    x.fillStyle = "#b95738";
    x.beginPath();
    x.arc(870, 230, 120, 0, 7);
    x.fill();
    return c.toDataURL().split(",")[1];
  });
  fs.writeFileSync(
    path.join(dir, "media", "style-fixture.png"),
    Buffer.from(image, "base64"),
  );
  const imgProject = {
    ...starter(),
    title: "水彩素材验收",
    style: "opuscar:watercolor",
    scenes: starter()
      .scenes.slice(0, 2)
      .map((s) => ({ ...s, duration: 1.5 })),
  };
  const p = a.store.create(imgProject, "import");
  for (const partial of [false, true]) {
    if (partial) {
      const c = contentOf(p);
      c.scenes[0].image = "/media/style-fixture.png";
      a.store.update(p.id, p.revision, c);
    }
    const r = await fetch(base + `/api/projects/${p.id}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality: 720, requestKey: crypto.randomUUID() }),
    });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /尚未添加图片/);
    assert.equal(a.store.state.exports.length, 0);
  }
  const complete = contentOf(p);
  complete.scenes.forEach((s) => (s.image = "/media/style-fixture.png"));
  a.store.update(p.id, p.revision, complete);
  assert.deepEqual(contentOf(new Store(dir).project(p.id)), contentOf(p));
  checks.push(
    "Missing/partial image export400 without jobs; complete imported assets persist and reload",
  );
  for (const style of [
    "opuscar:watercolor",
    "opuscar:chalkboard",
    "opuscar:swiss-motion",
    "opuscar:ascii-crt",
    "opuscar:pixel-rpg",
  ]) {
    const film =
      style === p.style
        ? p
        : a.store.create(
            {
              ...starter(),
              style,
              scenes: [{ ...starter().scenes[0], duration: 3 }],
            },
            "local",
          );
    const job = await request(`/api/projects/${film.id}/exports`, "POST", {
      quality: 720,
      requestKey: crypto.randomUUID(),
    });
    await until(() =>
      ["done", "failed"].includes(
        a.store.state.exports.find((j) => j.id === job.id)?.status,
      ),
    );
    const j = a.store.state.exports.find((j) => j.id === job.id);
    assert.equal(j.status, "done", j.error);
    const file = path.join(dir, "exports", j.id, "film.mp4");
    fs.copyFileSync(
      file,
      path.join(out, `style-export-${style.split(":")[1]}.mp4`),
    );
    const preview = path.join(out, `style-preview-${style.split(":")[1]}.png`),
      decoded = path.join(out, `style-decoded-${style.split(":")[1]}.png`);
    await render.evaluate(async (p) => {
      await window.flareRenderer.setProject(p, 1280, 720);
      window.flareRenderer.render(1);
    }, j.snapshot);
    await render.screenshot({ path: preview });
    assert.equal(
      spawnSync("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        "1",
        "-i",
        file,
        "-frames:v",
        "1",
        decoded,
      ]).status,
      0,
    );
    const result = spawnSync(
        "ffmpeg",
        ["-i", preview, "-i", decoded, "-lavfi", "ssim", "-f", "null", "-"],
        { encoding: "utf8" },
      ),
      ssim = Number(result.stderr.match(/All:([\d.]+)/)?.[1]);
    assert.ok(ssim >= 0.96, result.stderr);
    checks.push(`Real MP4 ${style}, preview/export SSIM ${ssim}`);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "styles-e2e-results.json"),
    JSON.stringify({ checks, errors, date: new Date().toISOString() }, null, 2),
  );
  for (const c of checks) console.log("PASS", c);
} finally {
  await browser?.close();
  server?.closeAllConnections();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
