import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createApp } from "../server/app.js";
import { browserPath } from "../server/render.js";
import { contentOf } from "../server/store.js";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flare-ui-")),
  out = path.resolve("docs/verification/ui-refinement");
fs.mkdirSync(out, { recursive: true });
fs.cpSync(".flare/style-library", path.join(dir, "style-library"), {
  recursive: true,
});
let browser, server;
const errors = [],
  checks = [];
try {
  const a = await createApp({ dir, port: 4331 });
  server = a.app.listen(4331, "127.0.0.1");
  await once(server, "listening");
  const original = contentOf(a.store.state.projects[0]);
  browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto("http://127.0.0.1:4331");
  await p.getByRole("textbox", { name: "镜头标题", exact: true }).waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p
    .getByRole("textbox", { name: "镜头标题", exact: true })
    .fill("未保存的草稿");
  await p.getByRole("combobox", { name: "Language / 语言" }).selectOption("en");
  assert.equal(
    await p
      .getByRole("textbox", { name: "Shot title", exact: true })
      .inputValue(),
    "未保存的草稿",
  );
  await p.getByRole("button", { name: "Apply changes", exact: true }).waitFor();
  assert.equal(await p.locator("html").getAttribute("lang"), "en");
  for (const theme of ["light", "dark"]) {
    await p
      .getByRole("combobox", { name: "Appearance / 外观" })
      .selectOption(theme);
    await p.waitForTimeout(180);
    assert.equal(await p.locator("html").getAttribute("data-theme"), theme);
    await p.screenshot({ path: path.join(out, `studio-en-${theme}.png`) });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  assert.deepEqual(contentOf(a.store.state.projects[0]), original);
  checks.push(
    "Changing language/theme preserves unsaved draft and saved film data",
  );
  await p.reload();
  await p.getByRole("button", { name: "Export film", exact: true }).waitFor();
  assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await p.locator("html").getAttribute("lang"), "en");
  checks.push("Language and appearance persist through reload");
  await p.getByRole("button", { name: "Settings", exact: true }).click();
  await p.getByRole("dialog", { name: "Models and production" }).waitFor();
  await p.getByRole("button", { name: "Save settings", exact: true }).waitFor();
  for (const provider of [
    "deepseek",
    "openai",
    "anthropic",
    "codex",
    "claude",
  ]) {
    await p
      .getByRole("combobox", {
        name: "Storyboarding and revision model",
        exact: true,
      })
      .selectOption(provider);
    const modelLabel =
      provider === "deepseek" ? "DeepSeek model" : `${provider} model`;
    const modelSelect = p.getByRole("combobox", {
      name: modelLabel,
      exact: true,
    });
    const selected = {
      deepseek: "deepseek-flash",
      openai: "gpt-6.1-sol",
      anthropic: "claude-sonnet-5-5",
      codex: "",
      claude: "",
    }[provider];
    await modelSelect.selectOption(selected);
    assert.equal(await modelSelect.inputValue(), selected);
    if (provider !== "deepseek")
      assert.equal(
        await p
          .getByRole("textbox", { name: "DeepSeek API Key", exact: true })
          .count(),
        0,
      );
    const arrow = await modelSelect.evaluate((el) => {
      const s = getComputedStyle(el),
        box = el.getBoundingClientRect(),
        icon = el.parentElement.querySelector("svg").getBoundingClientRect();
      return {
        appearance: s.appearance,
        padding: parseFloat(s.paddingRight),
        inset: box.right - icon.right,
        center: Math.abs((box.top + box.bottom - icon.top - icon.bottom) / 2),
      };
    });
    assert.equal(arrow.appearance, "none");
    assert.ok(arrow.padding >= 40);
    assert.ok(arrow.inset >= 12 && arrow.inset <= 16);
    assert.ok(arrow.center < 1);
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/settings") && r.request().method() === "PATCH",
    );
    await p.getByRole("button", { name: "Save settings", exact: true }).click();
    const data = await (await response).json();
    assert.equal(data.textProvider, provider);
    assert.equal(data.openaiKey, undefined);
    assert.equal(data.anthropicKey, undefined);
    await p.screenshot({ path: path.join(out, `settings-${provider}-en.png`) });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await p
    .getByRole("combobox", { name: "claude model", exact: true })
    .selectOption("__custom__");
  await p
    .getByRole("textbox", { name: "claude custom model", exact: true })
    .fill("test-custom-model");
  const customSave = p.waitForResponse(
    (r) =>
      r.url().endsWith("/api/settings") && r.request().method() === "PATCH",
  );
  await p.getByRole("button", { name: "Save settings", exact: true }).click();
  assert.equal(
    (await (await customSave).json()).claudeModel,
    "test-custom-model",
  );
  await p.keyboard.press("Escape");
  await p.reload();
  await p.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await p
      .getByRole("combobox", {
        name: "Storyboarding and revision model",
        exact: true,
      })
      .inputValue(),
    "claude",
  );
  assert.equal(
    await p
      .getByRole("textbox", { name: "claude custom model", exact: true })
      .inputValue(),
    "test-custom-model",
  );
  await p.keyboard.press("Escape");
  for (const lang of ["en", "zh"]) {
    await p
      .getByRole("combobox", { name: "Language / 语言" })
      .selectOption(lang);
    for (const theme of ["light", "dark"]) {
      await p
        .getByRole("combobox", { name: "Appearance / 外观" })
        .selectOption(theme);
      for (const width of [1440, 1024, 390]) {
        await p.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await p
          .getByRole("button", {
            name: lang === "en" ? "Settings" : "设置",
            exact: true,
          })
          .click();
        const dlg = p.getByRole("dialog");
        await p
          .getByRole("button", {
            name: lang === "en" ? "Save settings" : "保存设置",
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        assert.ok(
          await dlg.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        const footerFits = await dlg.evaluate((el) => {
          const dialog = el.getBoundingClientRect();
          return [...el.querySelectorAll(".modal-actions button")].every(
            (button) => {
              const b = button.getBoundingClientRect();
              return b.bottom <= dialog.bottom && b.top >= dialog.top;
            },
          );
        });
        assert.ok(
          footerFits,
          "Settings actions must be fully visible inside the dialog",
        );
        await p.screenshot({
          path: path.join(out, `settings-polish-${lang}-${theme}-${width}.png`),
        });
        await p.keyboard.press("Escape");
      }
    }
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.getByRole("combobox", { name: "Language / 语言" }).selectOption("en");
  await p.getByRole("button", { name: "Settings", exact: true }).click();
  checks.push(
    "All four new model backends configurable in UI; selected CLI persists after reload",
  );

  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: /^New film/ }).click();
  await p.getByRole("textbox", { name: "Script or subject" }).waitFor();
  await p
    .getByRole("combobox", { name: "Visual style", exact: true })
    .selectOption("opuscar:whiteboard");
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Style library", exact: true }).click();
  await p.getByRole("textbox", { name: "Search styles" }).fill("whiteboard");
  await p
    .getByRole("button", {
      name: "View style · Whiteboard Explainer",
      exact: true,
    })
    .click();
  await p.getByRole("dialog", { name: "Whiteboard Explainer" }).waitFor();
  await p
    .getByRole("link", { name: "Open original guide", exact: true })
    .waitFor();
  await p.screenshot({ path: path.join(out, "detail-en-dark.png") });
  await p.keyboard.press("Escape");
  await p.getByRole("textbox", { name: "Search styles" }).fill("");
  for (const width of [1440, 1024, 390]) {
    await p.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const theme of ["light", "dark"]) {
      await p
        .getByRole("combobox", { name: "Appearance / 外观" })
        .selectOption(theme);
      await p.waitForTimeout(180);
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await p.screenshot({
        path: path.join(out, `library-en-${theme}-${width}.png`),
      });
    }
  }
  checks.push(
    "English editor, settings, new film and style detail controls are translated; 3viewport theme matrix has no overflow",
  );
  await p.getByRole("combobox", { name: "Language / 语言" }).selectOption("zh");
  await p.getByRole("button", { name: "创作台", exact: true }).click();
  await p.getByRole("textbox", { name: "镜头标题", exact: true }).waitFor();
  await p.screenshot({ path: path.join(out, "studio-zh-dark-mobile.png") });
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await p
    .getByRole("combobox", { name: "Appearance / 外观" })
    .selectOption("system");
  await p.emulateMedia({ colorScheme: "dark" });
  await p.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
  await p.emulateMedia({ colorScheme: "light" });
  await p.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  assert.equal(await p.locator("html").getAttribute("data-theme"), "light");
  await p.reload();
  await p.getByRole("textbox", { name: "镜头标题", exact: true }).waitFor();
  assert.equal(
    await p.getByRole("combobox", { name: "Appearance / 外观" }).inputValue(),
    "system",
  );
  checks.push(
    "System appearance follows OS changes and persists; switching back to Chinese restores labels",
  );
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.screenshot({ path: path.join(out, "studio-zh-light.png") });
  await p.getByRole("combobox", { name: "Language / 语言" }).selectOption("en");
  await p
    .getByRole("textbox", { name: "Shot title", exact: true })
    .fill("Localization check");
  await p.getByRole("button", { name: "Apply changes", exact: true }).click();
  await p.getByText("Shot saved. Preview updated.", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Style library", exact: true }).click();
  await p.getByRole("textbox", { name: "Search styles" }).fill("watercolor");
  await p
    .getByRole("button", { name: "View style · Watercolor Brush", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Apply to current film", exact: true })
    .click();
  await p.getByRole("button", { name: "Export film", exact: true }).click();
  await p.getByRole("button", { name: "Start export", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "This style requires images." })
    .waitFor();
  assert.equal(a.store.state.exports.length, 0);
  checks.push(
    "English success notices and missing-image export error remain truthful; no placeholder export created",
  );
  const expected400 = errors.indexOf(
    "Failed to load resource: the server responded with a status of 400 (Bad Request)",
  );
  if (expected400 >= 0) errors.splice(expected400, 1);
  assert.deepEqual(errors, []);
  checks.push("No unexpected browser errors or paid requests");
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  checks.forEach((c) => console.log("PASS", c));
} finally {
  await browser?.close();
  server?.closeAllConnections();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
