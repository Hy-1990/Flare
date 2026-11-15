import {
  t as tr,
  usePreferences,
  setPreferences,
  styleName,
  errorText,
} from "./preferences";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Aperture,
  Clapperboard,
  Layers3,
  Download,
  Plus,
  Settings2,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  Volume2,
  VolumeX,
  MoreHorizontal,
  Check,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Undo2,
  ImagePlus,
  Upload,
  FileText,
  X,
  LoaderCircle,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Film,
  FolderOpen,
  PanelRight,
  Keyboard,
  ExternalLink,
  SlidersHorizontal,
  Sun,
  Moon,
  Monitor,
  Languages,
} from "lucide-react";
import {
  STYLES,
  totalDuration,
  sceneAt,
  timecode,
  dimensions,
} from "../shared/model.js";
import { drawFilm, preload } from "../shared/film.js";
import { scoreSamples } from "../shared/score.js";
import { api, send } from "./api";
import type {
  Project,
  Scene,
  Job,
  Settings,
  MediaTask,
  Style,
  Aspect,
} from "./types";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import Modal from "./Modal";
import StyleLibrary, { StylePicker } from "./StyleLibrary";
import { getStyle, missingShotImages } from "../shared/styles.js";

function Thumbnail({
  project,
  time = 1,
  className = "",
}: {
  project: Project;
  time?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    preload(project)
      .then(() => {
        if (alive && ref.current)
          drawFilm(ref.current, project, time, { thumbnail: true });
      })
      .catch(() => {
        if (alive && ref.current)
          drawFilm(ref.current, project, time, { thumbnail: true });
      });
    return () => {
      alive = false;
    };
  }, [project, time]);
  return (
    <canvas
      ref={ref}
      width={480}
      height={270}
      className={className}
      aria-hidden="true"
    />
  );
}
function App() {
  const preferences = usePreferences();
  const [projects, setProjects] = useState<Project[]>([]),
    [id, setId] = useState<string | null>(null),
    [view, setView] = useState("studio"),
    [settings, setSettings] = useState<Settings | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [tasks, setTasks] = useState<MediaTask[]>([]),
    [loading, setLoading] = useState(true);
  const [newStyle, setNewStyle] = useState<Style>("paper"),
    [modal, setModal] = useState<"new" | "settings" | "export" | "help" | null>(
      null,
    ),
    [paid, setPaid] = useState<"image" | "audio" | null>(null),
    [selected, setSelected] = useState(0),
    [draft, setDraft] = useState<Scene | null>(null),
    [time, setTime] = useState(0.8),
    [playing, setPlaying] = useState(false),
    [sound, setSound] = useState(false),
    [seekVersion, setSeekVersion] = useState(0),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [inspector, setInspector] = useState(true),
    [aiInstruction, setAiInstruction] = useState(""),
    [aiBusy, setAiBusy] = useState(false);
  const sceneBase = useRef<Scene | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    audioRef = useRef<HTMLAudioElement>(null),
    timeRef = useRef(time);
  const project = projects.find((p) => p.id === id) || projects[0],
    duration = project ? totalDuration(project) : 0,
    scene = project?.scenes[selected],
    dirty = !!(
      scene &&
      draft &&
      JSON.stringify(scene) !== JSON.stringify(draft)
    );
  const toast = useCallback(
    (text: string, error = false) => setNotice({ text, error }),
    [],
  );
  const closeModal = useCallback(() => setModal(null), []);
  const putProject = (p: Project) =>
    setProjects((old) =>
      old.some((x) => x.id === p.id)
        ? old.map((x) => (x.id === p.id ? p : x))
        : [p, ...old],
    );
  useEffect(() => {
    Promise.all([
      api<Project[]>("/api/projects"),
      api<Settings>("/api/settings"),
      api<Job[]>("/api/exports"),
      api<MediaTask[]>("/api/media-tasks"),
    ])
      .then(([ps, s, js, ts]) => {
        setProjects(ps);
        setId(
          ps.find((p) => p.id === localStorage.getItem("flare-project"))?.id ||
            ps[0]?.id ||
            null,
        );
        setSettings(s);
        setJobs(js);
        setTasks(ts);
      })
      .catch((e) => toast(e.message, true))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => {
    if (id) localStorage.setItem("flare-project", id);
  }, [id]);
  useEffect(() => {
    const before = sceneBase.current;
    setDraft((prev) => {
      if (!scene) return null;
      const keep =
        before?.id === scene.id &&
        prev?.id === scene.id &&
        JSON.stringify(prev) !== JSON.stringify(before);
      return keep ? prev : { ...scene };
    });
    sceneBase.current = scene ? { ...scene } : null;
  }, [scene]);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const tick = setInterval(() => {
      api<Job[]>("/api/exports")
        .then(setJobs)
        .catch(() => {});
      api<MediaTask[]>("/api/media-tasks")
        .then((next) => {
          setTasks((old) => {
            if (
              JSON.stringify(old) !== JSON.stringify(next) &&
              next.some((t) => t.status === "done")
            )
              api<Project[]>("/api/projects")
                .then(setProjects)
                .catch(() => {});
            return next;
          });
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!playing || !project) return;
    let frame: number,
      last = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + (now - last) / 1000;
      last = now;
      if (next >= duration) {
        timeRef.current = duration;
        setTime(duration);
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      setTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, project?.id]);
  useEffect(() => {
    if (!sound || !playing || !project || !project.music) return;
    const ctx = new AudioContext(),
      buffer = ctx.createBuffer(1, Math.ceil(duration * 24000), 24000);
    buffer.copyToChannel(scoreSamples(duration), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, Math.min(timeRef.current, duration - 0.001));
    return () => {
      source.stop();
      ctx.close();
    };
  }, [sound, playing, project?.music, project?.id, duration, seekVersion]);
  const current = project
    ? sceneAt(project, Math.min(time, duration - 0.001))
    : null;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing || !sound || !current?.scene.audio) {
      audio.pause();
      return;
    }
    audio.src = current.scene.audio;
    audio.currentTime = current.local;
    audio.volume = 0.9;
    audio.play().catch(() => {});
    return () => audio.pause();
  }, [playing, sound, current?.scene.id, current?.scene.audio, seekVersion]);
  const seek = (t: number) => {
    timeRef.current = t;
    setTime(t);
    setSeekVersion((n) => n + 1);
  };
  const togglePlay = () => {
    if (timeRef.current >= duration - 0.05) seek(0);
    setPlaying((v) => !v);
  };
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (
        modal ||
        paid ||
        document.querySelector('[role="dialog"]') ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        if (project) togglePlay();
      }
      if (e.key === "ArrowRight" && project) {
        e.preventDefault();
        seek(Math.min(duration, timeRef.current + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, timeRef.current - 1));
      }
      if (e.key === "?") setModal("help");
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewStyle("paper");
        setModal("new");
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [modal, paid, project, duration]);
  async function update(content: Partial<Project>, base = project) {
    if (!base) return;
    setSaving(true);
    try {
      const p = await api<Project>(
        `/api/projects/${base.id}`,
        send("PATCH", {
          revision: base.revision,
          content: { ...base, ...content },
        }),
      );
      putProject(p);
      return p;
    } catch (e) {
      toast((e as Error).message, true);
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function saveDraft() {
    if (!dirty || !draft) return project;
    const p = await update({
      scenes: project.scenes.map((s, i) => (i === selected ? draft : s)),
    });
    if (p) toast(tr("镜头已保存，预览已更新"));
    return p;
  }
  async function chooseScene(i: number) {
    if (dirty && !(await saveDraft())) return;
    setSelected(i);
    setDraft({ ...project.scenes[i] });
    setPlaying(false);
    seek(project.scenes.slice(0, i).reduce((n, s) => n + s.duration, 0) + 0.8);
  }
  async function chooseProject(p: Project) {
    if (dirty && !(await saveDraft())) return;
    setId(p.id);
    setSelected(0);
    setPlaying(false);
    seek(0.8);
    setView("studio");
  }
  async function moveScene(dir: number) {
    if (!scene) return;
    const base = dirty ? await saveDraft() : project;
    if (!base) return;
    const arr = [...base.scenes],
      idx = selected + dir;
    if (idx < 0 || idx >= arr.length) return;
    [arr[selected], arr[idx]] = [arr[idx], arr[selected]];
    if (await update({ scenes: arr }, base)) {
      setSelected(idx);
      seek(arr.slice(0, idx).reduce((n, s) => n + s.duration, 0) + 0.8);
    }
  }
  async function addScene() {
    const base = dirty ? await saveDraft() : project;
    if (!base) return;
    const s: Scene = {
      id: crypto.randomUUID(),
      title: tr("新的镜头"),
      narration: tr("在这里写下旁白。"),
      visual: tr("描述你希望出现的画面。"),
      art: "landscape",
      duration: 5,
      accent: "#df6a44",
    };
    if (await update({ scenes: [...base.scenes, s] }, base)) {
      setSelected(base.scenes.length);
      seek(totalDuration(base) + 0.8);
    }
  }
  async function deleteScene() {
    if (project.scenes.length <= 1) return;
    const arr = project.scenes.filter((_, i) => i !== selected);
    if (await update({ scenes: arr })) {
      setSelected(Math.max(0, selected - 1));
      seek(0);
    }
  }
  async function undo() {
    try {
      putProject(
        await api<Project>(
          `/api/projects/${project.id}/undo/${scene.id}`,
          send("POST", { revision: project.revision }),
        ),
      );
      toast(tr("已撤销此镜头的上一次修改"));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function uploadImage(file: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error(tr("图片不能超过 10 MB"));
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const { url } = await api("/api/assets", send("POST", { data }));
      setDraft((d) => (d ? { ...d, image: url } : d));
      toast(tr("图片已导入，应用修改后进入成片"));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function importProject(file: File) {
    try {
      if (file.size > 1024 * 1024) throw Error(tr("项目文件不能超过 1 MB"));
      const data = JSON.parse(await file.text());
      const p = await api<Project>("/api/projects/import", send("POST", data));
      putProject(p);
      setId(p.id);
      setSelected(0);
      setView("studio");
      seek(0.8);
      toast(tr("项目已导入"));
    } catch (e) {
      toast(tr("导入失败：") + (e as Error).message, true);
    }
  }
  async function generate() {
    if (!paid || !scene) return;
    const kind = paid;
    setPaid(null);
    if (dirty && !(await saveDraft())) return;
    try {
      const t = await api<MediaTask>(
        `/api/projects/${project.id}/scenes/${scene.id}/generate`,
        send("POST", { kind, confirmPaid: true }),
      );
      setTasks((old) => [t, ...old.filter((x) => x.id !== t.id)]);
      toast(
        kind === "image"
          ? tr("画面任务已提交，约需 30 秒至 1 分钟")
          : tr("配音任务已提交，约需 10–30 秒"),
      );
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <Aperture />
        <span>{tr("正在打开 Flare")}</span>
      </div>
    );
  const projectJobs = jobs.filter((j) => j.projectId === project?.id),
    activeJob = projectJobs.find((j) =>
      ["queued", "running"].includes(j.status),
    );
  const currentTasks = tasks.filter(
    (t) => t.projectId === project?.id && t.sceneId === scene?.id,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setView("studio")}
          aria-label={tr("Flare 创作台")}
        >
          <Aperture className="brand-mark" />
          <span>
            Flare<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">
          {tr("个人工作空间")}
          <span>{tr("本地")}</span>
        </div>
        <button
          className="new-project"
          onClick={() => {
            setNewStyle("paper");
            setModal("new");
          }}
        >
          <Plus />
          {tr("新建短片")}
          <kbd>N</kbd>
        </button>
        <nav aria-label={tr("主导航")}>
          {[
            { id: "studio", icon: Clapperboard, label: tr("创作台") },
            { id: "styles", icon: Layers3, label: tr("风格库") },
            { id: "exports", icon: Download, label: tr("导出记录") },
          ].map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <item.icon />
              {item.label}
              {item.id === "exports" && jobs.length > 0 && (
                <span className="nav-count">{jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="section-heading">
          <span>{tr("最近项目")}</span>
          <button
            className="small-icon"
            aria-label={tr("导入项目")}
            onClick={() => importInput.current?.click()}
          >
            <Upload />
          </button>
        </div>
        <div className="project-list">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`project-link ${project?.id === p.id ? "chosen" : ""}`}
              onClick={() => chooseProject(p)}
            >
              <Film />
              <span>{p.title}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <button
            className="provider-summary"
            onClick={() => setModal("settings")}
          >
            <span
              className={`status-dot ${settings?.deepseekConfigured ? "connected" : ""}`}
            />
            <span>
              {settings?.deepseekConfigured
                ? tr("DeepSeek 已配置")
                : tr("本地制作模式")}
            </span>
            <Settings2 />
          </button>
          <div className="footer-links">
            <span>Flare v0.1</span>
            <button
              onClick={() => setModal("help")}
              aria-label={tr("快捷键和使用说明")}
            >
              <Keyboard />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{tr("工作空间")}</span>
            <ChevronRight />
            <span>
              {view === "studio"
                ? tr("创作台")
                : view === "styles"
                  ? tr("风格库")
                  : tr("导出记录")}
            </span>
          </div>
          <div className="top-actions">
            <div className="display-preferences">
              <label className="preference-control">
                <Languages aria-hidden="true" />
                <span className="sr-only">
                  {preferences.language === "en"
                    ? "Interface language"
                    : "界面语言"}
                </span>
                <select
                  aria-label="Language / 语言"
                  value={preferences.language}
                  onChange={(e) =>
                    setPreferences({ language: e.target.value as "zh" | "en" })
                  }
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="preference-control appearance-control">
                {preferences.appearance === "dark" ? (
                  <Moon aria-hidden="true" />
                ) : preferences.appearance === "light" ? (
                  <Sun aria-hidden="true" />
                ) : (
                  <Monitor aria-hidden="true" />
                )}
                <span className="sr-only">
                  {preferences.language === "en" ? "Appearance" : "外观"}
                </span>
                <select
                  aria-label="Appearance / 外观"
                  value={preferences.appearance}
                  onChange={(e) =>
                    setPreferences({
                      appearance: e.target.value as "light" | "dark" | "system",
                    })
                  }
                >
                  <option value="system">
                    {preferences.language === "en" ? "System" : "跟随系统"}
                  </option>
                  <option value="light">
                    {preferences.language === "en" ? "Light" : "白天"}
                  </option>
                  <option value="dark">
                    {preferences.language === "en" ? "Dark" : "黑夜"}
                  </option>
                </select>
              </label>
            </div>
            <span className="save-state">
              {saving ? (
                <LoaderCircle className="spin" />
              ) : dirty ? (
                <AlertCircle />
              ) : (
                <Check />
              )}
              {saving
                ? tr("正在保存")
                : dirty
                  ? tr("镜头修改待应用")
                  : tr("更改保存在本机")}
            </span>
            <button
              className="icon-button"
              aria-label={tr("设置")}
              onClick={() => setModal("settings")}
            >
              <Settings2 />
            </button>
          </div>
        </header>
        {project && view === "studio" && (
          <main className="studio">
            <div className="project-heading">
              <div>
                <h1>{project.title}</h1>
                <div className="project-meta">
                  <span>{styleName(getStyle(project.style))}</span>
                  <i />{" "}
                  <span>
                    {project.scenes.length}
                    {tr("个镜头")}
                  </span>
                  <i />
                  <span>{timecode(duration)}</span>
                  <i />
                  <span>
                    {project.source === "deepseek"
                      ? tr("DeepSeek 分镜")
                      : tr("本地分镜")}
                  </span>
                </div>
              </div>
              <div className="heading-actions">
                <button
                  className="button secondary compact"
                  onClick={async () => {
                    if (dirty && !(await saveDraft())) return;
                    try {
                      const p = await api<Project>(
                        `/api/projects/${project.id}/duplicate`,
                        send("POST"),
                      );
                      putProject(p);
                      setId(p.id);
                      setSelected(0);
                      setPlaying(false);
                      seek(0.8);
                      toast(tr("已创建项目副本"));
                    } catch (e) {
                      toast((e as Error).message, true);
                    }
                  }}
                  title={tr("复制项目")}
                >
                  <Copy />
                  <span>{tr("副本")}</span>
                </button>
                <button
                  className="button primary"
                  onClick={async () => {
                    if (dirty && !(await saveDraft())) return;
                    setPlaying(false);
                    setModal("export");
                  }}
                >
                  <Download />
                  {tr("导出短片")}
                </button>
              </div>
            </div>
            <div
              className={`editing-desk ${!inspector ? "inspector-hidden" : ""}`}
            >
              <section className="viewer-column">
                <div className="viewer-toolbar">
                  <span>
                    <span className="little-square" />
                    {tr("影片预览")}
                  </span>
                  <div>
                    <label className="inline-select">
                      <span className="sr-only">{tr("画幅")}</span>
                      <select
                        aria-label={tr("画幅")}
                        value={project.aspect}
                        disabled={saving}
                        onChange={(e) => {
                          setPlaying(false);
                          const aspect = e.target.value as Aspect;
                          (async () => {
                            const base = dirty ? await saveDraft() : project;
                            if (base) await update({ aspect }, base);
                          })();
                        }}
                      >
                        <option>16:9</option>
                        <option>9:16</option>
                        <option>1:1</option>
                      </select>
                      <ChevronDown />
                    </label>
                    <button
                      className={`small-icon ${inspector ? "selected" : ""}`}
                      aria-label={tr("切换镜头面板")}
                      onClick={() => setInspector((v) => !v)}
                    >
                      <PanelRight />
                    </button>
                  </div>
                </div>
                {missingShotImages(project).length > 0 && (
                  <div className="production-note">
                    <ImagePlus />
                    <span>
                      {tr("图片辅助制作 ·")}
                      {missingShotImages(project).length}{" "}
                      {tr(
                        "个镜头还需要图片。请逐镜头导入或生成素材，补齐后才能导出。",
                      )}
                    </span>
                  </div>
                )}
                <FilmViewer project={project} time={time} />
                <div className="transport">
                  <button
                    className="icon-button"
                    aria-label={tr("回到开头")}
                    onClick={() => {
                      setPlaying(false);
                      seek(0);
                    }}
                  >
                    <SkipBack />
                  </button>
                  <button
                    className="play-button"
                    aria-label={playing ? tr("暂停") : tr("播放")}
                    onClick={togglePlay}
                  >
                    {playing ? <Pause /> : <Play />}
                  </button>
                  <span className="timecode">
                    {timecode(time)}
                    <span> / {timecode(duration)}</span>
                  </span>
                  <input
                    className="scrubber"
                    aria-label={tr("播放位置")}
                    type="range"
                    min="0"
                    max={duration}
                    step="0.05"
                    value={Math.min(time, duration)}
                    onChange={(e) => seek(Number(e.target.value))}
                  />
                  <button
                    className="icon-button"
                    aria-label={sound ? tr("静音") : tr("打开声音")}
                    onClick={() => setSound((v) => !v)}
                  >
                    {sound ? <Volume2 /> : <VolumeX />}
                  </button>
                  <span className="fps">24 fps</span>
                </div>
                <div className="preview-note">
                  <span>{current?.scene.title}</span>
                  <button
                    className="score-toggle"
                    aria-label={tr("切换背景配乐")}
                    aria-pressed={project.music}
                    onClick={async () => {
                      const base = dirty ? await saveDraft() : project;
                      if (base) await update({ music: !base.music }, base);
                    }}
                  >
                    {project.music ? <Volume2 /> : <VolumeX />}
                    {project.music
                      ? tr("原创程序配乐")
                      : tr("无背景音乐")} ·{" "}
                    {project.scenes.some((s) => s.audio)
                      ? tr("含配音")
                      : tr("字幕叙事")}
                  </button>
                </div>
              </section>
              {inspector && draft && (
                <aside className="inspector">
                  <div className="inspector-head">
                    <div>
                      <SlidersHorizontal />
                      <h2>{tr("镜头设置")}</h2>
                    </div>
                    <span className="mono">
                      {String(selected + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="inspector-scroll">
                    <div className="field-row">
                      <label>
                        {tr("时长")}
                        <span>{tr("秒")}</span>
                        <input
                          aria-label={tr("镜头时长")}
                          type="number"
                          min="1"
                          max="30"
                          step="0.5"
                          value={draft.duration}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              duration: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        {tr("强调色")}
                        <input
                          aria-label={tr("强调色")}
                          type="color"
                          value={draft.accent}
                          onChange={(e) =>
                            setDraft({ ...draft, accent: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="field">
                      {tr("镜头标题")}
                      <input
                        aria-label={tr("镜头标题")}
                        value={draft.title}
                        maxLength={40}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      {tr("旁白与字幕")}
                      <textarea
                        aria-label={tr("旁白与字幕")}
                        rows={3}
                        maxLength={300}
                        value={draft.narration}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            narration: e.target.value,
                            audio: undefined,
                          })
                        }
                      />
                      <span className="field-hint">
                        {draft.narration.length / draft.duration > 7
                          ? tr("字幕较密，建议延长镜头或精简旁白")
                          : tr("没有配音时，旁白以字幕呈现")}
                      </span>
                    </label>
                    <label className="field">
                      {tr("画面描述")}
                      <textarea
                        aria-label={tr("画面描述")}
                        rows={3}
                        maxLength={1200}
                        value={draft.visual}
                        onChange={(e) =>
                          setDraft({ ...draft, visual: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      {tr("动画组件")}
                      <select
                        aria-label={tr("动画组件")}
                        value={draft.art}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            art: e.target.value as Scene["art"],
                          })
                        }
                      >
                        {[
                          ["landscape", tr("山野与风景")],
                          ["botanical", tr("植物与生长")],
                          ["coffee", tr("物件与生活")],
                          ["orbit", tr("轨道与变化")],
                          ["city", tr("城市与建筑")],
                          ["chart", tr("数据与比较")],
                        ].map(([v, l]) => (
                          <option value={v} key={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="inspector-divider" />
                    <label className="field">
                      {tr("用一句话修改这个镜头")}
                      <textarea
                        aria-label={tr("镜头修改指令")}
                        rows={2}
                        value={aiInstruction}
                        placeholder={tr("例如：旁白更简短，画面更温暖")}
                        onChange={(e) => setAiInstruction(e.target.value)}
                      />
                    </label>
                    <button
                      className="button secondary ai-rewrite"
                      disabled={aiBusy || aiInstruction.trim().length < 2}
                      onClick={async () => {
                        if (!settings?.deepseekConfigured) {
                          setModal("settings");
                          return;
                        }
                        if (dirty && !(await saveDraft())) return;
                        setAiBusy(true);
                        try {
                          const p = await api<Project>(
                            `/api/projects/${project.id}/scenes/${scene.id}/rewrite`,
                            send("POST", { instruction: aiInstruction }),
                          );
                          putProject(p);
                          setAiInstruction("");
                          toast(tr("已修改当前镜头，其他镜头保持原样"));
                        } catch (e) {
                          toast((e as Error).message, true);
                        } finally {
                          setAiBusy(false);
                        }
                      }}
                    >
                      {aiBusy ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <SlidersHorizontal />
                      )}
                      {aiBusy ? tr("正在修改") : tr("用 DeepSeek 修改")}
                    </button>
                    <div className="inspector-divider" />
                    <div className="section-heading no-margin">
                      <span>{tr("镜头素材")}</span>
                      <span className="meta-text">{tr("可选")}</span>
                    </div>
                    <div className="media-actions">
                      <button
                        className="button secondary"
                        onClick={() => fileInput.current?.click()}
                      >
                        <Upload />
                        {tr("导入图片")}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          settings?.dreamapiConfigured
                            ? setPaid("image")
                            : setModal("settings")
                        }
                      >
                        <ImagePlus />
                        {tr("生成画面")}
                      </button>
                    </div>
                    <button
                      className="text-action voice-action"
                      onClick={() =>
                        settings?.dreamapiConfigured
                          ? setPaid("audio")
                          : setModal("settings")
                      }
                    >
                      <Volume2 />
                      {draft.audio
                        ? tr("重新生成配音")
                        : tr("用 DreamAPI 生成配音")}
                      <ArrowUpRight />
                    </button>
                    {draft.image && (
                      <div className="attached-asset">
                        <img src={draft.image} alt={tr("当前镜头素材")} />
                        <span>{tr("已附加图片")}</span>
                        <button
                          className="small-icon"
                          aria-label={tr("移除图片")}
                          onClick={() =>
                            setDraft({ ...draft, image: undefined })
                          }
                        >
                          <X />
                        </button>
                      </div>
                    )}
                    {draft.audio && (
                      <div className="attached-audio">
                        <audio controls src={draft.audio} />
                        <button
                          className="small-icon"
                          aria-label={tr("移除配音")}
                          onClick={() =>
                            setDraft({ ...draft, audio: undefined })
                          }
                        >
                          <X />
                        </button>
                      </div>
                    )}
                    {currentTasks.slice(0, 2).map((t) => (
                      <div
                        className={`task-note ${t.status === "failed" ? "error" : ""}`}
                        key={t.id}
                      >
                        {["running", "submitting"].includes(t.status) ? (
                          <LoaderCircle className="spin" />
                        ) : (
                          <Film />
                        )}
                        <span>
                          {t.kind === "image" ? tr("画面") : tr("配音")}：
                          {
                            (
                              {
                                running: tr("生成中"),
                                submitting: tr("提交中"),
                                done: t.applied
                                  ? tr("已应用")
                                  : tr("已保留，镜头已更改"),
                                paused: tr("等待恢复"),
                                uncertain: tr("请到控制台核对"),
                                failed: tr("生成失败"),
                                acknowledged: tr("已核对，可重新生成"),
                              } as any
                            )[t.status]
                          }
                          {t.error && <small>{errorText(t.error)}</small>}
                          {t.asset && !t.applied && (
                            <button
                              className="text-action retained-asset"
                              onClick={() => {
                                setDraft((d) =>
                                  d
                                    ? {
                                        ...d,
                                        [t.kind === "image"
                                          ? "image"
                                          : "audio"]: t.asset,
                                      }
                                    : d,
                                );
                                toast(tr("素材已选入镜头，应用修改后生效"));
                              }}
                            >
                              {tr("使用保留素材")}
                              <ArrowUpRight />
                            </button>
                          )}
                          {t.status === "uncertain" && (
                            <button
                              className="text-action retained-asset"
                              onClick={() =>
                                api(
                                  `/api/media-tasks/${t.id}/acknowledge`,
                                  send("POST", {
                                    confirmConsoleReviewed: true,
                                  }),
                                )
                                  .then(() =>
                                    toast(tr("已标记核对完成，可再次确认生成")),
                                  )
                                  .catch((e) => toast(e.message, true))
                              }
                            >
                              {tr("我已核对控制台")}
                            </button>
                          )}
                        </span>
                        {t.status === "paused" && (
                          <button
                            className="small-icon"
                            aria-label={tr("恢复查询")}
                            onClick={() =>
                              api(
                                `/api/media-tasks/${t.id}/resume`,
                                send("POST"),
                              )
                                .then(() => toast(tr("已恢复原任务查询")))
                                .catch((e) => toast(e.message, true))
                            }
                          >
                            <RefreshCw />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="inspector-bottom">
                    <button
                      className="icon-button"
                      aria-label={tr("撤销镜头修改")}
                      disabled={saving || !project.canUndo?.includes(scene.id)}
                      onClick={undo}
                    >
                      <Undo2 />
                    </button>
                    <button
                      className="button primary"
                      disabled={!dirty || saving}
                      onClick={saveDraft}
                    >
                      {saving ? <LoaderCircle className="spin" /> : <Check />}
                      {tr("应用修改")}
                    </button>
                  </div>
                </aside>
              )}
            </div>
            <section className="storyboard">
              <div className="storyboard-heading">
                <div>
                  <h2>{tr("分镜序列")}</h2>
                  <span>
                    {project.scenes.length}
                    {tr("个镜头 ·")}
                    {timecode(duration)}
                  </span>
                </div>
                <div>
                  <button
                    className="small-icon"
                    aria-label={tr("镜头前移")}
                    disabled={selected === 0 || saving}
                    onClick={() => moveScene(-1)}
                  >
                    <ArrowLeft />
                  </button>
                  <button
                    className="small-icon"
                    aria-label={tr("镜头后移")}
                    disabled={selected === project.scenes.length - 1 || saving}
                    onClick={() => moveScene(1)}
                  >
                    <ArrowUpRight className="rotate-45" />
                  </button>
                  <button
                    className="small-icon"
                    aria-label={tr("删除镜头")}
                    disabled={project.scenes.length <= 1 || saving}
                    onClick={deleteScene}
                  >
                    <Trash2 />
                  </button>
                  <span className="toolbar-divider" />
                  <button
                    className="text-action"
                    disabled={project.scenes.length >= 16 || saving}
                    onClick={addScene}
                  >
                    <Plus />
                    {tr("添加镜头")}
                  </button>
                </div>
              </div>
              <div className="shot-strip">
                {project.scenes.map((s, i) => {
                  const start = project.scenes
                    .slice(0, i)
                    .reduce((n, x) => n + x.duration, 0);
                  return (
                    <button
                      key={s.id}
                      className={`shot ${selected === i ? "active" : ""}`}
                      onClick={() => chooseScene(i)}
                      aria-label={tr("选择镜头 {0}：{1}", {
                        0: i + 1,
                        1: s.title,
                      })}
                      aria-pressed={selected === i}
                    >
                      <div className="shot-frame">
                        <Thumbnail
                          project={project}
                          time={start + Math.min(1, s.duration / 2)}
                        />
                        <span className="shot-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="shot-duration">{s.duration}s</span>
                      </div>
                      <div className="shot-title">{s.title}</div>
                      <div className="shot-time">
                        {timecode(start)} — {timecode(start + s.duration)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            <footer className="studio-footer">
              <span>
                <span className="status-dot connected" />
                {tr("项目保存在这台电脑")}
              </span>
              <button className="text-action" onClick={() => setModal("help")}>
                {tr("快捷键")}
                <kbd>?</kbd>
              </button>
            </footer>
          </main>
        )}
        {view === "styles" && project && (
          <StyleLibrary
            project={project}
            onApply={async (id) => {
              const base = dirty ? await saveDraft() : project;
              if (base && (await update({ style: id }, base))) {
                setView("studio");
                toast(tr("风格已应用，分镜内容保持原样"));
              }
            }}
            onCreate={(id) => {
              setNewStyle(id);
              setModal("new");
            }}
          />
        )}
        {view === "exports" && (
          <main className="page-content">
            <div className="page-heading">
              <h1>{tr("导出记录")}</h1>
              <p>
                {tr(
                  "每次导出都会保存当时的分镜版本，后续修改不会影响已导出的成片。",
                )}
              </p>
            </div>
            {jobs.length === 0 ? (
              <div className="empty-state">
                <Download />
                <h2>{tr("还没有导出的短片")}</h2>
                <p>{tr("回到创作台，完成预览后导出第一支影片。")}</p>
                <button
                  className="button primary"
                  onClick={() => setView("studio")}
                >
                  {tr("回到创作台")}
                </button>
              </div>
            ) : (
              <div className="export-list">
                {jobs.map((j) => (
                  <ExportRow
                    key={j.id}
                    job={j}
                    onCancel={() =>
                      api(`/api/exports/${j.id}/cancel`, send("POST"))
                        .then(() => toast(tr("已取消导出")))
                        .catch((e) => toast(e.message, true))
                    }
                    onRetry={async () => {
                      try {
                        const r = await api<Job>(
                          `/api/projects/${j.projectId}/exports`,
                          send("POST", {
                            quality: j.quality,
                            requestKey: crypto.randomUUID(),
                          }),
                        );
                        setJobs((old) => [r, ...old]);
                        toast(tr("已用项目当前版本重新导出"));
                      } catch (e) {
                        toast((e as Error).message, true);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </main>
        )}
      </div>
      {!project && !loading && (
        <div className="empty-state">
          <h1>{tr("开始你的第一支短片")}</h1>
          <button
            className="button primary"
            onClick={() => {
              setNewStyle("paper");
              setModal("new");
            }}
          >
            {tr("新建短片")}
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files?.[0]) uploadImage(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={importInput}
        type="file"
        className="hidden"
        accept="application/json,.json"
        onChange={(e) => {
          if (e.target.files?.[0]) importProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <audio ref={audioRef} hidden />
      {notice && (
        <div
          role={notice.error ? "alert" : "status"}
          className={`toast ${notice.error ? "error" : ""}`}
        >
          {notice.error ? <AlertCircle /> : <CheckCircle2 />}
          <span>{errorText(notice.text)}</span>
          <button
            className="small-icon"
            aria-label={tr("关闭提示")}
            onClick={() => setNotice(null)}
          >
            <X />
          </button>
        </div>
      )}
      {modal === "new" && (
        <NewProjectModal
          onClose={closeModal}
          configured={!!settings?.deepseekConfigured}
          initialStyle={newStyle}
          onCreate={(p) => {
            putProject(p);
            setId(p.id);
            setSelected(0);
            seek(0.8);
            setPlaying(false);
            setView("studio");
            closeModal();
            toast(tr("分镜已就绪，可以开始预览和修改"));
          }}
        />
      )}
      {modal === "settings" && settings && (
        <SettingsModal
          settings={settings}
          onClose={closeModal}
          onSave={(s) => {
            setSettings(s);
            toast(tr("设置已保存"));
          }}
        />
      )}
      {modal === "export" && project && (
        <ExportModal
          project={project}
          jobs={projectJobs}
          onClose={closeModal}
          onExport={async (quality) => {
            const j = await api<Job>(
              `/api/projects/${project.id}/exports`,
              send("POST", { quality, requestKey: crypto.randomUUID() }),
            );
            setJobs((old) => [j, ...old]);
            toast(tr("已加入导出队列，你可以继续编辑"));
          }}
          onCancel={(j) =>
            api(`/api/exports/${j.id}/cancel`, send("POST")).then(() =>
              toast(tr("已取消导出")),
            )
          }
        />
      )}
      {modal === "help" && (
        <Modal title={tr("快捷键和使用说明")} onClose={closeModal}>
          <div className="modal-body help-body">
            <p>
              {tr(
                "写下主题或剧本，选择风格，生成分镜。在创作台修改每个镜头，确认预览后导出。",
              )}
            </p>
            <dl>
              <dt>{tr("播放 / 暂停")}</dt>
              <dd>
                <kbd>Space</kbd>
              </dd>
              <dt>{tr("前后移动一秒")}</dt>
              <dd>
                <kbd>←</kbd> <kbd>→</kbd>
              </dd>
              <dt>{tr("关闭窗口")}</dt>
              <dd>
                <kbd>Esc</kbd>
              </dd>
            </dl>
            <h3>{tr("本地模式与 AI 模式")}</h3>
            <p>
              {tr(
                "本地模式按你的原文分段并匹配动画组件，不会自动理解或改写剧本。配置 DeepSeek 后，可以使用 AI 规划分镜。DreamAPI 图片与配音仅在你确认后付费生成。",
              )}
            </p>
            <h3>{tr("关于导出")}</h3>
            <p>
              {tr(
                "支持 720p / 1080p、24 fps。配音长于镜头时会提示你延长镜头，避免截断。项目文件只包含分镜，不包含本地素材文件；带素材迁移时需同时复制 .flare/media 目录。",
              )}
            </p>
            <a
              className="text-action"
              href={project ? `/api/projects/${project.id}/project.json` : "#"}
              download
            >
              <Download />
              {tr("下载当前项目文件")}
            </a>
          </div>
        </Modal>
      )}
      {paid && (
        <Modal
          title={
            paid === "image"
              ? tr("生成这个镜头的画面")
              : tr("生成这个镜头的配音")
          }
          onClose={() => setPaid(null)}
        >
          <div className="modal-body">
            <p>
              {tr("将把当前镜头的")}
              {paid === "image" ? tr("画面描述") : tr("旁白")}
              {tr(
                "发送给 DreamAPI，使用你的账户额度。本次只生成这一个镜头的素材。",
              )}
            </p>
            <div className="quote-block">
              {paid === "image" ? draft?.visual : draft?.narration}
            </div>
            <p className="field-hint">
              {tr("预计")}
              {paid === "image" ? tr("约 30 秒至 1 分钟") : tr("约 10–30 秒")}
              {tr("。具体费用以 DreamAPI 控制台为准。")}
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setPaid(null)}
              >
                {tr("取消")}
              </button>
              <button className="button primary" onClick={generate}>
                {tr("确认付费生成")}
                <ArrowUpRight />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function FilmViewer({ project, time }: { project: Project; time: number }) {
  const ref = useRef<HTMLCanvasElement>(null),
    [ready, setReady] = useState(false);
  const [w, h] = dimensions(project.aspect, 720);
  useEffect(() => {
    let alive = true;
    setReady(false);
    preload(project)
      .then(() => alive && setReady(true))
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [project]);
  useEffect(() => {
    if (ref.current) drawFilm(ref.current, project, time);
  }, [project, time, ready, w, h]);
  return (
    <div className={`viewer-stage aspect-${project.aspect.replace(":", "-")}`}>
      <canvas
        ref={ref}
        width={w}
        height={h}
        aria-label={tr("影片画面")}
        role="img"
      />
    </div>
  );
}
function NewProjectModal({
  onClose,
  configured,
  initialStyle = "paper",
  onCreate,
}: {
  onClose: () => void;
  configured: boolean;
  initialStyle?: Style;
  onCreate: (p: Project) => void;
}) {
  const [title, setTitle] = useState(""),
    [brief, setBrief] = useState(""),
    [style, setStyle] = useState<Style>(initialStyle),
    [aspect, setAspect] = useState<Aspect>("16:9"),
    [duration, setDuration] = useState(30),
    [mode, setMode] = useState("local"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreate(
        await api<Project>(
          "/api/projects",
          send("POST", { title, brief, style, aspect, duration, mode }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={tr("新的故事")}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body new-film-form" onSubmit={submit}>
        <div className="new-film-intro">
          <span className="large-icon">
            <Clapperboard />
          </span>
          <div>
            <h3>{tr("新的故事")}</h3>
            <p>{tr("可以是一段剧本，也可以是一个具体的主题。")}</p>
          </div>
        </div>
        <label className="field">
          {tr("短片名称")}
          <input
            aria-label={tr("短片名称")}
            maxLength={80}
            placeholder={tr("给这个故事起个名字")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          {tr("剧本或主题")}
          <textarea
            aria-label={tr("剧本或主题")}
            rows={5}
            minLength={5}
            required
            maxLength={20000}
            placeholder={tr("每段写一个画面，或描述你想讲述的内容…")}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="text-action example-link"
          onClick={() => {
            setTitle(tr("雨的一生"));
            setBrief(
              tr(
                "一滴雨从云层中落下，轻轻碰到山间的树叶。\n它汇入溪流，穿过森林，沿着河道继续向前。\n太阳升起，水汽回到天空。每一次抵达，也是新的开始。",
              ),
            );
          }}
        >
          <FileText />
          {tr("试试「雨的一生」")}
        </button>
        <StylePicker value={style} onChange={setStyle} />
        <div className="form-columns">
          <label className="field">
            {tr("目标时长")}
            <select
              aria-label={tr("目标时长")}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[15, 30, 45, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d}
                  {tr("秒")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr("画幅")}
            <select
              aria-label={tr("新项目画幅")}
              value={aspect}
              onChange={(e) => setAspect(e.target.value as Aspect)}
            >
              <option value="16:9">{tr("横屏 · 16:9")}</option>
              <option value="9:16">{tr("竖屏 · 9:16")}</option>
              <option value="1:1">{tr("方形 · 1:1")}</option>
            </select>
          </label>
          <label className="field">
            {tr("分镜方式")}
            <select
              aria-label={tr("分镜方式")}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="local">{tr("本地分镜")}</option>
              <option value="deepseek" disabled={!configured}>
                DeepSeek{!configured ? tr(" · 需配置密钥") : ""}
              </option>
            </select>
          </label>
        </div>
        <p className="field-hint">
          {mode === "local"
            ? tr("本地分镜按原文分段，不调用模型，不产生 API 费用。")
            : tr("DeepSeek 会根据剧本规划分镜，本次调用使用你的账户额度。")}
        </p>
        {error && (
          <p role="alert" className="inline-error">
            <AlertCircle />
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {tr("取消")}
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <Clapperboard />}
            {busy ? tr("正在规划分镜") : tr("创建分镜")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}) {
  const [deepseek, setDeepseek] = useState(""),
    [dream, setDream] = useState(""),
    [model, setModel] = useState(settings.model),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onSave(
        await api<Settings>(
          "/api/settings",
          send("PATCH", {
            ...(deepseek ? { deepseekKey: deepseek } : {}),
            ...(dream ? { dreamapiKey: dream } : {}),
            model,
          }),
        ),
      );
      setDeepseek("");
      setDream("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function clear(key: "deepseekKey" | "dreamapiKey") {
    try {
      onSave(await api("/api/settings", send("PATCH", { [key]: null })));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={tr("模型与制作设置")} onClose={onClose}>
      <form className="modal-body" onSubmit={save}>
        <p className="settings-intro">
          {tr("不配置密钥，也能使用本地分镜、动画预览和视频导出。")}
        </p>
        <div className="provider-heading">
          <h3>DeepSeek</h3>
          <span
            className={
              settings.deepseekConfigured ? "configured" : "not-configured"
            }
          >
            {settings.deepseekConfigured ? tr("已配置") : tr("未配置")}
          </span>
        </div>
        <p className="field-hint">
          {tr(
            "理解剧本、规划镜头。密钥只保存在本机服务端文件中，不会写入项目或浏览器存储。",
          )}
        </p>
        <label className="field">
          API Key
          <input
            type="password"
            autoComplete="off"
            aria-label="DeepSeek API Key"
            value={deepseek}
            placeholder={
              settings.deepseekConfigured
                ? tr("留空保留现有密钥")
                : tr("输入你的 DeepSeek Key")
            }
            onChange={(e) => setDeepseek(e.target.value)}
          />
        </label>
        <label className="field">
          {tr("模型名称")}
          <input
            aria-label={tr("DeepSeek 模型")}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        {settings.deepseekConfigured && (
          <button
            className="text-action danger"
            type="button"
            onClick={() => clear("deepseekKey")}
          >
            {tr("移除 DeepSeek 密钥")}
          </button>
        )}
        <div className="inspector-divider" />
        <div className="provider-heading">
          <h3>DreamAPI</h3>
          <span
            className={
              settings.dreamapiConfigured ? "configured" : "not-configured"
            }
          >
            {settings.dreamapiConfigured ? tr("已配置") : tr("未配置")}
          </span>
        </div>
        <p className="field-hint">
          {tr("按镜头生成图片或中文配音，每次生成前都会确认费用使用。")}
        </p>
        <label className="field">
          API Key
          <input
            type="password"
            autoComplete="off"
            aria-label="DreamAPI API Key"
            value={dream}
            placeholder={
              settings.dreamapiConfigured
                ? tr("留空保留现有密钥")
                : tr("输入你的 DreamAPI Key")
            }
            onChange={(e) => setDream(e.target.value)}
          />
        </label>
        <a
          className="text-action"
          href="https://api.newportai.com/"
          target="_blank"
          rel="noreferrer"
        >
          {tr("打开 DreamAPI 控制台")}
          <ExternalLink />
        </a>
        {settings.dreamapiConfigured && (
          <button
            className="text-action danger"
            type="button"
            onClick={() => clear("dreamapiKey")}
          >
            {tr("移除 DreamAPI 密钥")}
          </button>
        )}
        <div className="settings-notice">
          <AlertCircle />
          <span>
            {tr(
              "接口已接入，真实账户生成效果仍待验收。保存密钥不会发起付费调用。",
            )}
          </span>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {tr("完成")}
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <Check />}
            {tr("保存设置")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ExportRow({
  job: j,
  onCancel,
  onRetry,
}: {
  job: Job;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const running = ["queued", "running"].includes(j.status),
    done = j.status === "done";
  return (
    <article className="export-row">
      <div className={`export-icon ${done ? "complete" : ""}`}>
        {running ? (
          <LoaderCircle className="spin" />
        ) : done ? (
          <CheckCircle2 />
        ) : (
          <Film />
        )}
      </div>
      <div className="export-info">
        <h3>{j.projectTitle}</h3>
        <p>
          {j.quality}
          {tr("p · 24 fps · 版本")}
          {j.revision}{" "}
          <span>
            ·{" "}
            {new Date(j.createdAt).toLocaleString("zh-CN", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
        {running && (
          <>
            <progress value={j.progress} max={1} />
            <span className="field-hint">
              {j.status === "queued"
                ? tr("等待前一个任务完成")
                : tr("正在渲染 {0}%", { 0: Math.round(j.progress * 100) })}
            </span>
          </>
        )}
        {j.error && <p className="export-error">{errorText(j.error)}</p>}
        {j.status === "cancelled" && (
          <p className="field-hint">{tr("已取消")}</p>
        )}
      </div>
      <div className="export-actions">
        {done ? (
          <>
            <a
              className="button primary compact"
              href={`/api/exports/${j.id}/film.mp4`}
              download
            >
              <Download />
              MP4
            </a>
            <a
              className="text-action"
              href={`/api/exports/${j.id}/subtitles.srt`}
              download
            >
              {tr("字幕")}
            </a>
            <a
              className="text-action"
              href={`/api/exports/${j.id}/project.json`}
              download
            >
              {tr("项目")}
            </a>
          </>
        ) : running ? (
          <button className="button secondary compact" onClick={onCancel}>
            {tr("取消")}
          </button>
        ) : (
          <button className="button secondary compact" onClick={onRetry}>
            <RefreshCw />
            {tr("重新导出")}
          </button>
        )}
      </div>
    </article>
  );
}
function ExportModal({
  project,
  jobs,
  onClose,
  onExport,
  onCancel,
}: {
  project: Project;
  jobs: Job[];
  onClose: () => void;
  onExport: (q: number) => Promise<void>;
  onCancel: (j: Job) => Promise<any>;
}) {
  const [quality, setQuality] = useState(720),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = jobs.find((j) => ["queued", "running"].includes(j.status));
  return (
    <Modal title={tr("导出短片")} onClose={onClose}>
      <div className="modal-body">
        <div className="export-preview">
          <Thumbnail project={project} time={1} />
          <div>
            <h3>{project.title}</h3>
            <p>
              {project.aspect} · {timecode(totalDuration(project))} ·{" "}
              {project.scenes.length}
              {tr("个镜头")}
            </p>
          </div>
        </div>
        <label className="field">
          {tr("导出画质")}
          <select
            aria-label={tr("导出画质")}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          >
            <option value={720}>{tr("720p · 快速验收")}</option>
            <option value={1080}>{tr("1080p · 高清成片")}</option>
          </select>
        </label>
        <div className="export-options">
          <Check />
          {tr("MP4 视频")}
          <span>H.264 · 24 fps</span>
        </div>
        <div className="export-options">
          <Check />
          {tr("独立字幕")}
          <span>SRT</span>
        </div>
        <div className="export-options">
          <Check />
          {tr("分镜快照")}
          <span>JSON</span>
        </div>
        <p className="field-hint">
          {tr(
            "在本机逐帧渲染，不调用生成 API。导出期间可以继续修改，当前成片会保留提交时的版本。",
          )}
        </p>
        {active && (
          <div className="export-progress">
            <progress value={active.progress} max={1} />
            <div>
              <span>
                {active.status === "queued"
                  ? tr("已加入队列")
                  : tr("正在渲染 {0}%", {
                      0: Math.round(active.progress * 100),
                    })}
              </span>
              <button className="text-action" onClick={() => onCancel(active)}>
                {tr("取消导出")}
              </button>
            </div>
          </div>
        )}
        {jobs.find((j) => j.status === "done") && (
          <a
            className="button secondary download-latest"
            href={`/api/exports/${jobs.find((j) => j.status === "done")!.id}/film.mp4`}
            download
          >
            <Download />
            {tr("下载最近完成的成片")}
          </a>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <a
            className="text-action"
            href={`/api/projects/${project.id}/project.json`}
            download
          >
            {tr("只下载项目")}
          </a>
          <button
            className="button primary"
            disabled={busy || !!active}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onExport(quality);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy || active ? <LoaderCircle className="spin" /> : <Download />}
            {active ? tr("导出进行中") : tr("开始导出")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
