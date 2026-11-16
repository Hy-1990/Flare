import { z } from "zod";
import { STYLE_IDS } from "./styles.js";
export { STYLES } from "./styles.js";
export const ART = [
  "landscape",
  "coffee",
  "orbit",
  "city",
  "chart",
  "botanical",
];
export const SceneSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  title: z.string().max(40),
  narration: z.string().max(300),
  visual: z.string().max(1200),
  duration: z.number().min(1).max(30),
  art: z.enum(ART),
  accent: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .default("#df6a44"),
  image: z
    .string()
    .regex(/^\/media\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/)
    .optional(),
  audio: z
    .string()
    .regex(/^\/media\/[a-zA-Z0-9_-]+\.(wav|mp3|m4a)$/)
    .optional(),
});
export const ProjectContentSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    brief: z.string().max(20000),
    style: z.enum(STYLE_IDS),
    aspect: z.enum(["16:9", "9:16", "1:1"]),
    music: z.boolean(),
    scenes: z.array(SceneSchema).min(1).max(16),
  })
  .superRefine((p, ctx) => {
    const d = totalDuration(p);
    if (d < 3 || d > 120)
      ctx.addIssue({ code: "custom", message: "影片总时长需为 3–120 秒" });
    if (new Set(p.scenes.map((s) => s.id)).size !== p.scenes.length)
      ctx.addIssue({ code: "custom", message: "镜头标识不能重复" });
  });
export const BriefSchema = z.object({
  title: z.string().max(80).optional(),
  brief: z.string().trim().min(5).max(20000),
  style: z.enum(STYLE_IDS),
  aspect: z.enum(["16:9", "9:16", "1:1"]),
  duration: z.number().min(10).max(90),
  mode: z.enum(["local", "deepseek", "ai"]),
});
export function totalDuration(p) {
  return p.scenes.reduce((n, s) => n + s.duration, 0);
}
export function dimensions(aspect, quality = 720) {
  return aspect === "9:16"
    ? [quality, Math.round((quality * 16) / 9 / 2) * 2]
    : aspect === "1:1"
      ? [quality, quality]
      : [Math.round((quality * 16) / 9 / 2) * 2, quality];
}
export function sceneAt(p, t) {
  let start = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i];
    if (t < start + s.duration || i === p.scenes.length - 1)
      return {
        scene: s,
        index: i,
        start,
        local: Math.max(0, Math.min(s.duration, t - start)),
      };
    start += s.duration;
  }
}
export function timecode(t) {
  const n = Math.max(0, t);
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
}
export function makeSrt(p) {
  let t = 0;
  const stamp = (n) => {
    const ms = Math.round(n * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  const cues = [];
  for (const s of p.scenes) {
    const chunks = captionChunks(s.narration, p.aspect);
    for (let i = 0; i < chunks.length; i++)
      cues.push(
        `${cues.length + 1}\n${stamp(t + (s.duration * i) / chunks.length)} --> ${stamp(t + (s.duration * (i + 1)) / chunks.length)}\n${chunks[i]}\n`,
      );
    t += s.duration;
  }
  return cues.join("\n");
}
export function captionChunks(text, aspect) {
  const limit = aspect === "9:16" ? 42 : 76,
    chars = Array.from(text),
    chunks = [];
  for (let i = 0; i < chars.length; i += limit)
    chunks.push(chars.slice(i, i + limit).join(""));
  return chunks;
}
export function localPlan(input) {
  const text = input.brief
    .replace(/\r/g, "")
    .split(/\n+|(?<=[。！？.!?])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const count = Math.min(8, Math.max(3, Math.ceil(input.duration / 8)));
  const groups = Array.from(
    { length: Math.min(count, Math.max(1, text.length)) },
    () => [],
  );
  text.forEach((s, i) =>
    groups[
      Math.min(groups.length - 1, Math.floor((i * groups.length) / text.length))
    ].push(s),
  );
  const parts = groups.flatMap(
    (g) => g.join(" ").match(/[\s\S]{1,300}/gu) || [],
  );
  z.array(z.string())
    .max(
      Math.min(16, Math.floor(input.duration)),
      "剧本较长，当前时长无法容纳全部内容，请精简剧本或增加时长",
    )
    .parse(parts);
  // Keep every supplied character. Long visual holds use empty-caption shots
  // rather than repeating or silently truncating the script.
  while (parts.length < Math.ceil(input.duration / 30)) parts.push("");
  const ticks = Math.round(input.duration * 10),
    baseTicks = Math.floor(ticks / parts.length),
    remainder = ticks - baseTicks * parts.length;
  const scenes = parts.map((n, i) => ({
    id: crypto.randomUUID(),
    title: n.replace(/[。！？.!?]/g, "").slice(0, 16) || `镜头 ${i + 1}`,
    narration: n,
    visual: n || parts.find(Boolean) || input.brief.slice(0, 300),
    art: /咖啡|coffee/i.test(n)
      ? "coffee"
      : /山|海|河|森林|自然/.test(n)
        ? "landscape"
        : /数据|增长|比较|比例/.test(n)
          ? "chart"
          : /城市|街|建筑/.test(n)
            ? "city"
            : /宇宙|星|轨道|科技/.test(n)
              ? "orbit"
              : "botanical",
    duration: (baseTicks + (i < remainder ? 1 : 0)) / 10,
    accent: "#df6a44",
  }));
  return ProjectContentSchema.parse({
    title: input.title?.trim() || parts[0].slice(0, 20) || "未命名短片",
    brief: input.brief,
    style: input.style,
    aspect: input.aspect,
    music: true,
    scenes,
  });
}
export function starter() {
  return {
    title: "一粒咖啡的旅程",
    brief:
      "从高山上的一粒种子，到清晨手中的一杯咖啡。用五个镜头讲述种植、生长、采摘、烘焙与冲煮的旅程。",
    style: "paper",
    aspect: "16:9",
    music: true,
    scenes: [
      {
        id: "seed",
        title: "故事，始于一粒种子",
        narration: "在群山的怀抱里，一粒种子，开始了漫长的旅程。",
        visual: "层叠的山峦，清晨的太阳缓缓升起。前景，一株咖啡树随风轻摆。",
        duration: 6,
        art: "landscape",
        accent: "#e66b45",
      },
      {
        id: "grow",
        title: "把时间，交给土地",
        narration: "雨水、阳光和时间，让枝头结出一颗颗红色的果实。",
        visual: "镜头推近叶片与红色果实，枝条在画面中展开。",
        duration: 6,
        art: "botanical",
        accent: "#748363",
      },
      {
        id: "harvest",
        title: "一颗果实的远行",
        narration: "成熟的果实被采下，褪去外衣，留下最初的香气。",
        visual: "咖啡豆在平面上依次排列，形成从果实到种子的序列。",
        duration: 6,
        art: "coffee",
        accent: "#cb7651",
      },
      {
        id: "roast",
        title: "让风味，慢慢醒来",
        narration: "火候让色泽加深，也唤醒了藏在种子里的风味。",
        visual: "俯视咖啡杯和旋转的弧线，暖色圆形表现热量与变化。",
        duration: 6,
        art: "orbit",
        accent: "#d69248",
      },
      {
        id: "cup",
        title: "从远方，到你的清晨",
        narration: "于是，山间的一个故事，成为了你手中的一杯咖啡。",
        visual: "一杯咖啡置于桌面，蒸汽上升，镜头缓缓拉远。",
        duration: 6,
        art: "coffee",
        accent: "#e66b45",
      },
    ],
  };
}
