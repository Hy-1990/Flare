import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { dimensions, totalDuration, makeSrt } from "../shared/model.js";
import { scoreSamples } from "../shared/score.js";
import { AppError, uid, hash, contentOf } from "./store.js";
import { missingShotImages } from "../shared/styles.js";

export function browserPath() {
  if (process.env.FLARE_CHROMIUM) return process.env.FLARE_CHROMIUM;
  const cached = chromium.executablePath();
  if (fs.existsSync(cached)) return cached;
  const root = path.join(
    os.homedir(),
    process.platform === "darwin"
      ? "Library/Caches/ms-playwright"
      : ".cache/ms-playwright",
  );
  if (fs.existsSync(root))
    for (const dir of fs
      .readdirSync(root)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .reverse()) {
      for (const s of [
        "chrome-headless-shell-mac-arm64/chrome-headless-shell",
        "chrome-headless-shell-mac-x64/chrome-headless-shell",
        "chrome-headless-shell-linux64/chrome-headless-shell",
      ]) {
        let p = path.join(root, dir, s);
        if (fs.existsSync(p)) return p;
      }
    }
  throw new AppError(503, "缺少渲染浏览器，请运行 npm run setup:browser");
}
export function wavBuffer(samples, rate = 24000) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    b.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
      44 + i * 2,
    );
  return b;
}
function processDone(child) {
  let err = "";
  child.stderr?.on("data", (d) => {
    err = (err + d).slice(-3000);
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("FFmpeg 未完成编码")),
    );
  });
}
export class ExportQueue {
  constructor(store, { baseUrl, renderer } = {}) {
    this.store = store;
    this.baseUrl = baseUrl;
    this.renderer = renderer;
    this.current = null;
    this.pumping = false;
    this.controllers = new Map();
  }
  enqueue(projectId, { quality = 720, requestKey } = {}) {
    if (![720, 1080].includes(quality))
      throw new AppError(400, "仅支持 720p 或 1080p");
    const p = this.store.project(projectId),
      snapshot = contentOf(p),
      signature = hash({ snapshot, quality }),
      existing =
        requestKey &&
        this.store.state.exports.find(
          (j) =>
            j.projectId === projectId &&
            j.requestKey === requestKey &&
            j.signature === signature,
        );
    const missing = missingShotImages(snapshot);
    if (missing.length)
      throw new AppError(
        400,
        `当前风格使用图片辅助制作，${missing.length} 个镜头尚未添加图片：${missing
          .map((s) => s.title || s.id)
          .slice(0, 3)
          .join("、")}`,
      );
    if (existing) return existing;
    const job = {
      id: uid(),
      projectId,
      projectTitle: p.title,
      revision: p.revision,
      snapshot,
      signature,
      quality,
      requestKey,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    this.store.state.exports.unshift(job);
    this.store.persist();
    queueMicrotask(() => this.pump());
    return job;
  }
  cancel(id) {
    const j = this.store.state.exports.find((j) => j.id === id);
    if (!j) throw new AppError(404, "导出任务不存在");
    if (["queued", "running"].includes(j.status)) {
      j.status = "cancelled";
      this.controllers.get(id)?.abort();
      this.store.cleanPartial(id);
      this.store.persist();
    }
    return j;
  }
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const j = [...this.store.state.exports]
          .reverse()
          .find((j) => j.status === "queued");
        if (!j) break;
        this.current = j;
        const controller = new AbortController();
        this.controllers.set(j.id, controller);
        j.status = "running";
        this.store.persist();
        try {
          await (this.renderer || this.render.bind(this))(j, controller.signal);
          if (j.status !== "cancelled") {
            j.status = "done";
            j.progress = 1;
            j.finishedAt = new Date().toISOString();
            j.url = `/api/exports/${j.id}/film.mp4`;
          }
        } catch (e) {
          if (j.status !== "cancelled") {
            j.status = "failed";
            j.error =
              e instanceof AppError
                ? e.message
                : "导出失败，请检查渲染环境后重试";
          }
        } finally {
          this.store.cleanPartial(j.id);
          this.controllers.delete(j.id);
          this.store.persist();
        }
      }
    } finally {
      this.pumping = false;
      this.current = null;
    }
  }
  async render(job, signal) {
    const p = job.snapshot,
      [w, h] = dimensions(p.aspect, job.quality),
      duration = totalDuration(p),
      frames = Math.ceil(duration * 24),
      dir = path.join(this.store.dir, "exports", job.id);
    fs.mkdirSync(dir, { recursive: true });
    const browser = await chromium.launch({
      headless: true,
      executablePath: browserPath(),
      args: ["--disable-dev-shm-usage"],
    });
    let encoder;
    const abort = () => {
      encoder?.kill("SIGTERM");
      browser.close().catch(() => {});
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) throw Error("cancelled");
      const page = await browser.newPage({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
      });
      // Renderer has fixed trusted code. Model output is never evaluated.
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === new URL(this.baseUrl).origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${this.baseUrl}/renderer.html`);
      await page.waitForFunction(() => !!window.flareRenderer);
      await page.evaluate(
        async ({ p, w, h }) => window.flareRenderer.setProject(p, w, h),
        { p, w, h },
      );
      const raw = path.join(dir, "raw.mp4");
      encoder = spawn(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "image2pipe",
          "-framerate",
          "24",
          "-c:v",
          "mjpeg",
          "-i",
          "-",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "19",
          "-pix_fmt",
          "yuv420p",
          raw,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      const done = processDone(encoder);
      done.catch(() => {});
      let pipeError;
      encoder.stdin.on("error", (e) => (pipeError = e));
      for (let f = 0; f < frames; f++) {
        if (signal.aborted || pipeError) throw Error("encoding interrupted");
        await page.evaluate((t) => window.flareRenderer.render(t), f / 24);
        const bytes = await page.screenshot({ type: "jpeg", quality: 94 });
        if (!encoder.stdin.write(bytes))
          await Promise.race([
            new Promise((r) => encoder.stdin.once("drain", r)),
            done.then(() => {
              throw Error("encoder exited");
            }),
          ]);
        if (f % 24 === 0) {
          job.progress = (f / frames) * 0.9;
          this.store.persist();
        }
      }
      encoder.stdin.end();
      await done;
      await browser.close();
      fs.writeFileSync(
        path.join(dir, "score.wav"),
        wavBuffer(
          p.music
            ? scoreSamples(duration)
            : new Float32Array(Math.ceil(duration * 24000)),
        ),
      );
      const inputs = ["-i", path.join(dir, "score.wav")],
        filters = [],
        voices = [];
      let at = 0,
        input = 1;
      for (const s of p.scenes) {
        if (s.audio) {
          const file = path.join(this.store.dir, s.audio.slice(1));
          const probe = spawnSync(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration",
              "-of",
              "csv=p=0",
              file,
            ],
            { encoding: "utf8" },
          );
          if (probe.status !== 0)
            throw new AppError(400, "无法读取镜头配音，请重新生成或移除");
          const d = Number(probe.stdout.trim());
          if (d > s.duration + 0.15)
            throw new AppError(
              400,
              `镜头「${s.title}」的配音长于镜头，请延长镜头或缩短旁白`,
            );
          inputs.push("-i", file);
          filters.push(
            `[${input}:a]atrim=0:${s.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(at * 1000)}:all=1,volume=0.9[v${input}]`,
          );
          voices.push(`[v${input}]`);
          input++;
        }
        at += s.duration;
      }
      filters.unshift(`[0:a]volume=${voices.length ? 0.32 : 1}[bg]`);
      filters.push(
        `[bg]${voices.join("")}amix=inputs=${voices.length + 1}:duration=first:normalize=0,alimiter=limit=0.9[out]`,
      );
      encoder = spawn(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-i",
          raw,
          ...inputs,
          "-filter_complex",
          filters
            .map((f) =>
              f.replace(/\[(\d+):a\]/g, (_, n) => `[${Number(n) + 1}:a]`),
            )
            .join(";"),
          "-map",
          "0:v",
          "-map",
          "[out]",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          "-t",
          String(duration),
          "-movflags",
          "+faststart",
          path.join(dir, "partial.mp4"),
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      await processDone(encoder);
      if (signal.aborted) throw Error("cancelled");
      fs.renameSync(path.join(dir, "partial.mp4"), path.join(dir, "film.mp4"));
      fs.writeFileSync(path.join(dir, "subtitles.srt"), makeSrt(p));
      fs.writeFileSync(
        path.join(dir, "project.json"),
        JSON.stringify({ format: "flare/v1", ...p }, null, 2),
      );
      const poster = spawn(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-ss",
          "0.8",
          "-i",
          path.join(dir, "film.mp4"),
          "-frames:v",
          "1",
          path.join(dir, "poster.jpg"),
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      await processDone(poster);
    } finally {
      signal.removeEventListener("abort", abort);
      encoder?.kill("SIGTERM");
      await browser.close().catch(() => {});
    }
  }
}
