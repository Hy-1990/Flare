import express from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import {
  BriefSchema,
  ProjectContentSchema,
  localPlan,
  makeSrt,
} from "../shared/model.js";
import { Store, AppError, uid, contentOf, hash } from "./store.js";
import {
  DreamProvider,
  planDeepseek,
  rewriteDeepseek,
  imageExtension,
} from "./providers.js";
import { ExportQueue, browserPath } from "./render.js";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const Settings = z
  .object({
    deepseekKey: z.union([z.string().min(8).max(400), z.null()]).optional(),
    dreamapiKey: z.union([z.string().min(8).max(400), z.null()]).optional(),
    model: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]{1,80}$/)
      .optional(),
  })
  .strict();
export async function createApp({
  dir,
  port = 4317,
  dev = false,
  providerDeps = {},
  renderFn,
  root = process.cwd(),
} = {}) {
  const app = express(),
    store = new Store(dir || path.join(root, ".flare")),
    dream = new DreamProvider(store, providerDeps),
    queue = new ExportQueue(store, {
      baseUrl: `http://127.0.0.1:${port}`,
      renderer: renderFn,
    });
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host))
      return res.status(403).json({ error: "仅允许本机访问" });
    const origin = req.headers.origin;
    if (origin) {
      let u;
      try {
        u = new URL(origin);
      } catch {
        return res.status(403).json({ error: "来源无效" });
      }
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
        u.port !== String(port)
      )
        return res.status(403).json({ error: "不允许跨站请求" });
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "16mb" }));
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  const safeProject = (p) => ({
    ...p,
    history: undefined,
    canUndo: [...new Set(p.history.map((h) => h.sceneId))],
  });
  const mediaExists = (c) => {
    for (const s of c.scenes)
      for (const field of ["image", "audio"])
        if (s[field] && !fs.existsSync(path.join(store.dir, s[field].slice(1))))
          throw new AppError(400, "项目引用了不存在的本地素材，请先移除该素材");
  };
  app.get("/api/health", (_req, res) => {
    let browser = false;
    try {
      browser = !!browserPath();
    } catch {}
    res.json({
      ok: true,
      version: "0.1.0",
      ffmpeg:
        spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0,
      browser,
      localOnly: true,
    });
  });
  app.get("/api/settings", (_req, res) => res.json(store.publicSettings()));
  app.patch(
    "/api/settings",
    wrap((req, res) => res.json(store.saveSettings(Settings.parse(req.body)))),
  );
  app.get("/api/projects", (_req, res) =>
    res.json(store.state.projects.map(safeProject)),
  );
  app.get(
    "/api/projects/:id",
    wrap((req, res) =>
      res.json(safeProject(store.project(ID.parse(req.params.id)))),
    ),
  );
  app.post(
    "/api/projects",
    wrap(async (req, res) => {
      const brief = BriefSchema.parse(req.body);
      const content =
        brief.mode === "local"
          ? localPlan(brief)
          : await planDeepseek(
              brief,
              store.keys().deepseekKey,
              store.settings.model,
              providerDeps,
            );
      res.status(201).json(safeProject(store.create(content, brief.mode)));
    }),
  );
  app.post(
    "/api/projects/import",
    wrap((req, res) => {
      const content = ProjectContentSchema.parse(req.body);
      mediaExists(content);
      res.status(201).json(safeProject(store.create(content, "import")));
    }),
  );
  app.patch(
    "/api/projects/:id",
    wrap((req, res) => {
      const b = z
        .object({
          revision: z.number().int().positive(),
          content: ProjectContentSchema,
        })
        .parse(req.body);
      mediaExists(b.content);
      res.json(
        safeProject(
          store.update(ID.parse(req.params.id), b.revision, b.content),
        ),
      );
    }),
  );
  app.post(
    "/api/projects/:id/undo/:sceneId",
    wrap((req, res) =>
      res.json(
        safeProject(
          store.undo(
            ID.parse(req.params.id),
            ID.parse(req.params.sceneId),
            z.object({ revision: z.number().int().positive() }).parse(req.body)
              .revision,
          ),
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:id/scenes/:sceneId/rewrite",
    wrap(async (req, res) => {
      const { instruction } = z
          .object({ instruction: z.string().trim().min(2).max(2000) })
          .parse(req.body),
        id = ID.parse(req.params.id),
        sceneId = ID.parse(req.params.sceneId),
        p = store.project(id),
        s = p.scenes.find((s) => s.id === sceneId);
      if (!s) throw new AppError(404, "镜头不存在");
      const signature = hash(s),
        next = await rewriteDeepseek(
          structuredClone(s),
          instruction,
          store.keys().deepseekKey,
          store.settings.model,
          providerDeps,
        ),
        current = store.project(id),
        target = current.scenes.find((s) => s.id === sceneId);
      if (!target || hash(target) !== signature)
        throw new AppError(409, "镜头已修改，本次 AI 结果未覆盖你的新内容");
      const content = contentOf(current);
      content.scenes = content.scenes.map((s) => (s.id === sceneId ? next : s));
      res.json(safeProject(store.update(id, current.revision, content)));
    }),
  );
  app.post(
    "/api/projects/:id/duplicate",
    wrap((req, res) => {
      const p = store.project(ID.parse(req.params.id));
      res
        .status(201)
        .json(
          safeProject(
            store.create(
              { ...contentOf(p), title: p.title.slice(0, 74) + " · 副本" },
              "duplicate",
            ),
          ),
        );
    }),
  );
  app.get(
    "/api/projects/:id/project.json",
    wrap((req, res) => {
      const p = store.project(ID.parse(req.params.id));
      res
        .attachment("flare-project.json")
        .json({ format: "flare/v1", ...contentOf(p) });
    }),
  );
  app.get(
    "/api/projects/:id/subtitles.srt",
    wrap((req, res) =>
      res
        .attachment("subtitles.srt")
        .type("text/plain")
        .send(makeSrt(store.project(ID.parse(req.params.id)))),
    ),
  );
  app.post(
    "/api/assets",
    wrap((req, res) => {
      const b = z
        .object({ data: z.string().max(15 * 1024 * 1024) })
        .parse(req.body);
      const bytes = Buffer.from(b.data, "base64");
      if (bytes.length > 10 * 1024 * 1024)
        throw new AppError(400, "图片不能超过 10 MB");
      const ext = imageExtension(bytes),
        name = `${uid()}.${ext}`;
      fs.writeFileSync(path.join(store.dir, "media", name), bytes);
      res.status(201).json({ url: `/media/${name}` });
    }),
  );
  app.get(
    "/media/:name",
    wrap((req, res) => {
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp|wav|mp3|m4a)$/.test(req.params.name))
        throw new AppError(404, "素材不存在");
      res.sendFile(path.join(store.dir, "media", req.params.name));
    }),
  );
  app.get("/api/exports", (_req, res) =>
    res.json(store.state.exports.map(({ snapshot, ...j }) => j)),
  );
  app.post(
    "/api/projects/:id/exports",
    wrap((req, res) => {
      const b = z
        .object({
          quality: z.union([z.literal(720), z.literal(1080)]).default(720),
          requestKey: z.string().max(80),
        })
        .parse(req.body);
      const { snapshot, ...j } = queue.enqueue(ID.parse(req.params.id), b);
      res.status(202).json(j);
    }),
  );
  app.post(
    "/api/exports/:id/cancel",
    wrap((req, res) => {
      const { snapshot, ...j } = queue.cancel(ID.parse(req.params.id));
      res.json(j);
    }),
  );
  app.get(
    "/api/exports/:id/:file",
    wrap((req, res) => {
      const j = store.state.exports.find(
        (j) => j.id === ID.parse(req.params.id),
      );
      if (!j || j.status !== "done") throw new AppError(404, "成片尚未完成");
      if (
        !["film.mp4", "subtitles.srt", "project.json", "poster.jpg"].includes(
          req.params.file,
        )
      )
        throw new AppError(404, "文件不存在");
      res.download(
        path.join(store.dir, "exports", j.id, req.params.file),
        req.params.file,
      );
    }),
  );
  app.get("/api/media-tasks", (_req, res) => res.json(store.state.mediaTasks));
  app.post(
    "/api/projects/:id/scenes/:sceneId/generate",
    wrap(async (req, res) => {
      const b = z
        .object({ kind: z.enum(["image", "audio"]), confirmPaid: z.boolean() })
        .parse(req.body);
      res
        .status(202)
        .json(
          await dream.start(
            ID.parse(req.params.id),
            ID.parse(req.params.sceneId),
            b.kind,
            b.confirmPaid,
          ),
        );
    }),
  );
  app.post(
    "/api/media-tasks/:id/resume",
    wrap((req, res) => {
      const id = ID.parse(req.params.id),
        t = store.state.mediaTasks.find((t) => t.id === id);
      if (!t) throw new AppError(404, "任务不存在");
      if (!t.taskId)
        throw new AppError(400, "提交结果不确定，请先到控制台核对");
      dream.poll(id).catch(() => {});
      res.json(t);
    }),
  );
  app.post(
    "/api/media-tasks/:id/acknowledge",
    wrap((req, res) => {
      const { confirmConsoleReviewed } = z
          .object({ confirmConsoleReviewed: z.literal(true) })
          .parse(req.body),
        t = store.state.mediaTasks.find(
          (t) => t.id === ID.parse(req.params.id),
        );
      if (!t || t.status !== "uncertain")
        throw new AppError(400, "只有提交结果不确定的任务需要核对");
      t.status = "acknowledged";
      t.error = "已确认控制台状态；再次生成仍需单独确认付费";
      store.persist();
      res.json(t);
    }),
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  if (dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(root, "dist"), { index: false }));
    app.get("/renderer.html", (_req, res) =>
      res.sendFile(path.join(root, "dist", "renderer.html")),
    );
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(root, "dist", "index.html")),
    );
  }
  app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error:
          "输入格式不正确：" +
          err.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .slice(0, 3)
            .join("；"),
      });
    if (err instanceof AppError)
      return res.status(err.status).json({ error: err.message });
    if (err.type === "entity.too.large")
      return res.status(413).json({ error: "文件过大" });
    if (err instanceof SyntaxError && "body" in err)
      return res.status(400).json({ error: "JSON 格式无效" });
    res
      .status(500)
      .json({ error: "操作未完成，请重试。已有项目仍保存在本机。" });
  });
  return { app, store, queue, dream };
}
