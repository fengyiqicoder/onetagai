// Run with: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const plugin = require("..");
const { validateOptions, DEMO_KEY, _internal } = plugin;
const { normalizePluginOptions } = require("@docusaurus/utils-validation");
const pkg = require("../package.json");

const validate = (options) => validateOptions({ validate: normalizePluginOptions, options });
const context = (baseUrl = "/") => ({ baseUrl, siteConfig: { url: "https://acme.dev", baseUrl, title: "Acme Docs", tagline: "Anvils for everyone." } });

function quiet(fn) {
  const calls = [];
  const orig = console.warn;
  console.warn = (...a) => calls.push(a.join(" "));
  try { return { value: fn(), calls }; } finally { console.warn = orig; }
}
function make(options, baseUrl, env) {
  const saved = process.env.ONETAG_KEY;
  if (env === undefined) delete process.env.ONETAG_KEY; else process.env.ONETAG_KEY = env;
  try { return plugin(context(baseUrl), validate(options)); } finally { if (saved === undefined) delete process.env.ONETAG_KEY; else process.env.ONETAG_KEY = saved; }
}
const tagOf = (p) => p.injectHtmlTags().postBodyTags[0];

test("every published file exists and the package metadata follows the house rules", () => {
  for (const f of pkg.files) assert.ok(fs.existsSync(path.join(__dirname, "..", f)), f);
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.homepage, "https://onetagai.com/?ref=docusaurus-onetag");
  for (const k of ["docusaurus-plugin", "llms.txt", "ai", "ask-ai", "chatbot", "onetag"]) assert.ok(pkg.keywords.includes(k), k);
  assert.equal(pkg.dependencies["static-llms-txt"], "^0.1.1");
});

test("validateOptions fills defaults and accepts the plugin id", () => {
  const o = validate({});
  assert.equal(o.askAi, true);
  assert.equal(o.llms, true);
  assert.deepEqual(o.exclude, []);
  assert.equal(o.id, "default");
  assert.deepEqual(validate({ exclude: "docs/x/**" }).exclude, ["docs/x/**"]);
});

test("validateOptions rejects bad values", () => {
  assert.throws(() => validate({ position: "top" }), /position/);
  assert.throws(() => validate({ color: "blue" }), /color/);
  assert.throws(() => validate({ theme: "sepia" }), /theme/);
  assert.throws(() => validate({ askAi: "yes please" }), /askAi/);
  assert.throws(() => validate({ nope: 1 }), /nope/);
  assert.throws(() => validate({ features: ["explain", "translate"] }), /features/);
  assert.throws(() => validate({ features: "explain" }), /features/);
  assert.throws(() => validate({ features: ["search"], askAi: false }), /search.*askAi: false/);
});

test("key comes from the option, then ONETAG_KEY", () => {
  _internal.resetWarning();
  assert.match(tagOf(quiet(() => make({ key: "ot_option" }, "/", "ot_env")).value), /data-key="ot_option"/);
  assert.match(tagOf(quiet(() => make({}, "/", "ot_env")).value), /data-key="ot_env"/);
});

test("no key: demo key and exactly one warning with the signup command", () => {
  _internal.resetWarning();
  const { value, calls } = quiet(() => { const a = make({}); make({}); make({}); return a; });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /localhost only/);
  assert.match(calls[0], /curl -X POST https:\/\/onetagai\.com\/api\/signup/);
  assert.match(tagOf(value), new RegExp(`data-key="${DEMO_KEY}"`));
});

test("askAi: false adds no tag and prints no warning", () => {
  _internal.resetWarning();
  const { value, calls } = quiet(() => make({ askAi: false }));
  assert.deepEqual(value.injectHtmlTags(), {});
  assert.equal(calls.length, 0);
});

