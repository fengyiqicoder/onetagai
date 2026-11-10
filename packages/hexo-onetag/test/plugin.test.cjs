"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const plugin = require("..");

function fakeHexo(config, extra) {
  const calls = { injector: [], generators: {}, events: {}, warn: [], info: [] };
  const hexo = Object.assign({
    config: Object.assign({ title: "My Blog", description: "Notes on things", url: "https://example.com", root: "/" }, config),
    source_dir: fs.mkdtempSync(path.join(os.tmpdir(), "hexo-onetag-")),
    extend: {
      injector: { register: (entry, value, to) => calls.injector.push({ entry, value, to }) },
      generator: { register: (name, fn) => { calls.generators[name] = fn; } },
    },
    on: (ev, fn) => { (calls.events[ev] = calls.events[ev] || []).push(fn); },
    log: { warn: (m) => calls.warn.push(m), info: (m) => calls.info.push(m) },
  }, extra);
  return { hexo, calls, emit: (ev) => (calls.events[ev] || []).forEach((fn) => fn()) };
}

const locals = {
  posts: { toArray: () => [
    { title: "Old post", path: "2023/01/01/old/", date: new Date("2023-01-01"), published: true, content: "<p>The old post explains how to install the thing on a server.</p>" },
    { title: "New post", path: "2024/05/01/new/", date: new Date("2024-05-01"), published: true, description: "What changed", content: "<h2 id=\"setup\">Setup</h2><p>Run hexo generate and then deploy the public folder.</p>" },
    { title: "Draft", path: "2024/06/01/draft/", date: new Date("2024-06-01"), published: false, content: "<p>Not ready yet, should never appear in the files.</p>" },
  ] },
  pages: { toArray: () => [
    { title: "About", path: "about/index.html", source: "about/index.md", content: "<p>About this blog. It is written by one person who likes static sites.</p>" },
  ] },
};

const run = (h) => h.calls.generators.onetag_llms.call(h.hexo, locals);
const route = (routes, name) => (routes.find((r) => r.path === name) || {}).data;

test("snake_case and camelCase options, key from config wins over env", () => {
  const o = plugin.readOptions({ onetag: { key: "ot_abc", ask_ai: false, placeholder: "Ask", color: "#ff6600" } }, { ONETAG_KEY: "ot_env" });
  assert.equal(o.key, "ot_abc");
  assert.equal(o.askAi, false);
  assert.equal(o.llms, true);
  assert.equal(o.color, "ff6600");
  assert.equal(plugin.readOptions({ onetag: { askAi: "false", llms: false } }, {}).askAi, false);
  assert.equal(plugin.readOptions({ onetag: { askAi: "false", llms: false } }, {}).llms, false);
});

test("key falls back to ONETAG_KEY, then the demo key", () => {
  assert.equal(plugin.readOptions({}, { ONETAG_KEY: "ot_env" }).key, "ot_env");
  const o = plugin.readOptions({}, {});
  assert.equal(o.key, plugin.DEMO_KEY);
  assert.equal(o.demo, true);
  assert.equal(plugin.readOptions({ onetag: { key: "ot_..." } }, {}).demo, true);
});

test("the tag carries key, ref and options", () => {
  const t = plugin.tag(plugin.readOptions({ onetag: { key: "ot_abc", label: "Ask the blog", position: "left" } }, {}));
  assert.match(t, /^<script async src="https:\/\/onetagai\.com\/ask-docs\.js"/);
  assert.match(t, /data-key="ot_abc"/);
  assert.match(t, /data-ref="hexo-onetag"/);
  assert.match(t, /data-label="Ask the blog"/);
  assert.match(t, /data-position="left"/);
});

test("register: one body_end injector for every page, no warning with a key", () => {
  const saved = process.env.ONETAG_KEY; delete process.env.ONETAG_KEY;
  const h = fakeHexo({ onetag: { key: "ot_abc" } });
  plugin.register(h.hexo);
  assert.equal(h.calls.injector.length, 1);
  assert.equal(h.calls.injector[0].entry, "body_end");
  assert.equal(h.calls.injector[0].to, "default");
  assert.match(h.calls.injector[0].value, /data-key="ot_abc"/);
  h.emit("generateBefore");
  assert.equal(h.calls.warn.length, 0);
  if (saved !== undefined) process.env.ONETAG_KEY = saved;
});

test("no key: demo key and exactly one warning across several generations", () => {
  const saved = process.env.ONETAG_KEY; delete process.env.ONETAG_KEY;
  const h = fakeHexo({});
  plugin.register(h.hexo);
  assert.match(h.calls.injector[0].value, /data-key="ot_demo000000000000000000000"/);
  h.emit("generateBefore"); h.emit("generateBefore"); h.emit("generateBefore");
  assert.equal(h.calls.warn.length, 1);
  assert.match(h.calls.warn[0], /localhost only/);
  assert.match(h.calls.warn[0], /api\/signup/);
  if (saved !== undefined) process.env.ONETAG_KEY = saved;
});

