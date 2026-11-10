import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import onetag from "../index.mjs";

const require = createRequire(import.meta.url);
const cjs = require("../index.cjs");
const I = cjs._internal;
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// A stand-in for eleventyConfig that records what the plugin registers.
function fakeConfig(prefix = "/") {
  const c = { transforms: {}, events: {} };
  c.addTransform = (name, fn) => { c.transforms[name] = fn; };
  c.on = (name, fn) => { c.events[name] = fn; };
  c.getFilter = (name) => (name === "url" ? (u) => prefix.replace(/\/$/, "") + u : undefined);
  return c;
}

function captureWarn(fn) {
  const seen = [];
  const orig = console.warn, origLog = console.log;
  console.warn = (...a) => seen.push(a.join(" "));
  console.log = () => {};
  try { fn(); } finally { console.warn = orig; console.log = origLog; }
  return seen;
}

function site(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onetag-11ty-"));
  for (const [rel, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), html);
  }
  return dir;
}
const page = (title, body) => `<!doctype html><html><head><title>${title}</title><meta name="description" content="About ${title}"></head><body><nav>menu</nav><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
const long = "This page has enough words in it to be listed in the llms files by the scanner.";

test("ESM and CommonJS entries are the same function", () => {
  assert.equal(onetag, cjs);
  assert.equal(typeof onetag, "function");
});

test("every published file exists and the name fits data-ref", () => {
  for (const f of pkg.files) assert.ok(fs.existsSync(new URL("../" + f, import.meta.url)), f);
  assert.ok(pkg.name.length <= 40 && pkg.name === pkg.name.toLowerCase());
  assert.ok(pkg.keywords.includes("eleventy-plugin"));
});

test("key option wins over ONETAG_KEY, which wins over the demo key", () => {
  assert.deepEqual(I.resolveKey({ key: "ot_a" }, { ONETAG_KEY: "ot_b" }), { key: "ot_a", demo: false });
  assert.deepEqual(I.resolveKey({}, { ONETAG_KEY: "ot_b" }), { key: "ot_b", demo: false });
  assert.deepEqual(I.resolveKey({}, {}), { key: I.DEMO_KEY, demo: true });
});

test("missing key prints one warning with the signup command, across several plugin calls", () => {
  I.resetWarning();
  const saved = process.env.ONETAG_KEY; delete process.env.ONETAG_KEY;
  const seen = captureWarn(() => { onetag(fakeConfig()); onetag(fakeConfig()); });
  if (saved !== undefined) process.env.ONETAG_KEY = saved;
  assert.equal(seen.length, 1);
  assert.match(seen[0], /localhost only/);
  assert.match(seen[0], /api\/signup/);
});

test("the tag carries key, ref and widget options", () => {
  const tag = I.tagFor({ label: "Ask", color: "#0b5fff", position: "left", theme: undefined }, "ot_x");
  assert.match(tag, /src="https:\/\/onetagai\.com\/ask-docs\.js"/);
  assert.match(tag, /data-key="ot_x"/);
  assert.match(tag, /data-ref="eleventy-onetag"/);
  assert.match(tag, /data-color="0b5fff"/);
  assert.match(tag, /data-position="left"/);
  assert.doesNotMatch(tag, /data-theme/);
});

test("the transform adds one tag to HTML pages only, and respects exclude", () => {
  const c = fakeConfig();
  captureWarn(() => onetag(c, { key: "ot_x", exclude: "tags/**" }));
  const t = c.transforms["onetag-ask-ai"];
  const html = "<html><body><p>hi</p></body></html>";
  const once = t.call({ page: { url: "/a/" } }, html, "_site/a/index.html");
  assert.equal((once.match(/ask-docs\.js/g) || []).length, 1);
  assert.equal(t.call({ page: { url: "/a/" } }, once, "_site/a/index.html"), once);
  assert.equal(t.call({ page: { url: "/feed.xml" } }, "<rss></rss>", "_site/feed.xml"), "<rss></rss>");
  assert.equal(t.call({ page: { url: "/tags/x/" } }, html, "_site/tags/x/index.html"), html);
  assert.equal(t.call({ page: {} }, html, false), html);
  assert.match(once, /data-index="\/llms-full\.txt"/);
});

test("data-index follows the path prefix, and is left out when there is no llms-full.txt", () => {
  const html = "<html><body></body></html>";
  const run = (opts, prefix) => { const c = fakeConfig(prefix); onetag(c, Object.assign({ key: "ot_x" }, opts)); return c.transforms["onetag-ask-ai"].call({ page: { url: "/" } }, html, "x/index.html"); };
  assert.match(run({}, "/blog/"), /data-index="\/blog\/llms-full\.txt"/);
  assert.doesNotMatch(run({ llms: false }, "/"), /data-index/);
  assert.doesNotMatch(run({ full: false }, "/"), /data-index/);
  assert.match(run({ index: "/search.json" }, "/"), /data-index="\/search\.json"/);
});

test("askAi: false registers no transform; llms: false registers no event", () => {
  const a = fakeConfig(); onetag(a, { askAi: false });
  assert.deepEqual(Object.keys(a.transforms), []);
  assert.ok(a.events["eleventy.after"]);
  const b = fakeConfig(); onetag(b, { key: "ot_x", llms: false });
  assert.ok(b.transforms["onetag-ask-ai"]);
  assert.equal(b.events["eleventy.after"], undefined);
});

test("eleventy.after writes llms files with the path prefix added to site", () => {
  const dir = site({ "index.html": page("Home", long), "posts/one/index.html": page("One", long), "404.html": page("Not found", long) });
  const c = fakeConfig("/blog/");
  onetag(c, { askAi: false, site: "https://example.com" });
  captureWarn(() => c.events["eleventy.after"]({ directories: { output: dir }, outputMode: "fs" }));
  const llms = fs.readFileSync(path.join(dir, "llms.txt"), "utf8");
  const full = fs.readFileSync(path.join(dir, "llms-full.txt"), "utf8");
  assert.match(llms, /\[One\]\(https:\/\/example\.com\/blog\/posts\/one\/\): About One/);
  assert.match(llms, /https:\/\/example\.com\/blog\/llms-full\.txt/);
  assert.doesNotMatch(llms, /Not found/);
  assert.match(full, /Source: https:\/\/example\.com\/blog\/posts\/one\//);
  assert.doesNotMatch(full, /menu/);
});

test("a site that already has the prefix is not doubled; no site gives prefixed paths", () => {
  assert.equal(I.siteWithPrefix("https://x.io/blog/", "/blog/"), "https://x.io/blog");
  assert.equal(I.siteWithPrefix("https://x.io", "/"), "https://x.io");
  const dir = site({ "index.html": page("Home", long), "a/index.html": page("A", long) });
  const r = I.writeLlms(dir, {}, "/blog/");
  assert.match(r.llms, /\[A\]\(\/blog\/a\/\)/);
  assert.match(r.llms, /\(\/blog\/llms-full\.txt\)/);
});

test("unchanged output is not rewritten, and a hand-written llms.txt is left alone", () => {
  const dir = site({ "index.html": page("Home", long) });
  assert.equal(I.writeLlms(dir, {}, "/").status["llms.txt"], "written");
  assert.equal(I.writeLlms(dir, {}, "/").status["llms.txt"], "same");
  fs.writeFileSync(path.join(dir, "llms.txt"), "# Mine\n");
  assert.equal(I.writeLlms(dir, {}, "/").status["llms.txt"], "skipped");
  assert.equal(fs.readFileSync(path.join(dir, "llms.txt"), "utf8"), "# Mine\n");
  assert.equal(I.writeLlms(dir, { force: true }, "/").status["llms.txt"], "written");
});

test("errors in eleventy.after are logged, never thrown", () => {
  const c = fakeConfig();
  onetag(c, { askAi: false });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onetag-x-")), "f");
  fs.writeFileSync(file, "not a dir");
  const seen = captureWarn(() => c.events["eleventy.after"]({ directories: { output: file } }));
  assert.equal(seen.length, 1);
  assert.match(seen[0], /could not write/);
});

test("json output mode writes nothing", () => {
  const dir = site({ "index.html": page("Home", long) });
  const c = fakeConfig(); onetag(c, { askAi: false });
  c.events["eleventy.after"]({ directories: { output: dir }, outputMode: "json" });
  assert.ok(!fs.existsSync(path.join(dir, "llms.txt")));
});
