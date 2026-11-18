import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { Store, contentOf } from "../server/store.js";
import { createApp } from "../server/app.js";
import { ExportQueue, wavBuffer } from "../server/render.js";
import {
  privateIP,
  publicAddresses,
  validateAssetURL,
  downloadAsset,
  jsonRequest,
  planDeepseek,
  rewriteDeepseek,
  DreamProvider,
} from "../server/providers.js";
import {
  ProjectContentSchema,
  localPlan,
  starter,
  totalDuration,
  makeSrt,
  dimensions,
} from "../shared/model.js";
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "flare-test-"));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await delay(10);
  }
  throw Error("timed out");
}
async function fixture(t, options = {}) {
  const dir = temporary(),
    a = await createApp({ dir, ...options });
  const server = a.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  a.queue.baseUrl = base;
  t.after(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    ...a,
    dir,
    base,
    request: async (url, method = "GET", body) => {
      const r = await fetch(base + url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    },
  };
}
test("original templates, bounded planner, ratios and subtitle timings", () => {
  const p = starter();
  assert.equal(totalDuration(p), 30);
  assert.equal(ProjectContentSchema.parse(p).scenes.length, 5);
  assert.deepEqual(dimensions("16:9", 720), [1280, 720]);
  assert.deepEqual(dimensions("9:16", 1080), [1080, 1920]);
  assert.deepEqual(dimensions("1:1"), [720, 720]);
  assert.match(makeSrt(p), /00:00:00,000 --> 00:00:06,000/);
  for (const style of ["paper", "blueprint", "noir"])
    for (const duration of [15, 30, 60, 90]) {
      const p = localPlan({
        brief: "山上的一朵云，变成雨。",
        title: "雨",
        style,
        aspect: "9:16",
        duration,
      });
      assert.ok(p.scenes.every((s) => s.duration <= 30));
      assert.ok(Math.abs(totalDuration(p) - duration) < 0.2);
    }
  assert.throws(() =>
    ProjectContentSchema.parse({
      ...p,
      scenes: [{ ...p.scenes[0], duration: -1 }],
    }),
  );
  assert.throws(() =>
    ProjectContentSchema.parse({
      ...p,
      scenes: [{ ...p.scenes[0], image: "/etc/passwd" }],
    }),
  );
});
test("atomic persistence, optimistic concurrency and per-shot undo preserves unrelated edits", () => {
  const dir = temporary();
  try {
    const store = new Store(dir),
      p = store.state.projects[0],
      id = p.id;
    let c = contentOf(p);
    c.scenes[0].title = "第一镜修改";
    store.update(id, p.revision, c);
    c = contentOf(p);
    c.scenes[1].title = "第二镜修改";
    store.update(id, p.revision, c);
    store.undo(id, p.scenes[0].id, p.revision);
    assert.equal(p.scenes[0].title, starter().scenes[0].title);
    assert.equal(p.scenes[1].title, "第二镜修改");
    assert.throws(() => store.update(id, 1, contentOf(p)), /项目已更新/);
    assert.equal(new Store(dir).project(id).scenes[1].title, "第二镜修改");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("undo cannot persist a film outside the shared duration constraints", () => {
  const dir = temporary();
  try {
    const store = new Store(dir);
    let c = starter();
    c.scenes = c.scenes.slice(0, 4).map((s) => ({ ...s, duration: 30 }));
    const p = store.create(c);
    c = contentOf(p);
    c.scenes[0].duration = 1;
    store.update(p.id, p.revision, c);
    c = contentOf(p);
    c.scenes.push({ ...c.scenes[1], id: "extra-scene", duration: 29 });
    store.update(p.id, p.revision, c);
    const before = fs.readFileSync(store.file, "utf8"),
      revision = p.revision;
    assert.throws(() => store.undo(p.id, p.scenes[0].id, p.revision));
    assert.equal(totalDuration(p), 120);
    assert.equal(p.revision, revision);
    assert.equal(fs.readFileSync(store.file, "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("long scripts are preserved or explicitly rejected, never truncated or duplicated", () => {
  for (const duration of [15, 30, 90]) {
    const brief = "山".repeat(2000),
      p = localPlan({ brief, style: "paper", aspect: "16:9", duration });
    assert.equal(p.scenes.map((s) => s.narration).join(""), brief);
    assert.equal(totalDuration(p), duration);
  }
  const brief = "云落成雨。";
  const p = localPlan({ brief, style: "paper", aspect: "16:9", duration: 90 });
  assert.equal(p.scenes.map((s) => s.narration).join(""), brief);
  assert.equal(totalDuration(p), 90);
  assert.throws(
    () =>
      localPlan({
        brief: "山".repeat(6000),
        style: "paper",
        aspect: "16:9",
        duration: 30,
      }),
    /剧本较长/,
  );
});
test("HTTP validation, invalid import preservation, secret isolation and loopback host/origin guards", async (t) => {
  const a = await fixture(t),
    p = a.store.state.projects[0],
    before = fs.readFileSync(a.store.file, "utf8");
  assert.equal(
    (
      await a.request("/api/projects/import", "POST", {
        ...starter(),
        scenes: [{ ...starter().scenes[0], duration: 0 }],
      })
    ).status,
    400,
  );
  assert.equal(fs.readFileSync(a.store.file, "utf8"), before);
  assert.equal(
    (
      await a.request(`/api/projects/${p.id}`, "PATCH", {
        revision: 1,
        content: {
          ...contentOf(p),
          scenes: [{ ...p.scenes[0], image: "/media/../../secret.png" }],
        },
      })
    ).status,
    400,
  );
  assert.equal(fs.readFileSync(a.store.file, "utf8"), before);
  const secret = "test-secret-never-echo-this";
  const saved = await a.request("/api/settings", "PATCH", {
    deepseekKey: secret,
    dreamapiKey: secret,
  });
  assert.equal(saved.status, 200);
  assert.ok(!JSON.stringify(saved).includes(secret));
  // Windows uses inherited ACLs rather than POSIX permission bits.
  if (process.platform !== "win32")
    assert.equal(fs.statSync(a.store.settingsFile).mode & 0o777, 0o600);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.request(
      a.base + "/api/health",
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  const origin = await fetch(a.base + "/api/settings", {
    method: "PATCH",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(origin.status, 403);
  const error = await a.request("/api/settings", "PATCH", {
    deepseekKey: "tiny",
  });
  assert.ok(!JSON.stringify(error).includes("tiny"));
  assert.equal(
    (
      await a.request(
        `/api/projects/${p.id}/scenes/${p.scenes[0].id}/generate`,
        "POST",
        { kind: "image", confirmPaid: false },
      )
    ).status,
    400,
  );
});
test("immutable snapshots, idempotent queue, cancellation, retry and interrupted restart", async (t) => {
  let released = false;
  const a = await fixture(t, {
      renderFn: async (j, signal) => {
        await waitFor(() => released || signal.aborted);
        if (signal.aborted) throw Error("cancelled");
      },
    }),
    p = a.store.state.projects[0];
  const j = a.queue.enqueue(p.id, { quality: 720, requestKey: "same" });
  assert.equal(
    a.queue.enqueue(p.id, { quality: 720, requestKey: "same" }).id,
    j.id,
  );
  await waitFor(() => j.status === "running");
  let c = contentOf(p);
  c.scenes[0].title = "later";
  a.store.update(p.id, p.revision, c);
  assert.notEqual(j.snapshot.scenes[0].title, "later");
  a.queue.cancel(j.id);
  await waitFor(() => !a.queue.pumping);
  assert.equal(j.status, "cancelled");
  const dir = path.join(a.dir, "exports", j.id);
  assert.ok(!fs.existsSync(path.join(dir, "partial.mp4")));
  const retry = a.queue.enqueue(p.id, { requestKey: "retry" });
  assert.notEqual(retry.id, j.id);
  released = true;
  await waitFor(() => retry.status === "done");
  a.store.state.exports.push({
    ...j,
    id: "interrupted-job",
    status: "running",
  });
  a.store.state.mediaTasks.push({
    id: "resume-media",
    taskId: "same-provider-task",
    status: "running",
  });
  a.store.persist();
  const recovered = new Store(a.dir);
  assert.equal(recovered.state.exports.at(-1).status, "interrupted");
  assert.equal(recovered.state.mediaTasks.at(-1).status, "paused");
  assert.equal(recovered.state.mediaTasks.at(-1).taskId, "same-provider-task");
});
test("asset restrictions cover private targets, redirects, unsafe schemes, size and magic bytes", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(privateIP(ip), true);
  assert.equal(privateIP("8.8.8.8"), false);
  const lookup = async () => [{ address: "8.8.8.8" }];
  for (const u of [
    "http://example.com",
    "https://127.0.0.1/a",
    "file:///etc/passwd",
    "https://user:pw@example.com",
  ])
    await assert.rejects(validateAssetURL(u, lookup));
  await assert.rejects(
    validateAssetURL("https://private.test", async () => [
      { address: "10.0.0.3" },
    ]),
  );
  await assert.rejects(
    downloadAsset("https://public.test/a", "image", temporary(), {
      lookup,
      fetcher: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/secret" },
        }),
    }),
    /本地或私有/,
  );
  await assert.rejects(
    downloadAsset("https://public.test/a", "image", temporary(), {
      lookup,
      fetcher: async () =>
        new Response("bad", { headers: { "Content-Length": "999999999" } }),
    }),
    /过大/,
  );
  await assert.rejects(
    downloadAsset("https://public.test/a", "image", temporary(), {
      lookup,
      fetcher: async () => new Response('<svg onload="evil"/>'),
    }),
    /只支持/,
  );
});
test("proxy fake-IP DNS is resolved through a fixed HTTPS resolver without admitting private targets", async () => {
  const lookup = async () => [{ address: "198.18.0.33", family: 4 }];
  const addresses = await publicAddresses(
    "fixture-public.test",
    lookup,
    async (url) => {
      assert.ok(String(url).startsWith("https://dns.google/resolve?"));
      return new Response(
        JSON.stringify({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] }),
      );
    },
  );
  assert.equal(addresses[0].address, "8.8.8.8");
  await assert.rejects(
    publicAddresses(
      "fixture-private.test",
      lookup,
      async () =>
        new Response(
          JSON.stringify({
            Status: 0,
            Answer: [{ type: 1, data: "127.0.0.1" }],
          }),
        ),
    ),
    /未能确认/,
  );
});
test("provider errors and malformed plan fail without exposing secrets or silent fallback", async () => {
  const input = {
    brief: "山上的一朵云。",
    style: "paper",
    aspect: "16:9",
    duration: 15,
  };
  await assert.rejects(
    planDeepseek(input, "secret", "model", {
      fetcher: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "not valid" } }] }),
        ),
    }),
    /不符合格式/,
  );
  await assert.rejects(
    jsonRequest(
      "https://example.com",
      "secret",
      {},
      {
        fetcher: async () =>
          new Response("secret in provider body", { status: 401 }),
      },
    ),
    (e) => !e.message.includes("secret"),
  );
  await assert.rejects(
    jsonRequest(
      "https://example.com",
      "secret",
      {},
      {
        fetcher: async () => {
          throw new DOMException("secret", "TimeoutError");
        },
      },
    ),
    /超时/,
  );
});
test("single-scene AI revision preserves identity, invalidates stale media and rejects invalid output", async () => {
  const scene = {
    ...starter().scenes[0],
    image: "/media/original.png",
    audio: "/media/original.wav",
  };
  const next = {
    ...scene,
    title: "更短的标题",
    narration: "新的旁白",
    visual: "新的画面",
  };
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: "emit_scene",
                    arguments: JSON.stringify(next),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
  const r = await rewriteDeepseek(scene, "更简短", "test-secret", "model", {
    fetcher,
  });
  assert.equal(r.id, scene.id);
  assert.equal(r.title, "更短的标题");
  assert.equal(r.audio, undefined);
  assert.equal(r.image, undefined);
  await assert.rejects(
    rewriteDeepseek(scene, "改写", "", "model", { fetcher }),
    /配置 DeepSeek/,
  );
});
test("real mock HTTP DeepSeek and DreamAPI success, dedupe, retained task identity and stale target", async (t) => {
  const calls = [];
  let ready = false;
  const provider = http.createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    const d = JSON.parse(body || "{}");
    calls.push({ url: req.url, body: d });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/chat/completions")
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "emit_storyboard",
                      arguments: JSON.stringify({
                        title: "模拟分镜",
                        scenes: [
                          {
                            title: "云",
                            narration: "云落成雨。",
                            visual: "一朵云",
                            duration: 15,
                            art: "landscape",
                            accent: "#cc5533",
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    else if (req.url === "/api/getAsyncResult")
      res.end(
        JSON.stringify({
          code: 0,
          data: {
            task: { taskId: d.taskId, status: ready ? 3 : 1 },
            images: [{ imageUrl: "https://public.test/frame.png" }],
            audios: [{ audioUrl: "https://public.test/voice.wav" }],
          },
        }),
      );
    else
      res.end(
        JSON.stringify({ code: 0, data: { taskId: "remote-" + calls.length } }),
      );
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  t.after(() => {
    provider.closeAllConnections();
    provider.close();
  });
  const baseUrl = `http://127.0.0.1:${provider.address().port}`,
    dir = temporary();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  store.saveSettings({
    deepseekKey: "test-secret",
    dreamapiKey: "test-secret",
  });
  const plan = await planDeepseek(
    { brief: "云落成雨。", style: "paper", aspect: "16:9", duration: 15 },
    "test-secret",
    "model",
    { baseUrl },
  );
  assert.equal(plan.scenes[0].title, "云");
  const p = store.create(plan, "deepseek");
  const downloads = [];
  const dream = new DreamProvider(store, {
    baseUrl,
    interval: 2,
    maxPolls: 100,
    download: async (url, kind) => {
      downloads.push(kind);
      const name = kind === "image" ? "fixture.png" : "fixture.wav";
      fs.writeFileSync(
        path.join(dir, "media", name),
        kind === "audio"
          ? wavBuffer(new Float32Array(2400))
          : Buffer.from("fixture"),
      );
      return "/media/" + name;
    },
  });
  const image = await dream.start(p.id, p.scenes[0].id, "image", true);
  assert.equal(
    (await dream.start(p.id, p.scenes[0].id, "image", true)).id,
    image.id,
  );
  ready = true;
  await waitFor(() => image.status === "done");
  assert.equal(p.scenes[0].image, "/media/fixture.png");
  assert.equal(image.applied, true);
  ready = false;
  const audio = await dream.start(p.id, p.scenes[0].id, "audio", true);
  const c = contentOf(p);
  c.scenes[0].narration = "更新过的旁白";
  store.update(p.id, p.revision, c);
  ready = true;
  await waitFor(() => audio.status === "done");
  assert.equal(audio.applied, false);
  assert.ok(!p.scenes[0].audio);
  assert.ok(audio.taskId.startsWith("remote-"));
  assert.deepEqual(downloads, ["image", "audio"]);
  assert.ok(calls.some((c) => c.url === "/api/getAsyncResult"));
  ready = false;
  const staleImage = await dream.start(p.id, p.scenes[0].id, "image", true);
  const newer = contentOf(p);
  newer.scenes[0].image = "/media/new-user-image.png";
  fs.writeFileSync(
    path.join(dir, "media", "new-user-image.png"),
    Buffer.from("user image"),
  );
  store.update(p.id, p.revision, newer);
  ready = true;
  await waitFor(() => staleImage.status === "done");
  assert.equal(staleImage.applied, false);
  assert.equal(p.scenes[0].image, "/media/new-user-image.png");
  ready = false;
  const freshImage = await dream.start(p.id, p.scenes[0].id, "image", true),
    freshAudio = await dream.start(p.id, p.scenes[0].id, "audio", true);
  ready = true;
  await waitFor(
    () => freshImage.status === "done" && freshAudio.status === "done",
  );
  assert.equal(freshImage.applied, true);
  assert.equal(freshAudio.applied, true);
});

test("project deletion checks revisions and unfinished work, preserves shared assets and export snapshots", async (t) => {
  const a = await fixture(t);
  const p = a.store.state.projects[0];
  const other = a.store.create(contentOf(p));
  const asset = path.join(a.dir, "media", "shared.png");
  fs.writeFileSync(asset, "shared asset");
  a.store.state.exports.push({
    id: "saved-export",
    projectId: p.id,
    status: "done",
    snapshot: contentOf(p),
  });
  a.store.persist();
  const url = `/api/projects/${p.id}`;
  assert.equal((await a.request(url, "DELETE", {})).status, 400);
  assert.equal(
    (await a.request(url, "DELETE", { revision: p.revision + 1 })).status,
    409,
  );
  for (const status of ["queued", "running"]) {
    a.store.state.exports.push({ id: "busy", projectId: p.id, status });
    assert.equal(
      (await a.request(url, "DELETE", { revision: p.revision })).status,
      409,
    );
    a.store.state.exports.pop();
  }
  for (const status of ["submitting", "running", "paused", "uncertain"]) {
    a.store.state.mediaTasks.push({ id: "busy", projectId: p.id, status });
    assert.equal(
      (await a.request(url, "DELETE", { revision: p.revision })).status,
      409,
    );
    a.store.state.mediaTasks.pop();
  }
  assert.equal(
    (await a.request(url, "DELETE", { revision: p.revision })).status,
    200,
  );
  assert.equal((await a.request(url)).status, 404);
  assert.equal(
    (await a.request(url, "DELETE", { revision: p.revision })).status,
    404,
  );
  assert.ok(fs.existsSync(asset));
  assert.equal(a.store.state.exports[0].snapshot.title, p.title);
  assert.equal(new Store(a.dir).state.projects[0].id, other.id);
  assert.equal(
    (
      await a.request(`/api/projects/${other.id}`, "DELETE", {
        revision: other.revision,
      })
    ).status,
    200,
  );
  assert.equal(new Store(a.dir).state.projects.length, 0);
});

test("DeepSeek forced storyboard and shot tools explicitly disable incompatible default thinking", async () => {
  const s = { ...starter().scenes[0], duration: 15 };
  const { id, ...fields } = s;
  const fetcher = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.thinking, { type: "disabled" });
    const name = body.tool_choice.function.name;
    return Response.json({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name,
                  arguments: JSON.stringify(
                    name === "emit_scene"
                      ? fields
                      : { title: "测试", scenes: [fields] },
                  ),
                },
              },
            ],
          },
        },
      ],
    });
  };
  const p = await planDeepseek(
    {
      title: "测试",
      brief: "清晨翻开一本书",
      style: "paper",
      aspect: "16:9",
      duration: 15,
    },
    "test-key",
    "deepseek-flash",
    { fetcher },
  );
  assert.equal(p.scenes.length, 1);
  assert.equal(
    (
      await rewriteDeepseek(s, "保持内容", "test-key", "deepseek-flash", {
        fetcher,
      })
    ).id,
    s.id,
  );
});

test("local media and downloads are readable under the actual hidden .flare directory without exposing settings", async (t) => {
  const parent = temporary(),
    dir = path.join(parent, ".flare");
  const a = await createApp({ dir });
  const server = a.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(parent, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(dir, "media", "test.jpg"), "image bytes");
  const r = await fetch(base + "/media/test.jpg");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "image bytes");
  const j = {
    id: "saved-export",
    projectId: a.store.state.projects[0].id,
    status: "done",
  };
  a.store.state.exports.push(j);
  fs.mkdirSync(path.join(dir, "exports", j.id));
  fs.writeFileSync(path.join(dir, "exports", j.id, "film.mp4"), "video bytes");
  const film = await fetch(base + `/api/exports/${j.id}/film.mp4`);
  assert.equal(film.status, 200);
  assert.equal(await film.text(), "video bytes");
  assert.match(film.headers.get("content-disposition"), /attachment/);
  assert.equal((await fetch(base + "/media/settings.json")).status, 404);
  assert.equal(
    (await fetch(base + `/api/exports/${j.id}/settings.json`)).status,
    404,
  );
});
