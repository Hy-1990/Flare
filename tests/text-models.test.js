import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import {
  modelRequest,
  runTextCli,
  rewriteText,
} from "../server/text-models.js";
import { starter, makeSrt } from "../shared/model.js";
import { editImpact, visualOnly } from "../shared/editing.js";
import { createApp } from "../server/app.js";

const storeFor = (provider) => ({
  settings: {
    textProvider: provider,
    openaiModel: "test-gpt",
    anthropicModel: "test-claude",
  },
  keys: () => ({
    openaiKey: "private-openai-key",
    anthropicKey: "private-claude-key",
  }),
});
const original = starter().scenes[0];
const revised = {
  title: "Revised",
  narration: "New narration",
  visual: "New visual",
  duration: 3,
  art: "city",
  accent: "#112233",
};
test("GPT and Claude API use native structured output and shared scene validation", async () => {
  for (const provider of ["openai", "anthropic"]) {
    let seen;
    const fetcher = async (url, options) => {
      const body = JSON.parse(options.body);
      seen = { url, options, body };
      return Response.json(
        provider === "openai"
          ? {
              status: "completed",
              output: [
                {
                  content: [
                    { type: "output_text", text: JSON.stringify(revised) },
                  ],
                },
              ],
            }
          : {
              content: [
                { type: "tool_use", name: "emit_scene", input: revised },
              ],
            },
      );
    };
    const result = await rewriteText(
      { ...original, audio: "/media/old.wav" },
      "Improve visual",
      storeFor(provider),
      { fetcher },
    );
    assert.equal(result.id, original.id);
    assert.equal(result.audio, undefined);
    assert.equal(result.visual, revised.visual);
    if (provider === "openai") {
      assert.equal(seen.body.store, false);
      assert.equal(seen.body.text.format.strict, true);
      assert.equal(seen.url, "https://api.openai.com/v1/responses");
    } else {
      assert.equal(seen.body.tool_choice.name, "emit_scene");
      assert.equal(seen.options.headers["anthropic-version"], "2023-06-01");
    }
    await assert.rejects(
      rewriteText(original, "Improve", storeFor(provider), {
        fetcher: async () =>
          Response.json({ secret: "private-account-info" }, { status: 401 }),
      }),
      (e) => !e.message.includes("private-account-info") && e.status === 502,
    );
    await assert.rejects(
      rewriteText(original, "Improve", storeFor(provider), {
        fetcher: async () =>
          Response.json(
            provider === "openai"
              ? { status: "incomplete", output: [] }
              : { content: [] },
          ),
      }),
    );
  }
});
test("CLI backends pass data through the same validation, never executable output", async () => {
  for (const provider of ["codex", "claude"]) {
    const result = await rewriteText(original, "Improve", storeFor(provider), {
      runTextCli: async (p, m, prompt, schema) => {
        assert.equal(p, provider);
        assert.match(prompt, /Do not use tools/);
        assert.equal(schema.additionalProperties, false);
        return revised;
      },
    });
    assert.equal(result.id, original.id);
    await assert.rejects(
      rewriteText(original, "Improve", storeFor(provider), {
        runTextCli: async () => ({ ...revised, duration: -1 }),
      }),
    );
  }
});
function fakeSpawn(provider, { hang = false, error = false } = {}) {
  return (bin, args, opts) => {
    assert.equal(opts.shell, false);
    assert.equal(opts.env.OPENAI_API_KEY, undefined);
    assert.equal(opts.env.ANTHROPIC_API_KEY, undefined);
    assert.match(opts.cwd, /flare-text-/);
    if (provider === "codex") {
      assert.ok(args.includes("--ignore-rules"));
      assert.ok(args.includes("read-only"));
      assert.ok(args.includes("shell_tool"));
    } else {
      assert.equal(args[args.indexOf("--tools") + 1], "");
      assert.ok(args.includes("--safe-mode"));
      assert.ok(args.includes("--strict-mcp-config"));
    }
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => child.emit("close", 137);
    child.stdin.on("finish", () => {
      if (hang) return;
      if (provider === "codex")
        fs.writeFileSync(
          args[args.indexOf("--output-last-message") + 1],
          JSON.stringify(revised),
        );
      else child.stdout.write(JSON.stringify({ structured_output: revised }));
      child.stderr.write("private-account-info");
      child.emit("close", error ? 1 : 0);
    });
    return child;
  };
}
test("CLI subprocesses constrain tools, parse both protocols, clean up and recover after timeout", async () => {
  for (const provider of ["codex", "claude"]) {
    const options = { executable: "/fake/model", spawnFn: fakeSpawn(provider) };
    assert.deepEqual(
      await runTextCli(provider, "", "prompt", {}, options),
      revised,
    );
    await assert.rejects(
      runTextCli(
        provider,
        "",
        "prompt",
        {},
        {
          ...options,
          spawnFn: fakeSpawn(provider, { hang: true }),
          timeout: 10,
        },
      ),
      /超时/,
    );
    await assert.rejects(
      runTextCli(
        provider,
        "",
        "prompt",
        {},
        { ...options, spawnFn: fakeSpawn(provider, { error: true }) },
      ),
      (e) => !e.message.includes("private-account-info"),
    );
    assert.deepEqual(
      await runTextCli(provider, "", "prompt", {}, options),
      revised,
    );
  }
});
test("visual-only edits preserve subtitles, voice, identity and every shot boundary", () => {
  const p = starter();
  p.scenes[0].audio = "/media/voice.wav";
  const before = structuredClone(p),
    s = p.scenes[0];
  p.scenes[0] = visualOnly(s, {
    ...revised,
    id: "different",
    audio: undefined,
  });
  assert.equal(makeSrt(p), makeSrt(before));
  for (const key of ["id", "title", "duration", "narration", "audio"])
    assert.equal(p.scenes[0][key], s[key]);
  assert.equal(p.scenes[0].visual, revised.visual);
  assert.deepEqual(
    editImpact(s, { ...s, duration: s.duration + 2, narration: "Changed" }),
    { delta: 2, narrationChanged: true, removesVoice: true },
  );
});
test("HTTP visual endpoint rejects protected fields; AI preview never persists and lock survives model changes", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flare-edit-"));
  const a = await createApp({
    dir,
    providerDeps: { runTextCli: async () => revised },
  });
  a.store.saveSettings({ textProvider: "codex" });
  const server = a.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const request = async (url, method = "GET", body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  const p = (await request("/api/projects")).data[0],
    s = p.scenes[0],
    url = `/api/projects/${p.id}/scenes/${s.id}`;
  const preview = await request(url + "/rewrite", "POST", {
    instruction: "Improve visual",
    visualOnly: true,
    preview: true,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.scene.duration, s.duration);
  assert.equal(preview.data.scene.narration, s.narration);
  assert.equal(a.store.project(p.id).revision, p.revision);
  assert.deepEqual(a.store.project(p.id).scenes[0], s);
  const fields = {
    revision: p.revision,
    visual: revised.visual,
    art: revised.art,
    accent: revised.accent,
  };
  assert.equal(
    (await request(url + "/visual", "PATCH", { ...fields, duration: 1 }))
      .status,
    400,
  );
  const applied = await request(url + "/visual", "PATCH", fields);
  assert.equal(applied.status, 200);
  assert.equal(makeSrt(applied.data), makeSrt(p));
  assert.deepEqual(applied.data.scenes.slice(1), p.scenes.slice(1));
  assert.equal((await request(url + "/visual", "PATCH", fields)).status, 409);
  const undoUrl = `/api/projects/${p.id}/undo/${s.id}`;
  const undoPreview = await request(undoUrl, "POST", {
    revision: applied.data.revision,
    preview: true,
    visualOnly: true,
  });
  assert.equal(undoPreview.status, 200);
  assert.equal(undoPreview.data.scene.visual, s.visual);
  assert.equal(a.store.project(p.id).revision, applied.data.revision);
  const changed = await request(`/api/projects/${p.id}`, "PATCH", {
    revision: applied.data.revision,
    content: {
      ...applied.data,
      scenes: applied.data.scenes.map((shot, i) =>
        i ? shot : { ...shot, duration: shot.duration + 1 },
      ),
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(
    (
      await request(undoUrl, "POST", {
        revision: changed.data.revision,
        visualOnly: true,
      })
    ).status,
    409,
  );
  assert.equal(a.store.project(p.id).revision, changed.data.revision);
  const secretSettings = await request("/api/settings", "PATCH", {
    openaiKey: "test-secret-key-never-echo",
    anthropicKey: "test-anthropic-key-never-echo",
    openaiModel: "test-model",
    textProvider: "openai",
  });
  assert.equal(secretSettings.status, 200);
  assert.equal(secretSettings.data.textConfigured, true);
  assert.ok(!JSON.stringify(secretSettings.data).includes("never-echo"));
  await request("/api/settings", "PATCH", { textProvider: "codex" });
  const settings = (await request("/api/settings")).data;
  assert.equal(settings.textProvider, "codex");
  assert.equal(settings.openaiKey, undefined);
});
