import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createApp } from "../server/app.js";
import { contentOf } from "../server/store.js";
import { browserPath } from "../server/render.js";
const root = process.cwd(),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "flare-design-")),
  out = path.resolve(".impeccable/review");
fs.mkdirSync(out, { recursive: true });
fs.cpSync(".flare/style-library", path.join(dir, "style-library"), {
  recursive: true,
});
const screenshots = [],
  findings = [],
  errors = [];
let b, server;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.DREAMAPI_API_KEY;
try {
  const a = await createApp({ dir, port: 4332 }),
    original = contentOf(a.store.state.projects[0]);
  a.store.saveSettings({ dreamapiKey: "fixture-only-not-real-key" });
  server = a.app.listen(4332, "127.0.0.1");
  await once(server, "listening");
  b = await chromium.launch({ executablePath: browserPath(), headless: true });
  const p = await b.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("400 (Bad Request)"))
      errors.push(m.text());
  });
  await p.goto("http://127.0.0.1:4332");
  await p.locator(".studio").waitFor();
  async function configure(width, height, language, theme) {
    await p.setViewportSize({ width, height });
    await p
      .getByRole("combobox", { name: "Language / 语言" })
      .selectOption(language);
    await p
      .getByRole("combobox", { name: "Appearance / 外观" })
      .selectOption(theme);
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => scrollTo(0, 0));
  }
  async function capture(file) {
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => scrollTo(0, 0));
    const audit = await p.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1)
        issues.push("Document overflow");
      const visible = (e) => {
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        return (
          s.display !== "none" &&
          s.visibility !== "hidden" &&
          r.width > 0 &&
          r.height > 0
        );
      };
      const controls = [
        ...document.querySelectorAll(
          ".brand,.breadcrumb,.save-state,.preference-control,.top-actions>.icon-button,.global-export",
        ),
      ].filter(visible);
      for (let i = 0; i < controls.length; i++)
        for (let j = i + 1; j < controls.length; j++) {
          const x = controls[i].getBoundingClientRect(),
            y = controls[j].getBoundingClientRect();
          if (
            Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
            Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
          )
            issues.push(
              "Header collision: " +
                controls[i].className +
                " / " +
                controls[j].className,
            );
        }
      for (const e of document.querySelectorAll(".preference-control select")) {
        if (!visible(e)) continue;
        const c = getComputedStyle(e),
          x = document.createElement("canvas").getContext("2d");
        x.font = c.font;
        const w = x.measureText(e.selectedOptions[0].text).width,
          available =
            e.clientWidth -
            parseFloat(c.paddingLeft) -
            parseFloat(c.paddingRight);
        if (w > available + 1)
          issues.push(
            "Selected preference text clipped: " +
              e.selectedOptions[0].text +
              " " +
              w +
              ">" +
              available,
          );
      }
      for (const e of document.querySelectorAll(".category-nav button")) {
        if (!visible(e)) continue;
        const first = e.firstElementChild.getBoundingClientRect(),
          last = e.lastElementChild.getBoundingClientRect();
        if (first.right > last.left - 4)
          issues.push("Category label/count collide: " + e.textContent);
      }
      for (const e of document.querySelectorAll(".modal-actions .button")) {
        const r = e.getBoundingClientRect(),
          m = e.closest(".modal")?.getBoundingClientRect();
        if (m && r.top < m.bottom && r.bottom > m.bottom + 1)
          issues.push("Dialog action partially clipped: " + e.textContent);
      }
      return {
        issues,
        viewport: [innerWidth, innerHeight],
        language: document.documentElement.lang,
        theme: document.documentElement.dataset.theme,
        font: getComputedStyle(document.body).fontFamily,
      };
    });
    findings.push({ file, ...audit });
    await p.screenshot({ path: path.join(out, file), fullPage: false });
    screenshots.push(file);
  }
  for (const [file, w, h, l, t] of [
    ["desktop.png", 1440, 900, "zh", "light"],
    ["desktop-en-dark.png", 1440, 900, "en", "dark"],
    ["user-1280.png", 1280, 800, "en", "light"],
    ["wide-1600.png", 1600, 1000, "zh", "light"],
    ["tablet-1024.png", 1024, 768, "en", "dark"],
    ["mobile.png", 390, 844, "zh", "light"],
    ["mobile-en-dark.png", 390, 844, "en", "dark"],
    ["compact-720.png", 720, 900, "en", "light"],
  ]) {
    await configure(w, h, l, t);
    await capture(file);
  }
  assert.deepEqual(contentOf(a.store.state.projects[0]), original);
  await configure(1440, 900, "zh", "light");
  await p.getByRole("button", { name: "风格库", exact: true }).click();
  await p.locator(".reference-card").first().waitFor();
  await p
    .locator(".reference-card img")
    .first()
    .evaluate((e) => e.decode());
  await capture("library.png");
  await configure(1280, 800, "en", "light");
  await capture("library-en-1280.png");
  await configure(1440, 900, "zh", "light");
  await p
    .getByRole("textbox", { name: "搜索风格" })
    .fill("no-matching-style-987");
  await capture("library-empty.png");
  await p.getByRole("textbox", { name: "搜索风格" }).fill("whiteboard");
  await p
    .getByRole("button", { name: "查看风格·白板讲解", exact: true })
    .click();
  await p.getByRole("link", { name: "打开规范原文", exact: true }).waitFor();
  await capture("detail.png");
  await p.getByRole("button", { name: "应用到当前短片", exact: true }).hover();
  await capture("detail-hover.png");
  await p.locator(".guide-section details").click();
  await p.locator(".guide-section details").scrollIntoViewIfNeeded();
  await capture("detail-guide.png");
  await p.keyboard.press("Escape");
  await configure(390, 844, "en", "dark");
  await p.getByRole("textbox", { name: "Search styles" }).fill("");
  await capture("library-mobile.png");
  await p.getByRole("textbox", { name: "Search styles" }).fill("watercolor");
  await p
    .getByRole("button", { name: "View style · Watercolor Brush", exact: true })
    .click();
  await p
    .getByRole("link", { name: "Open original guide", exact: true })
    .waitFor();
  await capture("detail-mobile.png");
  await p.keyboard.press("Escape");
  await configure(1280, 800, "en", "light");
  await p.getByRole("button", { name: "Exports", exact: true }).click();
  await capture("exports-empty.png");
  await p.getByRole("button", { name: "Editor", exact: true }).click();
  for (const [button, file] of [
    ["Settings", "settings.png"],
    ["Export film", "export-dialog.png"],
    ["Shortcuts and help", "help.png"],
  ]) {
    await p.getByRole("button", { name: button, exact: true }).click();
    await p.getByRole("dialog").waitFor();
    await capture(file);
    for (let i = 0; i < 30; i++) await p.keyboard.press("Tab");
    assert.ok(
      await p.evaluate(() => !!document.activeElement.closest("[role=dialog]")),
    );
    await p.keyboard.press("Escape");
  }
  await p.getByRole("button", { name: /^New film/ }).click();
  await capture("new-film.png");
  await p.keyboard.press("Escape");
  await configure(390, 844, "en", "dark");
  await p.getByRole("button", { name: "Settings", exact: true }).click();
  await capture("settings-mobile.png");
  await p.keyboard.press("Escape");
  await configure(1280, 800, "en", "light");
  await p.getByRole("combobox", { name: "Language / 语言" }).focus();
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.getByRole("combobox", { name: "Language / 语言" }).selectOption("en");
  await capture("preferences-keyboard.png");
  const missing = contentOf(a.store.state.projects[0]);
  missing.style = "opuscar:watercolor";
  a.store.update(
    a.store.state.projects[0].id,
    a.store.state.projects[0].revision,
    missing,
  );
  await p.reload();
  await p.locator(".production-note").waitFor();
  await p.getByRole("button", { name: "Export film", exact: true }).click();
  await p.getByRole("button", { name: "Start export", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "This style requires images." })
    .waitFor();
  await capture("export-error.png");
  await p.keyboard.press("Escape");
  missing.style = "paper";
  a.store.update(
    a.store.state.projects[0].id,
    a.store.state.projects[0].revision,
    missing,
  );
  const film = a.store.state.projects[0],
    long = contentOf(film);
  long.title =
    "A long film title · 一场跨越山川与日常的旅程，以及一颗种子的漫长故事";
  a.store.update(film.id, film.revision, long);
  await p.reload();
  await p.locator(".studio").waitFor();
  await p
    .locator(".project-heading h1")
    .filter({ hasText: "A long film title" })
    .waitFor();
  await capture("long-title.png");
  await p.getByRole("combobox", { name: "Language / 语言" }).focus();
  await capture("preferences-focus.png");
  fs.writeFileSync(
    path.join(out, "inspection.json"),
    JSON.stringify(
      {
        screenshots,
        findings,
        errors,
        fixture: "isolated temporary projects; no paid account calls",
        date: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        screenshots: screenshots.length,
        findings: findings.filter((x) => x.issues.length),
        errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    findings.filter((f) => f.issues.length),
    [],
  );
} finally {
  await b?.close();
  server?.closeAllConnections();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