test("ask_ai: false adds no tag and no warning; llms: false adds no generator", () => {
  const a = fakeHexo({ onetag: { ask_ai: false } });
  plugin.register(a.hexo);
  a.emit("generateBefore");
  assert.equal(a.calls.injector.length, 0);
  assert.equal(a.calls.warn.length, 0);
  assert.ok(a.calls.generators.onetag_llms);
  const b = fakeHexo({ onetag: { llms: false, key: "ot_abc" } });
  plugin.register(b.hexo);
  assert.equal(b.calls.injector.length, 1);
  assert.equal(b.calls.generators.onetag_llms, undefined);
});

test("llms.txt and llms-full.txt from posts and pages, drafts left out", () => {
  const h = fakeHexo({ onetag: { key: "ot_abc" } });
  plugin.register(h.hexo);
  const routes = run(h);
  assert.deepEqual(routes.map((r) => r.path), ["llms.txt", "llms-full.txt"]);
  const llms = route(routes, "llms.txt"), full = route(routes, "llms-full.txt");
  assert.match(llms, /^# My Blog\n\n> Notes on things\n/);
  assert.match(llms, /- \[About\]\(https:\/\/example\.com\/about\/index\.html\)/);
  assert.match(llms, /- \[New post\]\(https:\/\/example\.com\/2024\/05\/01\/new\/\): What changed/);
  assert.match(llms, /\(https:\/\/example\.com\/llms-full\.txt\)/);
  assert.ok(llms.indexOf("New post") < llms.indexOf("Old post"), "newest post first");
  assert.doesNotMatch(llms + full, /Draft|Not ready/);
  assert.match(full, /# Old post\n\nSource: https:\/\/example\.com\/2023\/01\/01\/old\/\n/);
  assert.match(full, /## Setup\n\nSource: https:\/\/example\.com\/2024\/05\/01\/new\/#setup/);
});

test("root: /blog/ makes every link start with the subfolder, once", () => {
  for (const url of ["https://example.com", "https://example.com/blog", "https://example.com/blog/"]) {
    const h = fakeHexo({ url, root: "/blog/", pretty_urls: { trailing_index: false } });
    plugin.register(h.hexo);
    const llms = route(run(h), "llms.txt");
    assert.match(llms, /\(https:\/\/example\.com\/blog\/about\/\)/, url);
    assert.match(llms, /\(https:\/\/example\.com\/blog\/llms-full\.txt\)/, url);
    assert.doesNotMatch(llms, /blog\/blog/, url);
  }
});

test("exclude globs and a hand-written source/llms.txt", () => {
  const h = fakeHexo({ onetag: { exclude: ["2023/**", "about/*"] } });
  fs.writeFileSync(path.join(h.hexo.source_dir, "llms.txt"), "# mine\n");
  plugin.register(h.hexo);
  const routes = run(h);
  assert.deepEqual(routes.map((r) => r.path), ["llms-full.txt"]);
  const full = route(routes, "llms-full.txt");
  assert.match(full, /# New post/);
  assert.doesNotMatch(full, /Old post|About this blog/);
});

test("the plugin file registers itself when Hexo runs it with `hexo` in scope", () => {
  const h = fakeHexo({ onetag: { key: "ot_abc" } });
  const file = require.resolve("..");
  const src = fs.readFileSync(file, "utf8");
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", "hexo", src);
  const mod = { exports: {} };
  fn(mod.exports, require("node:module").createRequire(file), mod, file, path.dirname(file), h.hexo);
  assert.equal(h.calls.injector.length, 1);
  assert.ok(h.calls.generators.onetag_llms);
});

test("Hexo's line-numbered code tables become fenced code", () => {
  const html = '<figure class="highlight bash"><table><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br></pre></td><td class="code"><pre><span class="line">$ hexo new &quot;Post&quot;</span><br><span class="line">$ hexo server</span><br></pre></td></tr></table></figure>';
  const h = fakeHexo({ description: "" });
  plugin.register(h.hexo);
  const routes = h.calls.generators.onetag_llms.call(h.hexo, { posts: [], pages: [{ title: "Code", path: "code/index.html", content: "<p>Two commands that you will need when writing.</p>" + html }] });
  const full = route(routes, "llms-full.txt"), llms = route(routes, "llms.txt");
  assert.match(full, /```bash\n\$ hexo new "Post"\n\$ hexo server\n```/);
  assert.doesNotMatch(full, /\| 1 \|/);
  assert.match(llms, /^# My Blog\n\n## Pages\n/, "no borrowed description when the site has none");
  assert.match(llms, /\): Two commands that you will need when writing\./);
});
