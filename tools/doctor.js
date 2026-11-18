import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { browserPath } from "../server/render.js";
let failed = false;
function report(ok, label, detail) {
  console.log(`${ok ? "OK" : "FAIL"} ${label}: ${detail}`);
  if (!ok) failed = true;
}
const [major, minor] = process.versions.node.split(".").map(Number);
report(major > 22 || (major === 22 && minor >= 13), "Node.js", process.version);
for (const command of ["ffmpeg", "ffprobe"]) {
  const result = spawnSync(command, ["-version"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  const version = result.stdout?.match(/version (?:n)?(\d+)/);
  report(
    result.status === 0 && Number(version?.[1]) >= 7,
    command,
    result.status === 0
      ? result.stdout.split(/\r?\n/)[0]
      : "Install FFmpeg 7+ and reopen your terminal; ffmpeg and ffprobe must be on PATH.",
  );
}
try {
  const browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  await browser.close();
  report(true, "Chromium", "Renderer launched successfully.");
} catch {
  report(
    false,
    "Chromium",
    "Run npm run setup:browser. Check FLARE_CHROMIUM if you set a custom executable.",
  );
}
report(
  fs.existsSync(new URL("../dist/index.html", import.meta.url)),
  "Build",
  "Run npm run build before npm start.",
);
console.log("No API keys or paid model calls are required by this check.");
process.exitCode = failed ? 1 : 0;
