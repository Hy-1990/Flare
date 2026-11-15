import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getStyle, UPSTREAM_STYLES, STYLE_SOURCE } from "../shared/styles.js";
import { AppError } from "./store.js";

export const sha256 = (b) =>
  crypto.createHash("sha256").update(b).digest("hex");
export function styleCacheRoot(store) {
  return path.join(store.dir, "style-library");
}
function sourceStyle(id) {
  const s = getStyle(id);
  if (!s || s.origin !== "upstream")
    throw new AppError(404, "找不到原项目风格");
  return s;
}
async function fetchBytes(url, max, fetcher = fetch) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new AppError(502, "暂时无法获取原项目资料，请稍后重试");
  const reader = response.body.getReader(),
    parts = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        throw new AppError(502, "风格资料超过允许大小");
      }
      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export async function cacheStyleFile(
  style,
  file,
  cache,
  { fetcher = fetch } = {},
) {
  if (!["STYLE.md", "poster.jpg"].includes(file))
    throw new AppError(400, "不支持的风格资料");
  const target = path.join(cache, style.slug, file),
    digest = file === "STYLE.md" ? style.guideSha256 : style.posterSha256;
  if (fs.existsSync(target)) {
    const b = fs.readFileSync(target);
    if (sha256(b) === digest) return b;
  }
  const bytes = await fetchBytes(
    file === "STYLE.md" ? style.guideUrl : style.posterUrl,
    file === "STYLE.md" ? 128 * 1024 : 4 * 1024 * 1024,
    fetcher,
  );
  if (sha256(bytes) !== digest)
    throw new AppError(502, "原项目资料校验不一致，未写入缓存");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + "." + crypto.randomUUID() + ".tmp";
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, target);
  return bytes;
}
export async function styleGuide(store, id, deps = {}) {
  const s = sourceStyle(id),
    bytes = await cacheStyleFile(s, "STYLE.md", styleCacheRoot(store), deps);
  return {
    id: s.id,
    slug: s.slug,
    markdown: bytes.toString("utf8"),
    sourceUrl: s.guideUrl,
    commit: STYLE_SOURCE.commit,
    license: "CC BY-NC 4.0",
    attribution: `Lemo-Opuscar by Lemomo (LemoLab)${s.author.name !== "Lemomo (LemoLab)" ? " · " + s.author.name : ""}`,
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    upstreamLicenseUrl:
      "https://github.com/lemomo-ai/lemo-opuscar/blob/" +
      STYLE_SOURCE.commit +
      "/LICENSE",
  };
}
export async function styleContext(store, id, deps = {}) {
  const s = getStyle(id);
  if (!s) throw new AppError(400, "风格不存在");
  if (s.origin === "flare")
    return {
      id: s.id,
      name: s.name,
      engine: s.engine,
      mode: s.mode,
      rules: s.desc,
    };
  const g = await styleGuide(store, id, deps);
  const essence = g.markdown
    .split(/^## /m)
    .slice(0, 5)
    .join("\n## ")
    .slice(0, 6000);
  return {
    id: s.id,
    name: s.name,
    en: s.en,
    engine: s.engine,
    mode: s.mode,
    category: s.categoryName,
    rules: essence,
    source: g.sourceUrl,
    scope:
      s.mode === "image"
        ? "本工具使用风格图片加运镜与字幕；不是原样片的完整程序引擎。"
        : "本工具为该风格的程序动画基础版，不承诺原样片所有特性。",
    evidence: s.evidence
      ? "如涉及实测数据、地理事实或仪器结果，必须使用用户提供的真实素材；生成画面只作示意，不得伪造测量与来源。"
      : undefined,
  };
}
export async function syncStyleCache(
  cache,
  { only, fetcher = fetch, posters = true, onProgress = () => {} } = {},
) {
  const styles = only
    ? UPSTREAM_STYLES.filter((s) => s.slug === only)
    : UPSTREAM_STYLES;
  if (!styles.length) throw new AppError(400, "风格不存在");
  const tasks = styles.flatMap((s) =>
    posters
      ? [
          [s, "STYLE.md"],
          [s, "poster.jpg"],
        ]
      : [[s, "STYLE.md"]],
  );
  let completed = 0,
    queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) break;
        await cacheStyleFile(next[0], next[1], cache, { fetcher });
        completed++;
        onProgress(completed, tasks.length);
      }
    }),
  );
  const provenance = {
    ...STYLE_SOURCE,
    styles: styles.map((s) => ({
      id: s.id,
      slug: s.slug,
      guide: s.guideUrl,
      poster: s.posterUrl,
      guideSha256: s.guideSha256,
      posterSha256: s.posterSha256,
    })),
    syncedAt: new Date().toISOString(),
  };
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(
    path.join(cache, "source-manifest.json"),
    JSON.stringify(provenance, null, 2),
  );
  fs.writeFileSync(
    path.join(cache, "NOTICE.txt"),
    "Lemo-Opuscar by Lemomo (LemoLab)\n" +
      STYLE_SOURCE.repository +
      "\nPinned revision: " +
      STYLE_SOURCE.commit +
      "\nMetadata: MIT. STYLE.md: CC BY-NC 4.0; original posters: CC BY 4.0 with third-party exclusions.\nFull terms: " +
      STYLE_SOURCE.repository +
      "/blob/" +
      STYLE_SOURCE.commit +
      "/LICENSE\nContributed styles: Memphis Diorama by EianLu; Crayon World 3D by 2nd1st.\nNo third-party content is relicensed as Flare MIT.\n",
  );
  return provenance;
}
