import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createApp } from "../server/app.js";
import { browserPath } from "../server/render.js";
import { contentOf } from "../server/store.js";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flare-delete-"));
const out = path.resolve("docs/verification/project-delete");
fs.mkdirSync(out, { recursive: true });
let browser, server;
const errors = [];
try {
  const a = await createApp({ dir, port: 4334 });
  const first = a.store.state.projects[0];
  const duplicate = a.store.create({ ...contentOf(first), title: "项目副本" });
  server = a.app.listen(4334, "127.0.0.1");
  await once(server, "listening");
  browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4334");
  await page.getByRole("heading", { name: "项目副本", exact: true }).waitFor();
  await page
    .locator(".project-list")
    .getByRole("button", { name: first.title, exact: true })
    .click();
  await page.getByRole("heading", { name: first.title, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: first.title, exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("flare-project")),
    first.id,
  );
  await page
    .locator(".project-list")
    .getByRole("button", { name: "项目副本", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "镜头标题", exact: true })
    .fill("未保存，取消后还在");
  await page.getByRole("button", { name: "删除项目", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "镜头标题", exact: true })
      .inputValue(),
    "未保存，取消后还在",
  );
  assert.equal(a.store.state.projects.length, 2);
  await page.getByRole("button", { name: "删除项目", exact: true }).click();
  a.store.state.exports.push({
    id: "busy",
    projectId: duplicate.id,
    status: "queued",
  });
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(a.store.state.projects.length, 2);
  await page.screenshot({ path: path.join(out, "blocked.png") });
  a.store.state.exports.pop();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(a.store.state.projects.length, 1);
  await page.getByRole("heading", { name: first.title, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: first.title, exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("en");
  await page
    .getByRole("combobox", { name: "Appearance / 外观" })
    .selectOption("dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText(first.title, { exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, "confirm-mobile-en-dark.png") });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  const confirm = page.getByRole("button", {
    name: "Confirm deletion",
    exact: true,
  });
  const bounds = await confirm.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  await confirm.click();
  await page.getByRole("heading", { name: "Start your first film" }).waitFor();
  assert.equal(a.store.state.projects.length, 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("flare-project")),
    null,
  );
  await page.screenshot({ path: path.join(out, "empty-mobile.png") });
  await page.reload();
  await page.getByRole("heading", { name: "Start your first film" }).waitFor();
  await page
    .locator(".main-shell")
    .getByRole("button", { name: "New film", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Script or subject" }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Style library", exact: true })
    .click();
  await page.getByRole("tab", { name: /Flare originals/ }).click();
  await page.getByRole("button", { name: /View style · Paper/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "New film with this style", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Script or subject" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: cancel keeps draft; active-job error retains project; retry succeeds; switches project; last deletion persists; mobile English dark confirmation fits; empty state can create.",
  );
} finally {
  await browser?.close();
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
}
