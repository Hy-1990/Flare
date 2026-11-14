import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ProjectContentSchema, starter } from "../shared/model.js";

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const uid = () => crypto.randomUUID();
export const hash = (v) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function contentOf(p) {
  return ProjectContentSchema.parse(p);
}
export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const s of ["media", "exports"])
      fs.mkdirSync(path.join(dir, s), { recursive: true, mode: 0o700 });
    this.file = path.join(dir, "state.json");
    if (fs.existsSync(this.file))
      this.state = JSON.parse(fs.readFileSync(this.file, "utf8"));
    else {
      this.state = { version: 1, projects: [], exports: [], mediaTasks: [] };
      this.create(starter(), "starter");
    }
    this.settingsFile = path.join(dir, "settings.json");
    this.settings = fs.existsSync(this.settingsFile)
      ? JSON.parse(fs.readFileSync(this.settingsFile, "utf8"))
      : {};
    let changed = false;
    for (const j of this.state.exports)
      if (j.status === "running") {
        j.status = "interrupted";
        j.error = "上次导出被中断，可重新导出";
        changed = true;
        this.cleanPartial(j.id);
      }
    for (const j of this.state.mediaTasks)
      if (["running", "submitting"].includes(j.status)) {
        j.status = j.taskId ? "paused" : "uncertain";
        j.error = j.taskId
          ? "等待恢复查询，不会重复生成"
          : "提交过程被中断，请先在 DreamAPI 控制台核对任务";
        changed = true;
      }
    if (changed) this.persist();
  }
  persist() {
    const tmp = `${this.file}.${uid()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  project(id) {
    const p = this.state.projects.find((p) => p.id === id);
    if (!p) throw new AppError(404, "找不到这个项目");
    return p;
  }
  create(content, source = "local") {
    const c = ProjectContentSchema.parse(content),
      p = {
        ...c,
        id: uid(),
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source,
        history: [],
      };
    this.state.projects.unshift(p);
    this.persist();
    return p;
  }
  update(id, revision, content) {
    const p = this.project(id);
    if (p.revision !== revision)
      throw new AppError(409, "项目已更新，请刷新后重试");
    const c = ProjectContentSchema.parse(content);
    for (const s of p.scenes) {
      const next = c.scenes.find((n) => n.id === s.id);
      if (next && hash(next) !== hash(s))
        p.history.push({ sceneId: s.id, before: structuredClone(s) });
    }
    p.history = p.history.slice(-80);
    Object.assign(p, c);
    this.touch(p);
    return p;
  }
  touch(p) {
    p.revision++;
    p.updatedAt = new Date().toISOString();
    this.persist();
  }
  undo(id, sceneId, revision) {
    const p = this.project(id);
    if (p.revision !== revision)
      throw new AppError(409, "项目已更新，请刷新后重试");
    const i = p.history.findLastIndex((h) => h.sceneId === sceneId),
      s = p.scenes.findIndex((s) => s.id === sceneId);
    if (i < 0 || s < 0) throw new AppError(400, "这个镜头没有可撤销的修改");
    const next = contentOf(p);
    next.scenes[s] = structuredClone(p.history[i].before);
    // Validate the whole resulting film before changing memory or disk.
    // Other shots may have used the duration budget since this edit.
    const validated = ProjectContentSchema.parse(next);
    p.scenes = validated.scenes;
    p.history.splice(i, 1);
    this.touch(p);
    return p;
  }
  keys() {
    return {
      deepseekKey:
        process.env.DEEPSEEK_API_KEY || this.settings.deepseekKey || "",
      dreamapiKey:
        process.env.DREAMAPI_API_KEY || this.settings.dreamapiKey || "",
    };
  }
  publicSettings() {
    const k = this.keys();
    return {
      deepseekConfigured: !!k.deepseekKey,
      dreamapiConfigured: !!k.dreamapiKey,
      model: this.settings.model || "deepseek-flash",
      liveVerification: "尚未进行真实付费接口验收",
    };
  }
  saveSettings(patch) {
    for (const k of ["deepseekKey", "dreamapiKey", "model"])
      if (Object.hasOwn(patch, k)) {
        if (patch[k] === null) delete this.settings[k];
        else this.settings[k] = patch[k];
      }
    const tmp = this.settingsFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.settings), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.settingsFile);
    return this.publicSettings();
  }
  cleanPartial(id) {
    for (const s of ["partial.mp4", "raw.mp4", "score.wav", "mixed.wav"]) {
      const f = path.join(this.dir, "exports", id, s);
      if (fs.existsSync(f)) fs.rmSync(f);
    }
  }
}
