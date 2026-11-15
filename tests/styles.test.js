import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  UPSTREAM_STYLES,
  STYLES,
  CATEGORIES,
  STYLE_SOURCE,
  findStyles,
  getStyle,
} from "../shared/styles.js";
import { ProjectContentSchema, BriefSchema, starter } from "../shared/model.js";
import { Store, contentOf } from "../server/store.js";
import { ExportQueue } from "../server/render.js";
import {
  styleContext,
  syncStyleCache,
  sha256,
  cacheStyleFile,
} from "../server/style-library.js";
import {
  DreamProvider,
  planDeepseek,
  rewriteDeepseek,
} from "../server/providers.js";
const cache = path.resolve(".flare/style-library");
const hasCache = UPSTREAM_STYLES.every(
  (s) =>
    fs.existsSync(`${cache}/${s.slug}/STYLE.md`) &&
    fs.existsSync(`${cache}/${s.slug}/poster.jpg`),
);
const fixtureFetch = async (url) =>
  new Response(
    fs.readFileSync(
      path.join(cache, ...new URL(url).pathname.split("/").slice(-2)),
    ),
  );
function temp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "flare-styles-"));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
test("pinned99style metadata,15categories, all schemas and legacy compatibility", () => {
  assert.equal(UPSTREAM_STYLES.length, 99);
  assert.equal(CATEGORIES.length, 15);
  assert.equal(new Set(UPSTREAM_STYLES.map((s) => s.id)).size, 99);
  assert.equal(UPSTREAM_STYLES.filter((s) => s.mode === "native").length, 8);
  assert.equal(UPSTREAM_STYLES.filter((s) => s.mode === "image").length, 91);
  assert.ok(!getStyle("opuscar:my-style"));
  for (const s of UPSTREAM_STYLES) {
    const upstream = `.flare/upstream/lemo-opuscar/styles/${s.slug}/style.json`;
    if (fs.existsSync(upstream)) {
      const source = JSON.parse(fs.readFileSync(upstream));
      assert.equal(s.num, Number(source.num));
      assert.equal(s.name, source.cn);
      assert.equal(s.en, source.en);
      assert.equal(s.categoryName, source.category_cn);
      assert.deepEqual(s.uses, source.uses);
    }
    for (const [file, digest] of [
      ["STYLE.md", s.guideSha256],
      ["poster.jpg", s.posterSha256],
    ]) {
      const cached = `${cache}/${s.slug}/${file}`;
      if (fs.existsSync(cached))
        assert.equal(sha256(fs.readFileSync(cached)), digest);
    }
  }
  for (const s of STYLES) {
    assert.equal(
      ProjectContentSchema.parse({ ...starter(), style: s.id }).style,
      s.id,
    );
    assert.ok(
      BriefSchema.safeParse({
        brief: "云朵落成了雨",
        style: s.id,
        aspect: "16:9",
        duration: 15,
        mode: "local",
      }).success,
    );
  }
  assert.ok(
    !ProjectContentSchema.safeParse({ ...starter(), style: "opuscar:unknown" })
      .success,
  );
  assert.equal(STYLE_SOURCE.commit, "3a7132b996be0241c1ea0ab180d519f06e6f10b6");
  assert.ok(findStyles({ query: "白板" }).some((s) => s.slug === "whiteboard"));
  assert.ok(
    findStyles({ query: "Whiteboard" }).some((s) => s.slug === "whiteboard"),
  );
  assert.ok(
    findStyles({ query: "ascii-crt" }).some((s) => s.slug === "ascii-crt"),
  );
  assert.ok(
    findStyles({ query: "Online courses" }).some(
      (s) => s.slug === "whiteboard",
    ),
  );
  for (const c of CATEGORIES)
    assert.ok(findStyles({ category: c.id }).every((s) => s.category === c.id));
});
test(
  "reproducible99cache sync, pinned hashes, corrupt cache recovery, unknown file rejection",
  {
    skip:
      !hasCache && "Run npm run styles:sync for source integration fixtures",
  },
  async (t) => {
    const dir = temp(t);
    let count = 0;
    const manifest = await syncStyleCache(dir, {
      fetcher: async (u) => {
        count++;
        return fixtureFetch(u);
      },
    });
    assert.equal(manifest.styles.length, 99);
    assert.equal(count, 198);
    await syncStyleCache(dir, {
      fetcher: () => {
        throw Error("cache should be reused");
      },
    });
    const s = getStyle("opuscar:whiteboard");
    fs.writeFileSync(`${dir}/whiteboard/STYLE.md`, "tampered");
    await cacheStyleFile(s, "STYLE.md", dir, { fetcher: fixtureFetch });
    assert.equal(
      sha256(fs.readFileSync(`${dir}/whiteboard/STYLE.md`)),
      s.guideSha256,
    );
    await assert.rejects(cacheStyleFile(s, "../settings.json", dir), /不支持/);
    const empty = temp(t);
    await assert.rejects(
      cacheStyleFile(s, "STYLE.md", empty, {
        fetcher: async () => new Response("wrong"),
      }),
      /校验/,
    );
    assert.ok(!fs.existsSync(`${empty}/whiteboard/STYLE.md`));
  },
);
test("all style changes preserve content and persist; missing and partial images block without jobs", (t) => {
  const dir = temp(t),
    store = new Store(dir),
    p = store.state.projects[0],
    original = contentOf(p),
    source = p.source;
  for (const style of STYLES) {
    const c = contentOf(p);
    c.style = style.id;
    store.update(p.id, p.revision, c);
    assert.deepEqual({ ...contentOf(p), style: original.style }, original);
    assert.equal(p.source, source);
  }
  const c = contentOf(p);
  c.style = "opuscar:watercolor";
  store.update(p.id, p.revision, c);
  const q = new ExportQueue(store, { renderer: async () => {} });
  assert.throws(() => q.enqueue(p.id), /尚未添加图片/);
  assert.equal(store.state.exports.length, 0);
  c.scenes[0].image = "/media/one.png";
  store.update(p.id, p.revision, c);
  assert.throws(() => q.enqueue(p.id), /尚未添加图片/);
  assert.equal(store.state.exports.length, 0);
  const loaded = new Store(dir).project(p.id);
  assert.equal(loaded.style, "opuscar:watercolor");
  assert.equal(loaded.scenes[0].image, "/media/one.png");
});
test(
  "source rules condition plan, rewrite and image independently; async paid dedupe and changed target guard",
  {
    skip:
      !hasCache && "Run npm run styles:sync for source integration fixtures",
  },
  async (t) => {
    const dir = temp(t),
      store = new Store(dir);
    store.saveSettings({ dreamapiKey: "fixture-only-key" });
    for (const slug of ["whiteboard", "neon-tubes"]) {
      const id = "opuscar:" + slug,
        context = await styleContext(store, id, { fetcher: fixtureFetch });
      assert.ok(context.rules.length > 100);
      assert.ok(context.rules.includes("#"));
      const captures = [];
      const scene = { ...starter().scenes[0] };
      delete scene.id;
      const fetcher = async (u, opts) => {
        const d = JSON.parse(opts.body);
        captures.push(d);
        const name = d.tools[0].function.name;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        name,
                        arguments: JSON.stringify(
                          name === "emit_scene"
                            ? scene
                            : {
                                title: "fixture",
                                scenes: [{ ...scene, duration: 15 }],
                              },
                        ),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        );
      };
      const p = await planDeepseek(
        { brief: "一朵云", style: id, aspect: "16:9", duration: 15 },
        "fake-key",
        "fixture",
        { fetcher, styleContext: context },
      );
      await rewriteDeepseek(
        starter().scenes[0],
        "只调整画面",
        "fake-key",
        "fixture",
        { fetcher, styleContext: context },
      );
      for (const d of captures) {
        assert.ok(d.messages[0].content.includes(context.name));
        assert.ok(
          d.messages[0].content.includes(
            JSON.stringify(context.rules).slice(1, -1),
          ),
        );
      }
      const project = store.create({ ...starter(), style: id }, "local"),
        calls = [];
      const dream = new DreamProvider(store, {
        guideFetcher: fixtureFetch,
        fetcher: async (u, opts) => {
          calls.push(JSON.parse(opts.body));
          return new Response(
            JSON.stringify({ code: 0, data: { taskId: "fixture" } }),
          );
        },
      });
      dream.poll = async () => {};
      const [a, b] = await Promise.all([
        dream.start(project.id, project.scenes[0].id, "image", true),
        dream.start(project.id, project.scenes[0].id, "image", true),
      ]);
      assert.equal(a.id, b.id);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].text.includes(context.rules));
      assert.ok(calls[0].text.includes(context.name));
    }
    const p = store.create(
      { ...starter(), style: "opuscar:chalkboard" },
      "local",
    );
    let release;
    const gate = new Promise((r) => (release = r));
    const dream = new DreamProvider(store, {
      guideFetcher: async (u) => {
        await gate;
        return fixtureFetch(u);
      },
      fetcher: () => {
        throw Error("must not submit");
      },
    });
    const pending = dream.start(p.id, p.scenes[0].id, "image", true);
    const c = contentOf(p);
    c.style = "paper";
    store.update(p.id, p.revision, c);
    release();
    await assert.rejects(pending, /镜头已改变/);
  },
);
