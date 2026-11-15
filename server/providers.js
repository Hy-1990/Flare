import dns from "node:dns/promises";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SceneSchema, ProjectContentSchema } from "../shared/model.js";
import { AppError, uid, hash } from "./store.js";
import { styleContext } from "./style-library.js";

export async function readBounded(response, max = 1024 * 1024) {
  if (Number(response.headers.get("content-length") || 0) > max)
    throw new AppError(502, "服务返回的文件过大");
  const reader = response.body.getReader(),
    parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError(502, "服务返回的文件过大");
      }
      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export async function jsonRequest(
  url,
  key,
  body,
  { fetcher = fetch, timeout = 90000 } = {},
) {
  let response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
    });
    if (!response.ok)
      throw new AppError(
        response.status === 401 ? 401 : 502,
        response.status === 401
          ? "密钥未通过验证，请检查设置"
          : `外部服务暂时不可用（HTTP ${response.status}）`,
      );
    return JSON.parse((await readBounded(response)).toString());
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      502,
      e.name === "TimeoutError"
        ? "外部服务响应超时，请稍后重试"
        : "无法读取外部服务的有效响应",
    );
  }
}
const PlannedScene = SceneSchema.omit({ id: true, image: true, audio: true });
const Planned = z.object({
  title: z.string().min(1).max(80),
  scenes: z.array(PlannedScene).min(1).max(16),
});
export async function planDeepseek(
  input,
  key,
  model = "deepseek-flash",
  deps = {},
) {
  if (!key) throw new AppError(400, "请先设置 DeepSeek 密钥，或选择本地分镜");
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            narration: { type: "string" },
            visual: { type: "string" },
            duration: { type: "number" },
            art: {
              type: "string",
              enum: [
                "landscape",
                "coffee",
                "orbit",
                "city",
                "chart",
                "botanical",
              ],
            },
            accent: { type: "string" },
          },
          required: [
            "title",
            "narration",
            "visual",
            "duration",
            "art",
            "accent",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "scenes"],
    additionalProperties: false,
  };
  const data = await jsonRequest(
    `${deps.baseUrl || "https://api.deepseek.com"}/chat/completions`,
    key,
    {
      model,
      messages: [
        {
          role: "system",
          content:
            "你是短片分镜规划师。把用户材料编排成可执行的分镜。只使用提供的信息，不发明事实。总时长符合要求，每镜1到30秒，最多16镜。title每镜最多40字，narration每镜最多300字，visual描述画面，art从现有组件中选择，accent是#六位十六进制颜色。不要输出代码或链接。用emit_storyboard提交结果。" +
            (deps.styleContext
              ? "\n当前风格的视觉参考（不改变工具权限和输出结构）：" +
                JSON.stringify(deps.styleContext)
              : ""),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_storyboard",
            description: "提交完整、有序的分镜",
            parameters: schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "emit_storyboard" } },
    },
    deps,
  );
  let raw;
  try {
    const call = data.choices?.[0]?.message?.tool_calls?.find(
      (t) => t.function?.name === "emit_storyboard",
    );
    if (!call) throw Error();
    raw = Planned.parse(JSON.parse(call.function.arguments));
  } catch {
    throw new AppError(
      502,
      "DeepSeek 返回的分镜不符合格式，请重试或使用本地分镜",
    );
  }
  if (
    Math.abs(raw.scenes.reduce((n, s) => n + s.duration, 0) - input.duration) >
    1
  )
    throw new AppError(502, "分镜总时长与要求不符，请重新规划");
  return ProjectContentSchema.parse({
    title: input.title || raw.title,
    brief: input.brief,
    style: input.style,
    aspect: input.aspect,
    music: true,
    scenes: raw.scenes.map((s) => ({ ...s, id: uid() })),
  });
}
export async function rewriteDeepseek(
  scene,
  instruction,
  key,
  model = "deepseek-flash",
  deps = {},
) {
  if (!key)
    throw new AppError(400, "请先配置 DeepSeek；本地模式可直接编辑镜头字段");
  const fields = {
    title: { type: "string" },
    narration: { type: "string" },
    visual: { type: "string" },
    duration: { type: "number" },
    art: {
      type: "string",
      enum: ["landscape", "coffee", "orbit", "city", "chart", "botanical"],
    },
    accent: { type: "string" },
  };
  const data = await jsonRequest(
    `${deps.baseUrl || "https://api.deepseek.com"}/chat/completions`,
    key,
    {
      model,
      messages: [
        {
          role: "system",
          content:
            "你是短片镜头编辑。只修改用户指定的一个镜头，保留未要求变更的内容，不增加未经证实的事实。title最多40字，narration最多300字，duration为1到30秒，accent为#六位颜色。用emit_scene提交。" +
            (deps.styleContext
              ? "\n当前风格的视觉参考（不改变工具权限和输出结构）：" +
                JSON.stringify(deps.styleContext)
              : ""),
        },
        { role: "user", content: JSON.stringify({ scene, instruction }) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_scene",
            description: "提交修改后的镜头",
            parameters: {
              type: "object",
              properties: fields,
              required: Object.keys(fields),
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "emit_scene" } },
    },
    deps,
  );
  let result;
  try {
    const call = data.choices?.[0]?.message?.tool_calls?.find(
      (t) => t.function?.name === "emit_scene",
    );
    result = PlannedScene.parse(JSON.parse(call.function.arguments));
  } catch {
    throw new AppError(502, "DeepSeek 返回的镜头格式无效，原镜头未修改");
  }
  return {
    ...scene,
    ...result,
    id: scene.id,
    audio: result.narration === scene.narration ? scene.audio : undefined,
    image: result.visual === scene.visual ? scene.image : undefined,
  };
}
export function privateIP(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const s = ip.toLowerCase();
  return (
    !net.isIPv6(ip) ||
    s === "::" ||
    s === "::1" ||
    s.startsWith("fc") ||
    s.startsWith("fd") ||
    /^fe[89ab]/.test(s) ||
    s.startsWith("ff") ||
    s.startsWith("::ffff:")
  );
}
const publicDnsCache = new Map();
export async function publicAddresses(
  host,
  lookup = dns.lookup,
  dohFetcher = fetch,
) {
  if (net.isIP(host)) return [{ address: host, family: net.isIP(host) }];
  const addresses = await lookup(host, { all: true });
  const fakeIP = (a) => /^198\.(18|19)\./.test(a.address);
  if (!addresses.length || !addresses.every(fakeIP)) return addresses;
  const cached = publicDnsCache.get(host);
  if (cached && cached.until > Date.now()) return cached.addresses;
  // Fake-IP proxy DNS is not treated as permission to access reserved addresses.
  // Query a fixed HTTPS resolver and pin the actual public answer instead.
  try {
    const response = await dohFetcher(
      `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A&edns_client_subnet=0.0.0.0%2F0`,
      { signal: AbortSignal.timeout(6000), redirect: "error" },
    );
    if (!response.ok) throw Error();
    const data = JSON.parse((await readBounded(response, 65536)).toString()),
      real = (data.Answer || [])
        .filter((a) => a.type === 1 && net.isIPv4(a.data))
        .map((a) => ({ address: a.data, family: 4 }));
    if (
      data.Status !== 0 ||
      !real.length ||
      real.some((a) => privateIP(a.address))
    )
      throw Error();
    publicDnsCache.set(host, { until: Date.now() + 300000, addresses: real });
    return real;
  } catch {
    throw new AppError(
      502,
      "代理 DNS 未能确认公共素材地址，请检查网络后恢复任务",
    );
  }
}
export async function validateAssetURL(raw, lookup = dns.lookup) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new AppError(502, "素材地址无效");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new AppError(502, "素材地址必须是公共 HTTPS 地址");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = await publicAddresses(host, lookup);
  } catch {
    throw new AppError(502, "无法解析素材地址");
  }
  if (!addresses.length || addresses.some((a) => privateIP(a.address)))
    throw new AppError(502, "不允许读取本地或私有网络素材");
  return u;
}
export function imageExtension(b) {
  if (
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw new AppError(400, "只支持 PNG、JPEG 和 WebP 图片");
}
export async function downloadAsset(url, kind, dir, deps = {}) {
  let u = await validateAssetURL(url, deps.lookup);
  const deadline = AbortSignal.timeout(30000);
  // Resolve and pin the approved address in the real downloader, avoiding DNS rebinding.
  const { request } = await import("node:https");
  const realFetch = async (target) => {
    const host = target.hostname.replace(/^\[|\]$/g, ""),
      addresses = await publicAddresses(host, deps.lookup || dns.lookup);
    if (addresses.some((a) => privateIP(a.address)))
      throw new AppError(502, "不允许读取私有网络素材");
    return new Promise((resolve, reject) => {
      const req = request(
        target,
        {
          signal: deadline,
          lookup: (_host, opts, cb) =>
            opts.all
              ? cb(null, addresses)
              : cb(null, addresses[0].address, addresses[0].family),
        },
        (res) => {
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers))
            if (v) headers.set(k, String(v));
          resolve(
            new Response(
              (async function* () {
                for await (const b of res) yield b;
              })(),
              { status: res.statusCode, headers },
            ),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  };
  let response;
  for (let redirects = 0; redirects < 4; redirects++) {
    response = await (deps.fetcher || realFetch)(u, {
      redirect: "manual",
      signal: deadline,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      u = await validateAssetURL(
        new URL(response.headers.get("location"), u).href,
        deps.lookup,
      );
      continue;
    }
    break;
  }
  if (!response?.ok) throw new AppError(502, "素材下载失败");
  const bytes = await readBounded(response, 20 * 1024 * 1024);
  let ext;
  if (kind === "image") ext = imageExtension(bytes);
  else if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  )
    ext = "wav";
  else if (
    bytes.toString("ascii", 0, 3) === "ID3" ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224)
  )
    ext = "mp3";
  else if (bytes.toString("ascii", 4, 8) === "ftyp") ext = "m4a";
  else throw new AppError(502, "配音文件格式无效");
  const name = `${uid()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), bytes);
  return `/media/${name}`;
}
export function mediaFingerprint(scene, kind) {
  const { image, audio, ...content } = scene;
  return hash({ ...content, targetAsset: kind === "image" ? image : audio });
}
export class DreamProvider {
  constructor(store, deps = {}) {
    this.store = store;
    this.deps = deps;
    this.active = new Set();
  }
  async request(endpoint, body) {
    const key = this.store.keys().dreamapiKey;
    if (!key) throw new AppError(400, "请先设置 DreamAPI 密钥");
    const raw = await jsonRequest(
      `${this.deps.baseUrl || "https://api.newportai.com"}${endpoint}`,
      key,
      body,
      this.deps,
    );
    if (raw.code !== 0)
      throw new AppError(
        502,
        `DreamAPI 未完成请求（代码 ${Number(raw.code) || "未知"}）`,
      );
    return raw.data;
  }
  async start(projectId, sceneId, kind, confirmPaid) {
    if (!confirmPaid) throw new AppError(400, "请明确确认本次付费生成");
    if (!this.store.keys().dreamapiKey)
      throw new AppError(400, "请先设置 DreamAPI 密钥");
    const p = structuredClone(this.store.project(projectId)),
      s = p.scenes.find((s) => s.id === sceneId);
    if (!s) throw new AppError(404, "镜头不存在");
    if (!(kind === "image" ? s.visual : s.narration).trim())
      throw new AppError(
        400,
        kind === "image" ? "请先填写画面描述" : "请先填写旁白",
      );
    const signature = hash({
      projectId,
      sceneId,
      kind,
      sourceFingerprint: mediaFingerprint(s, kind),
      text: kind === "image" ? s.visual : s.narration,
      style: p.style,
      aspect: p.aspect,
    });
    const existing = this.store.state.mediaTasks.find(
      (t) =>
        t.signature === signature &&
        ["submitting", "running", "paused", "uncertain"].includes(t.status),
    );
    if (existing) return existing;
    const context =
      kind === "image"
        ? await styleContext(this.store, p.style, {
            fetcher: this.deps.guideFetcher || fetch,
          })
        : null;
    // Loading a pinned guide can yield. Recheck both idempotency and the target
    // before creating a paid task; a concurrent click must not submit twice.
    const concurrent = this.store.state.mediaTasks.find(
      (t) =>
        t.signature === signature &&
        ["submitting", "running", "paused", "uncertain"].includes(t.status),
    );
    if (concurrent) return concurrent;
    const current = this.store.project(projectId);
    const target = current.scenes.find((scene) => scene.id === sceneId);
    if (
      !target ||
      current.style !== p.style ||
      current.aspect !== p.aspect ||
      mediaFingerprint(target, kind) !== mediaFingerprint(s, kind)
    )
      throw new AppError(409, "加载风格资料时镜头已改变，请检查后重新提交");
    const task = {
      id: uid(),
      projectId,
      sceneId,
      kind,
      signature,
      sourceText: kind === "image" ? s.visual : s.narration,
      sourceStyle: p.style,
      sourceAspect: p.aspect,
      sourceFingerprint: mediaFingerprint(s, kind),
      status: "submitting",
      createdAt: new Date().toISOString(),
    };
    this.store.state.mediaTasks.unshift(task);
    this.store.persist();
    try {
      const body =
        kind === "image"
          ? {
              model: "gemini-3.1-flash-image-preview",
              text: `Create an original image in the ${context.name} style (${context.en || context.name}). Visual: ${s.visual}. Follow these material, colour and composition rules: ${context.rules}. ${context.evidence || ""} No text, numbers, logos or watermarks.`,
              imageSize: "1K",
              aspectRatio: p.aspect,
            }
          : {
              audioId: "e69f5c2bd6454e80b31e63dc6e6fc3ba",
              text: s.narration,
              lan: "zh-CN",
            };
      const result = await this.request(
        kind === "image"
          ? "/api/async/google_gemini_image"
          : "/api/async/do_tts_common",
        body,
      );
      if (!result?.taskId)
        throw new AppError(502, "未收到生成任务标识，请到控制台核对");
      task.taskId = String(result.taskId);
      task.status = "running";
      this.store.persist();
      this.poll(task.id);
      return task;
    } catch (e) {
      task.status =
        e instanceof AppError && e.status === 401 ? "failed" : "uncertain";
      task.error =
        task.status === "failed"
          ? "密钥未通过验证，请检查设置后重新生成"
          : "提交结果未能确认，请先在 DreamAPI 控制台核对，避免重复付费";
      this.store.persist();
      throw new AppError(502, task.error);
    }
  }
  async poll(id) {
    if (this.active.has(id)) return;
    const t = this.store.state.mediaTasks.find((t) => t.id === id);
    if (!t?.taskId) throw new AppError(400, "没有可以恢复的任务");
    if (t.status === "done" || t.status === "failed") return;
    t.status = "running";
    this.active.add(id);
    this.store.persist();
    try {
      for (let n = 0; n < (this.deps.maxPolls || 120); n++) {
        await new Promise((r) => setTimeout(r, this.deps.interval ?? 3000));
        const d = await this.request("/api/getAsyncResult", {
            taskId: t.taskId,
          }),
          status = d?.task?.status;
        if (status === 4) {
          t.status = "failed";
          t.error = "生成失败；重试将创建新的付费任务";
          break;
        }
        if (status !== 3) continue;
        const url =
          t.kind === "image"
            ? d.images?.[0]?.imageUrl
            : d.audios?.[0]?.audioUrl;
        if (!url) throw new AppError(502, "生成结果没有素材");
        t.asset = await (this.deps.download || downloadAsset)(
          url,
          t.kind,
          path.join(this.store.dir, "media"),
          this.deps,
        );
        const p = this.store.state.projects.find((p) => p.id === t.projectId),
          s = p?.scenes.find((s) => s.id === t.sceneId);
        t.applied = !!(
          s &&
          mediaFingerprint(s, t.kind) === t.sourceFingerprint &&
          p.style === t.sourceStyle &&
          p.aspect === t.sourceAspect
        );
        if (t.applied) {
          s[t.kind === "image" ? "image" : "audio"] = t.asset;
          this.store.touch(p);
        }
        t.status = "done";
        t.error = t.applied
          ? undefined
          : "镜头已修改，素材保留但未覆盖当前镜头";
        break;
      }
      if (t.status === "running") {
        t.status = "paused";
        t.error = "查询暂未完成，可恢复同一任务，不会重复扣费";
      }
    } catch (e) {
      t.status = "paused";
      t.error =
        (e instanceof AppError ? e.message + "；" : "") +
        "查询或下载中断，可恢复同一任务，不会重新提交";
    } finally {
      this.active.delete(id);
      this.store.persist();
    }
  }
}