test("the tag carries ref, options and the llms-full.txt address under baseUrl", () => {
  const tag = tagOf(quiet(() => make({ key: "ot_x", label: "Ask the docs", position: "left", color: "#0b5fff", lang: "zh-CN" }, "/docs/")).value);
  assert.match(tag, /^<script async src="https:\/\/onetagai\.com\/ask-docs\.js"/);
  assert.match(tag, /data-ref="docusaurus-onetag"/);
  assert.match(tag, /data-label="Ask the docs"/);
  assert.match(tag, /data-position="left"/);
  assert.match(tag, /data-color="0b5fff"/);
  assert.match(tag, /data-lang="zh-CN"/);
  assert.match(tag, /data-index="\/docs\/llms-full\.txt"/);
  assert.doesNotMatch(tagOf(quiet(() => make({ key: "ot_x", llms: false })).value), /data-index/);
});

test("features: no second tag until a tool is named, then docs-ai.js with the same key, ref and color", () => {
  assert.deepEqual(validate({}).features, []);
  assert.equal(quiet(() => make({ key: "ot_x" })).value.injectHtmlTags().postBodyTags.length, 1);
  const tags = quiet(() => make({ key: "ot_x", color: "#0b5fff", features: ["selection", "explain"] })).value.injectHtmlTags().postBodyTags;
  assert.equal(tags.length, 2);
  assert.match(tags[0], /ask-docs\.js/);
  assert.equal(tags[1], '<script async src="https://onetagai.com/docs-ai.js" data-key="ot_x" data-features="explain,selection" data-ref="docusaurus-onetag" data-color="0b5fff"></script>');
});

test("features with askAi: false: the tools alone; with no key, no key attribute and the one warning", () => {
  _internal.resetWarning();
  const { value, calls } = quiet(() => make({ askAi: false, features: ["summary"] }));
  assert.deepEqual(value.injectHtmlTags().postBodyTags, ['<script async src="https://onetagai.com/docs-ai.js" data-features="summary" data-ref="docusaurus-onetag"></script>']);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /localhost only/);
});

// A small Docusaurus-shaped build folder.
const DOC = (title, body) => `<!doctype html><html lang="en" class="docs-wrapper plugin-docs docs-doc-page"><head><title>${title} | Acme Docs</title><meta name="description" content="About ${title}."></head><body>
<nav class="navbar">Navbar words</nav><aside class="theme-doc-sidebar-container"><ul class="menu">Sidebar words</ul></aside>
<main><div class="row"><div class="col"><article><nav class="theme-doc-breadcrumbs">Crumb words</nav>
<div class="theme-doc-markdown markdown"><header><h1>${title}</h1></header>${body}</div>
<footer class="theme-doc-footer"><a class="theme-edit-this-page">Edit this page</a></footer></article>
<nav class="pagination-nav">Next words</nav></div><div class="col"><div class="table-of-contents">Toc words</div></div></div></main></body></html>`;
const LIST = (cls) => `<!doctype html><html class="${cls}"><head><title>List</title></head><body><main><article><p>${"Listing words that are long enough to count. ".repeat(3)}</p></article></main></body></html>`;

function buildDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpo-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test("postBuild writes both files from the article only and skips listings", async () => {
  const dir = buildDir({
    "docs/intro/index.html": DOC("Intro", `<h2 class="anchor" id="setup">Setup<a class="hash-link" href="#setup">​</a></h2><p>Unpack the anvil and set it on a bench.</p>`),
    "blog/index.html": LIST("blog-wrapper blog-list-page"),
    "blog/tags/x/index.html": LIST("blog-wrapper"),
    "search/index.html": LIST("search-page-wrapper"),
    "404.html": DOC("Not found", "<p>Nothing here at all, sorry about that one.</p>"),
  });
  const p = quiet(() => make({ key: "ot_x" }, "/")).value;
  await p.postBuild({ outDir: dir, siteConfig: context().siteConfig });
  const llms = fs.readFileSync(path.join(dir, "llms.txt"), "utf8");
  const full = fs.readFileSync(path.join(dir, "llms-full.txt"), "utf8");
  assert.match(llms, /^# Acme Docs\n\n> Anvils for everyone\./);
  assert.match(llms, /- \[Intro\]\(https:\/\/acme\.dev\/docs\/intro\): About Intro\./);
  assert.doesNotMatch(llms, /blog|search|Not found/i);
  assert.match(full, /# Intro\n\nSource: https:\/\/acme\.dev\/docs\/intro\n/);
  assert.match(full, /## Setup\n\nSource: https:\/\/acme\.dev\/docs\/intro#setup/);
  assert.doesNotMatch(full, /Navbar|Sidebar|Crumb|Edit this page|Next words|Toc words|​/);
});

test("postBuild respects baseUrl and llms: false", async () => {
  const files = { "docs/intro/index.html": DOC("Intro", "<p>Unpack the anvil and set it on a bench right away.</p>") };
  const dir = buildDir(files);
  const p = quiet(() => make({ key: "ot_x" }, "/base/")).value;
  await p.postBuild({ outDir: dir, siteConfig: Object.assign(context("/base/").siteConfig, { trailingSlash: true }) });
  const llms = fs.readFileSync(path.join(dir, "llms.txt"), "utf8");
  assert.match(llms, /https:\/\/acme\.dev\/base\/docs\/intro\//);
  assert.match(llms, /\(https:\/\/acme\.dev\/base\/llms-full\.txt\)/);

  const off = buildDir(files);
  await quiet(() => make({ key: "ot_x", llms: false })).value.postBuild({ outDir: off, siteConfig: context().siteConfig });
  assert.ok(!fs.existsSync(path.join(off, "llms.txt")));
  assert.ok(!fs.existsSync(path.join(off, "llms-full.txt")));
});

test("postBuild leaves an llms.txt written by someone else alone", async () => {
  const dir = buildDir({ "docs/intro/index.html": DOC("Intro", "<p>Unpack the anvil and set it on a bench right away.</p>"), "llms.txt": "# Mine\n" });
  const p = quiet(() => make({ key: "ot_x" })).value;
  const { calls } = await (async () => { const c = []; const o = console.warn; console.warn = (m) => c.push(m); try { await p.postBuild({ outDir: dir, siteConfig: context().siteConfig }); } finally { console.warn = o; } return { calls: c }; })();
  assert.equal(fs.readFileSync(path.join(dir, "llms.txt"), "utf8"), "# Mine\n");
  assert.match(calls.join(" "), /left alone/);
});

test("listings are recognised from the page class Docusaurus sets, quoted or not", () => {
  const { isListing } = _internal;
  assert.ok(isListing('<html lang=en class=blog-tags-list-page><body></body></html>'));
  assert.ok(isListing('<html class="blog-wrapper blog-list-page plugin-blog">'));
  assert.ok(isListing('<html class="docs-wrapper docs-doc-page"><body><div class=generatedIndexPage_vN6x>'));
  assert.ok(!isListing('<html class="blog-wrapper blog-post-page plugin-blog">'));
  assert.ok(!isListing('<html class="docs-wrapper docs-doc-page"><body><div class="theme-doc-markdown">'));
});

test("blog posts keep the title and text, not the date line or authors; titles lose the site suffix", async () => {
  const dir = buildDir({
    "blog/welcome/index.html": `<!doctype html><html class="blog-wrapper blog-post-page"><head><title>Welcome | Acme Docs</title></head><body><main><article><header><h1>Welcome</h1><div><time>August 26, 2021</time> · One min read</div><div class="row"><div class="avatar">Jane Doe</div></div></header><div class="markdown"><p>Blogging features are powered by the blog plugin.</p></div></article></main></body></html>`,
    "index.html": `<!doctype html><html class="plugin-pages"><head><title>Hello from Acme | Acme Docs</title></head><body><header><h1>Hello from Acme</h1></header><main><p>Acme makes anvils that last for a hundred years.</p></main></body></html>`,
  });
  await quiet(() => make({ key: "ot_x" })).value.postBuild({ outDir: dir, siteConfig: context().siteConfig });
  const full = fs.readFileSync(path.join(dir, "llms-full.txt"), "utf8");
  assert.match(full, /# Welcome\n\nSource: https:\/\/acme\.dev\/blog\/welcome\n\nBlogging features/);
  assert.match(full, /^# Hello from Acme\n/);
  assert.doesNotMatch(full, /min read|Jane Doe|\| Acme Docs/);
});
