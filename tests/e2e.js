import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { createApp } from "../server/app.js";
import { browserPath, wavBuffer } from "../server/render.js";
import { contentOf } from "../server/store.js";

const root = process.cwd(),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "flare-e2e-")),
  evidence = path.join(root, "docs/verification");
fs.mkdirSync(evidence, { recursive: true });
const checks = [],
  errors = [],
  consoleErrors = [],
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, seconds = 60) {
  for (let i = 0; i < seconds * 10; i++) {
    if (await fn()) return;
    await delay(100);
  }
  throw Error("Timed out waiting for condition");
}
let provider, server, browser;
try {
  browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const imageBase64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 440;
    const x = c.getContext("2d");
    x.fillStyle = "#b3c8bc";
    x.fillRect(0, 0, 640, 440);
    x.fillStyle = "#d76b42";
    x.beginPath();
    x.arc(420, 140, 70, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#3d594b";
    x.beginPath();
    x.moveTo(0, 440);
    x.lineTo(260, 180);
    x.lineTo(640, 440);
    x.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  const img = Buffer.from(imageBase64, "base64");
  const samples = Float32Array.from(
      { length: 24000 },
      (_, i) => Math.sin((i / 24000) * 440 * Math.PI * 2) * 0.2,
    ),
    wav = wavBuffer(samples);
  let taskNo = 0;
  const kinds = new Map();
  provider = http.createServer(async (req, res) => {
    if (req.url === "/asset.png") {
      res.setHeader("Content-Type", "image/png");
      return res.end(img);
    }
    if (req.url === "/asset.wav") {
      res.setHeader("Content-Type", "audio/wav");
      return res.end(wav);
    }
    let b = "";
    for await (const p of req) b += p;
    const d = JSON.parse(b || "{}");
    res.setHeader("Content-Type", "application/json");
    if (
      req.url === "/chat/completions" &&
      d.tools?.[0]?.function?.name === "emit_scene"
    ) {
      const original = JSON.parse(d.messages[1].content).scene;
      return res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "emit_scene",
                      arguments: JSON.stringify({
                        ...original,
                        title: "AI 修改的镜头",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }
    if (req.url === "/chat/completions")
      return res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "emit_storyboard",
                      arguments: JSON.stringify({
                        title: "云的循环",
                        scenes: [
                          {
                            title: "山间的一朵云",
                            narration: "一朵云，落成雨。",
                            visual: "山间的云与雨",
                            duration: 5,
                            art: "landscape",
                            accent: "#dd6b44",
                          },
                          {
                            title: "沿着河流向前",
                            narration: "雨水汇入河流。",
                            visual: "河流穿过大地",
                            duration: 5,
                            art: "orbit",
                            accent: "#657d61",
                          },
                          {
                            title: "再一次回到天空",
                            narration: "水汽升起，故事继续。",
                            visual: "雨回到天空",
                            duration: 5,
                            art: "botanical",
                            accent: "#c69a4a",
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    if (req.url === "/api/getAsyncResult") {
      const kind = kinds.get(d.taskId);
      return res.end(
        JSON.stringify({
          code: 0,
          data: {
            task: { taskId: d.taskId, status: 3 },
            ...(kind === "image"
              ? {
                  images: [{ imageUrl: "https://assets.flare.test/asset.png" }],
                }
              : {
                  audios: [{ audioUrl: "https://assets.flare.test/asset.wav" }],
                }),
          },
        }),
      );
    }
    const id = "fixture-" + ++taskNo;
    kinds.set(id, req.url.includes("image") ? "image" : "audio");
    res.end(JSON.stringify({ code: 0, data: { taskId: id } }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const providerBase = `http://127.0.0.1:${provider.address().port}`;
  const port = 4329,
    base = `http://127.0.0.1:${port}`,
    a = await createApp({
      dir,
      port,
      root,
      providerDeps: {
        baseUrl: providerBase,
        interval: 10,
        lookup: async () => [{ address: "8.8.8.8" }],
        fetcher: (url, opts) =>
          fetch(
            new URL(url).hostname === "assets.flare.test"
              ? providerBase + new URL(url).pathname
              : url,
            opts,
          ),
      },
    });
  a.store.saveSettings({
    deepseekKey: "e2e-only-never-echo-secret",
    dreamapiKey: "e2e-only-never-echo-secret",
  });
  server = a.app.listen(port, "127.0.0.1");
  await once(server, "listening");
  a.queue.pump();
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
  await page.route("**/api/styles/*/poster.jpg", (route) =>
    route.fulfill({ contentType: "image/png", body: img }),
  );
  await page.goto(base);
  await page
    .getByRole("heading", { name: "一粒咖啡的旅程", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(evidence, "studio-desktop.png"),
    fullPage: true,
  });
  const start = Number(
    await page.getByRole("slider", { name: "播放位置" }).inputValue(),
  );
  await page.keyboard.press("Space");
  await delay(350);
  await page.keyboard.press("Space");
  assert.ok(
    Number(await page.getByRole("slider", { name: "播放位置" }).inputValue()) >
      start,
  );
  checks.push("Keyboard playback advances actual preview time");
  await page
    .getByRole("textbox", { name: "镜头标题", exact: true })
    .fill("第一镜修改");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await page.getByText("镜头已保存，预览已更新", { exact: true }).waitFor();
  await page.getByRole("button", { name: /选择镜头 2：/ }).click();
  await waitFor(
    async () =>
      (await page
        .getByRole("textbox", { name: "镜头标题", exact: true })
        .inputValue()) === "把时间，交给土地",
  );
  await page
    .getByRole("textbox", { name: "镜头标题", exact: true })
    .fill("保留第二镜修改");
  await page.getByRole("button", { name: "应用修改", exact: true }).click();
  await waitFor(async () => {
    const ps = await request("/api/projects");
    return ps[0].scenes[1].title === "保留第二镜修改";
  });
  await page.getByRole("button", { name: /选择镜头 1：/ }).click();
  await page.getByRole("button", { name: "撤销镜头修改", exact: true }).click();
  await waitFor(async () => {
    const ps = await request("/api/projects");
    return (
      ps[0].scenes[0].title === "故事，始于一粒种子" &&
      ps[0].scenes[1].title === "保留第二镜修改"
    );
  });
  checks.push("Per-shot Undo preserves another edited shot");
  console.log("PASS editing/undo");
  await page.getByRole("button", { name: "风格库", exact: true }).click();
  await page.screenshot({
    path: path.join(evidence, "styles-desktop.png"),
    fullPage: true,
  });
  for (const style of ["工程蓝图", "光影纪事", "纸上叙事"]) {
    if (
      !(await page
        .getByRole("heading", { name: "风格库", exact: true })
        .isVisible()
        .catch(() => false))
    )
      await page.getByRole("button", { name: "风格库", exact: true }).click();
    await page.getByRole("tab", { name: /Flare 内置/ }).click();
    await page
      .getByRole("button", { name: `查看风格·${style}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "应用到当前短片", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "一粒咖啡的旅程", exact: true })
      .waitFor();
  }
  checks.push("Three legacy styles switch through real user controls");
  await page
    .getByRole("combobox", { name: "画幅", exact: true })
    .selectOption("9:16");
  await waitFor(async () => {
    const ps = await request("/api/projects");
    return ps[0].aspect === "9:16";
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "一粒咖啡的旅程", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("combobox", { name: "画幅", exact: true })
      .inputValue(),
    "9:16",
  );
  await page
    .getByRole("combobox", { name: "画幅", exact: true })
    .selectOption("16:9");
  checks.push("Aspect change survives browser reload");
  // Open and close a dialog entirely from the keyboard, including focus wrap.
  await page.keyboard.press("n");
  await page.getByRole("dialog", { name: "新的故事" }).waitFor();
  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.contains(document.activeElement)),
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checks.push("Keyboard dialog open, focus containment and Escape");
  await page.getByRole("button", { name: /新建短片/ }).click();
  await page
    .getByRole("textbox", { name: "短片名称", exact: true })
    .fill("云的循环");
  await page
    .getByRole("textbox", { name: "剧本或主题", exact: true })
    .fill("一朵云落成雨，流过大地，再回到天空。");
  await page
    .getByRole("combobox", { name: "目标时长", exact: true })
    .selectOption("15");
  await page
    .getByRole("combobox", { name: "分镜方式", exact: true })
    .selectOption("deepseek");
  await page.getByRole("button", { name: "创建分镜", exact: true }).click();
  await page.getByRole("heading", { name: "云的循环", exact: true }).waitFor();
  let p = (await request("/api/projects")).find((p) => p.title === "云的循环");
  assert.equal(p.source, "deepseek");
  assert.equal(p.scenes.length, 3);
  checks.push(
    "Successful mocked DeepSeek plan creates validated storyboard through UI",
  );
  await page
    .getByRole("textbox", { name: "镜头修改指令", exact: true })
    .fill("把标题改得更简短");
  await page
    .getByRole("button", { name: "用 DeepSeek 修改", exact: true })
    .click();
  await waitFor(async () => {
    const q = await request(`/api/projects/${p.id}`);
    return (
      q.scenes[0].title === "AI 修改的镜头" &&
      q.scenes[1].title === "沿着河流向前"
    );
  });
  checks.push("Natural-language AI revision changes only the selected shot");
  await page.getByRole("button", { name: "生成画面", exact: true }).click();
  await page.getByRole("button", { name: "确认付费生成", exact: true }).click();
  await waitFor(async () =>
    (await request("/api/media-tasks")).some(
      (t) => t.kind === "image" && t.status === "done",
    ),
  );
  await page.getByAltText("当前镜头素材").waitFor();
  await page
    .getByRole("button", { name: "用 DreamAPI 生成配音", exact: true })
    .click();
  await page.getByRole("button", { name: "确认付费生成", exact: true }).click();
  await waitFor(async () =>
    (await request("/api/media-tasks")).some(
      (t) => t.kind === "audio" && t.status === "done",
    ),
  );
  await waitFor(
    async () => !!(await request(`/api/projects/${p.id}`)).scenes[0].audio,
  );
  await page.locator(".attached-audio audio").waitFor();
  checks.push(
    "Mocked DreamAPI image and TTS retained by task ID and attached to intended shot",
  );
  p = await request(`/api/projects/${p.id}`);
  p = await request(`/api/projects/${p.id}`, "PATCH", {
    revision: p.revision,
    content: { ...p, scenes: p.scenes.map((s) => ({ ...s, duration: 2 })) },
  });
  await page.reload();
  await page.getByRole("heading", { name: "云的循环", exact: true }).waitFor();
  for (const [width, height, name] of [
    [1440, 1000, "desktop"],
    [1024, 768, "tablet"],
    [390, 844, "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: path.join(evidence, `studio-${name}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `horizontal overflow at ${width}`,
    );
  }
  checks.push(
    "Responsive 1440, 1024 and 390 layouts have no document overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "回到开头", exact: true }).click();
  await page.getByRole("button", { name: "打开声音", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await delay(250);
  assert.ok(
    await page
      .locator("audio[hidden]")
      .evaluate((el) => el.currentTime > 0 && !el.paused),
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  checks.push("Attached TTS plays during actual preview");
  await page.getByRole("button", { name: "导出短片", exact: true }).click();
  await page.getByRole("button", { name: "开始导出", exact: true }).click();
  await waitFor(() => a.store.state.exports.length > 0);
  let job = a.store.state.exports[0];
  const snapshot = structuredClone(job.snapshot);
  p = await request(`/api/projects/${p.id}`);
  await request(`/api/projects/${p.id}`, "PATCH", {
    revision: p.revision,
    content: { ...p, title: "导出期间的新版本" },
  });
  await waitFor(() => ["done", "failed"].includes(job.status), 120);
  assert.equal(job.status, "done", job.error);
  assert.equal(job.snapshot.title, "云的循环");
  const file = path.join(dir, "exports", job.id, "film.mp4");
  fs.copyFileSync(file, path.join(evidence, "provider-fixture.mp4"));
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_name,width,height,avg_frame_rate",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  assert.equal(probe.status, 0);
  const info = JSON.parse(probe.stdout);
  assert.equal(info.streams[0].width, 1280);
  assert.equal(info.streams[0].height, 720);
  assert.ok(Math.abs(Number(info.format.duration) - 6) < 0.1);
  assert.ok(info.streams.some((s) => s.codec_name === "aac"));
  checks.push(
    "Real 6s MP4 export includes H.264, AAC, image asset and immutable source snapshot",
  );
  const volume = spawnSync(
    "ffmpeg",
    ["-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  assert.ok(/mean_volume: -(\d+\.\d+) dB/.test(volume.stderr));
  const render = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await render.goto(base + "/renderer.html");
  await render.waitForFunction(() => !!window.flareRenderer);
  await render.evaluate(async (p) => {
    await window.flareRenderer.setProject(p, 1280, 720);
    window.flareRenderer.render(1);
  }, snapshot);
  await render.screenshot({
    path: path.join(evidence, "preview-reference.png"),
  });
  const extracted = path.join(evidence, "export-reference.png");
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
      extracted,
    ]).status,
    0,
  );
  const ssim = spawnSync(
    "ffmpeg",
    [
      "-i",
      path.join(evidence, "preview-reference.png"),
      "-i",
      extracted,
      "-lavfi",
      "ssim",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const match = ssim.stderr.match(/All:([\d.]+)/);
  assert.ok(match && Number(match[1]) > 0.96, ssim.stderr);
  checks.push(`Preview/export agreement SSIM ${match[1]}`);
  await render.evaluate(() => window.flareRenderer.render(1.5));
  const later = await render.screenshot();
  const ref = fs.readFileSync(path.join(evidence, "preview-reference.png"));
  assert.ok(!ref.equals(later));
  await render.close();
  checks.push("Different timestamps produce visibly changing frames");
  const response = await fetch(base + `/api/exports/${job.id}/subtitles.srt`);
  assert.ok(response.ok);
  assert.match(await response.text(), /一朵云/);
  const exported = await (
    await fetch(base + `/api/exports/${job.id}/project.json`)
  ).json();
  assert.equal(exported.title, "云的循环");
  checks.push(
    "Downloaded subtitles and project snapshot match exported source",
  );
  const before = fs.readFileSync(a.store.file, "utf8");
  const bad = await fetch(base + "/api/projects/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...contentOf(p),
      scenes: [{ ...p.scenes[0], image: "/media/../../secret.png" }],
    }),
  });
  assert.equal(bad.status, 400);
  assert.equal(fs.readFileSync(a.store.file, "utf8"), before);
  checks.push("Unsafe imported paths rejected without mutating saved data");
  for (const [style, aspect, quality, w, h] of [
    ["blueprint", "9:16", 1080, 1080, 1920],
    ["noir", "1:1", 720, 720, 720],
  ]) {
    const { starter } = await import("../shared/model.js");
    const c = starter();
    c.title = style + " matrix";
    c.style = style;
    c.aspect = aspect;
    c.scenes = c.scenes.slice(0, 3).map((s) => ({ ...s, duration: 1 }));
    const m = await request("/api/projects/import", "POST", c);
    const j = await request(`/api/projects/${m.id}/exports`, "POST", {
      quality,
      requestKey: "matrix-" + style,
    });
    await waitFor(
      () =>
        ["done", "failed"].includes(
          a.store.state.exports.find((x) => x.id === j.id)?.status,
        ),
      120,
    );
    const actual = a.store.state.exports.find((x) => x.id === j.id);
    assert.equal(actual.status, "done", actual.error);
    const out = path.join(dir, "exports", j.id, "film.mp4");
    const probe = JSON.parse(
      spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "stream=width,height",
          "-of",
          "json",
          out,
        ],
        { encoding: "utf8" },
      ).stdout,
    );
    assert.equal(probe.streams[0].width, w);
    assert.equal(probe.streams[0].height, h);
    checks.push(`Real export matrix ${style} ${aspect} ${w}x${h}`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.ok(
    !JSON.stringify(await request("/api/settings")).includes("e2e-only"),
  );
  checks.push("No browser exceptions, console errors or secret echo");
  fs.writeFileSync(
    path.join(evidence, "e2e-report.json"),
    JSON.stringify(
      {
        passed: true,
        checks,
        probe: info,
        ssim: Number(match[1]),
        browserErrors: errors,
        consoleErrors,
        liveProviders: "not tested: local HTTP protocol fixtures only",
      },
      null,
      2,
    ),
  );
  console.log(checks.map((c) => "PASS " + c).join("\n"));
} catch (e) {
  if (browser) {
    for (const context of browser.contexts())
      for (const p of context.pages())
        await p
          .screenshot({
            path: path.join(evidence, "failure-" + Date.now() + ".png"),
            fullPage: true,
          })
          .catch(() => {});
  }
  console.error("CHECKS", checks, "ERRORS", errors, consoleErrors);
  throw e;
} finally {
  await browser?.close();
  server?.closeAllConnections();
  server?.close();
  provider?.closeAllConnections();
  provider?.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
