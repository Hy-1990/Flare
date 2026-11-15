import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncStyleCache } from "../server/style-library.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  args = process.argv.slice(2),
  value = (key) => {
    const i = args.indexOf(key);
    return i < 0 ? undefined : args[i + 1];
  };
const cache =
  value("--cache") ||
  path.join(
    process.env.FLARE_DATA_DIR || path.join(root, ".flare"),
    "style-library",
  );
try {
  const result = await syncStyleCache(cache, {
    only: value("--only"),
    posters: !args.includes("--guides-only"),
    onProgress: (n, total) => {
      if (n % 20 === 0 || n === total) console.log(`Synced ${n}/${total}`);
    },
  });
  console.log(
    `Ready: ${result.styles.length} style(s), revision ${result.commit}`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
