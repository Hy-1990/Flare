import fs from "node:fs";
const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url)),
);
const lock = JSON.parse(
  fs.readFileSync(new URL("../package-lock.json", import.meta.url)),
);
if (pkg.version !== lock.version || pkg.version !== lock.packages[""].version)
  throw Error("Package and lockfile versions must match.");
if (!/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw Error("Use a stable semantic version.");
const notes = fs.readFileSync(
  new URL(`../docs/releases/v${pkg.version}.md`, import.meta.url),
  "utf8",
);
for (const heading of [
  "## Changes",
  "## Installation",
  "## Validation",
  "## Known limitations",
])
  if (!notes.includes(heading)) throw Error(`Release notes need ${heading}`);
if (/[\u3400-\u9fff]/.test(notes))
  throw Error("Release notes must be in English.");
console.log(`v${pkg.version}: version and English release notes are ready.`);
