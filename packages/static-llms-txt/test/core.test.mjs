import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { generate, scan, build, readHtml, inject, scriptTag, globToRegExp, MARK } from "../index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function site(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sllms-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const page = (title, body, head = "") => `<!doctype html><html lang="en"><head><title>${title} | Acme Docs</title>${head}</head><body><nav><a href="/">Home</a> Menu words</nav><main>${body}</main><footer>Copyright Acme</footer><script>var secret = 1;</script></body></html>`;
const LONG = "<p>This paragraph is long enough to count as real content for the scanner to keep.</p>";

test("readHtml keeps main content and drops nav, footer and scripts", () => {
  const info = readHtml(page("Install", "<h1>Install</h1><p>Run the <a href='/x'>installer</a> first.</p>"));
  assert.equal(info.title, "Install");
  assert.equal(info.text, "Run the installer first.");
  assert.doesNotMatch(info.text, /Menu words|Copyright|secret/);
});

test("readHtml turns headings, lists, code and tables into Markdown", () => {
  const info = readHtml(page("T", `<h1>T</h1><p>Intro &amp; more.</p>
    <h2 id="setup">Setup</h2><ul><li>One</li><li>Two <code>x</code><ul><li>Deep</li></ul></li></ul>
    <pre><code class="language-js">const a = 1;\n# not a heading\n</code></pre>
    <h3>Detail</h3><ol><li>First</li><li>Second</li></ol>
    <table><tr><th>Name</th><th>Value</th></tr><tr><td>a</td><td>1 | 2</td></tr></table>`));
  assert.equal(info.sections.length, 2);
  assert.equal(info.sections[0].text, "Intro & more.");
  assert.equal(info.sections[1].heading, "Setup");
  assert.equal(info.sections[1].id, "setup");
  const t = info.sections[1].text;
  assert.match(t, /^- One\n- Two `x`\n  - Deep$/m);
  assert.match(t, /```js\nconst a = 1;\n# not a heading\n```/);
  assert.match(t, /^### Detail$/m);
  assert.match(t, /^1\. First\n2\. Second$/m);
  assert.match(t, /\| Name \| Value \|\n\| --- \| --- \|\n\| a \| 1 \\\| 2 \|/);
});

test("readHtml reads description, canonical, noindex and redirects", () => {
  const info = readHtml(page("A", "<p>x</p>", '<meta name="description" content="Short &amp; sweet"><link rel="canonical" href="https://a.dev/a/"><meta name="robots" content="noindex, follow">'));
  assert.equal(info.description, "Short & sweet");
  assert.equal(info.canonical, "https://a.dev/a/");
  assert.equal(info.noindex, true);
  assert.equal(readHtml('<html><head><meta http-equiv="refresh" content="0; url=/new/"></head><body>moved</body></html>').redirect, true);
});

test("readHtml honors a custom content selector and falls back to the title tag", () => {
  const html = "<html><head><title>Only Title</title></head><body><div class='side'>Side text</div><div id='doc'><p>Doc text here.</p></div></body></html>";
  const info = readHtml(html, { content: "#doc" });
  assert.equal(info.text, "Doc text here.");
  assert.equal(info.title, "Only Title");
});

test("readHtml joins code lines that highlighters wrap one element per line", () => {
  const info = readHtml(page("C", '<h1>C</h1><pre class="shiki" data-language="sh"><code><span class="line"><span>npm i</span></span><span class="line"><span>npm test</span></span></code></pre>'));
  assert.match(info.text, /```sh\nnpm i\nnpm test\n```/);
});

test("scan skips 404, noindex, redirect and near-empty pages, home page first", () => {
  const dir = site({
    "index.html": page("Home", "<h1>Acme</h1>" + LONG, '<meta name="description" content="Acme makes anvils.">'),
    "guide/index.html": page("Guide", "<h1>Guide</h1>" + LONG),
    "about.html": page("About", "<h1>About</h1>" + LONG),
    "404.html": page("Not found", "<h1>Not found</h1>" + LONG),
    "hidden/index.html": page("Hidden", "<h1>Hidden</h1>" + LONG, '<meta name="robots" content="noindex">'),
    "old/index.html": '<html><head><meta http-equiv="refresh" content="0; url=/guide/"></head><body><p>This page moved to a new address, follow the link.</p></body></html>',
    "empty.html": page("Empty", "<p>Hi</p>"),
    "tags/a/index.html": page("Tag a", "<h1>Tag a</h1>" + LONG),
  });
  const pages = scan(dir, { site: "https://acme.dev/", exclude: ["tags/**"] });
  assert.deepEqual(pages.map((p) => p.url), ["https://acme.dev/", "https://acme.dev/about.html", "https://acme.dev/guide/"]);
  assert.equal(scan(dir, { site: "https://acme.dev", cleanUrls: true, exclude: "tags/**" })[1].url, "https://acme.dev/about");
});

test("scan uses the canonical link when no site is given", () => {
  const dir = site({ "index.html": page("Home", "<h1>Home</h1>" + LONG, '<link rel="canonical" href="https://canon.dev/">') });
  assert.equal(scan(dir)[0].url, "https://canon.dev/");
});

test("scan throws a clear error for a missing folder", () => {
  assert.throws(() => scan("/no/such/folder/here"), /is not a folder/);
});

test("generate writes llms.txt in llmstxt.org shape and llms-full.txt with Source lines", () => {
  const dir = site({
    "index.html": page("Home", "<h1>Acme</h1>" + LONG, '<meta name="description" content="Acme makes anvils."><meta property="og:site_name" content="Acme Docs">'),
    "guide/index.html": page("Guide", '<h1>Guide</h1><p>Start here with the guide.</p><h2 id="step-one">Step one</h2><p>Unpack the anvil carefully.</p>', '<meta name="description" content="How to start.">'),
  });
  const r = generate(dir, { site: "https://acme.dev" });
  assert.deepEqual(r.written, ["llms.txt", "llms-full.txt"]);
  const llms = fs.readFileSync(path.join(dir, "llms.txt"), "utf8");
  assert.ok(llms.startsWith("# Acme Docs\n\n> Acme makes anvils.\n\n## Pages\n\n- [Acme](https://acme.dev/): Acme makes anvils.\n- [Guide](https://acme.dev/guide/): How to start.\n"));
  assert.match(llms, /## Optional\n\n- \[Full text of every page\]\(https:\/\/acme\.dev\/llms-full\.txt\)/);
  const full = fs.readFileSync(path.join(dir, "llms-full.txt"), "utf8");
  assert.match(full, /^# Acme\n\nSource: https:\/\/acme\.dev\/\n\nThis paragraph/);
  assert.match(full, /# Guide\n\nSource: https:\/\/acme\.dev\/guide\/\n\nStart here with the guide\.\n\n## Step one\n\nSource: https:\/\/acme\.dev\/guide\/#step-one\n\nUnpack the anvil carefully\./);
  assert.ok(full.includes(MARK));
});

test("generate leaves a hand-written llms.txt alone unless forced, and rewrites its own", () => {
  const dir = site({ "index.html": page("Home", "<h1>Home</h1>" + LONG), "llms.txt": "# Mine\n\nwritten by hand\n" });
  const first = generate(dir, { site: "https://a.dev" });
  assert.deepEqual(first.skipped, ["llms.txt"]);
  assert.deepEqual(first.written, ["llms-full.txt"]);
  assert.equal(fs.readFileSync(path.join(dir, "llms.txt"), "utf8"), "# Mine\n\nwritten by hand\n");
  assert.deepEqual(generate(dir, { site: "https://a.dev" }).written, ["llms-full.txt"]);
  assert.deepEqual(generate(dir, { site: "https://a.dev", force: true }).written, ["llms.txt", "llms-full.txt"]);
});

test("generate with full:false and write:false", () => {
  const dir = site({ "index.html": page("Home", "<h1>Home</h1>" + LONG) });
  const r = generate(dir, { full: false, write: false });
  assert.deepEqual(r.written, []);
  assert.equal(fs.existsSync(path.join(dir, "llms.txt")), false);
  assert.doesNotMatch(r.llms, /Optional/);
});

test("build accepts pages given as html, text or sections", () => {
  const r = build([
    { url: "https://a.dev/", path: "/", title: "Home", html: page("Home", "<h1>Home</h1><p>Welcome to the site.</p>") },
    { url: "https://a.dev/b/", title: "B [beta]", description: "Second\npage", text: "Body of b." },
  ], { title: "A", site: "https://a.dev" });
  assert.match(r.llms, /- \[Home\]\(https:\/\/a\.dev\/\)\n- \[B beta\]\(https:\/\/a\.dev\/b\/\): Second page/);
  assert.match(r.llmsFull, /# Home\n\nSource: https:\/\/a\.dev\/\n\nWelcome to the site\.\n\n# B \[beta\]\n\nSource: https:\/\/a\.dev\/b\/\n\nBody of b\./);
});

test("llms-full.txt is read back page by page by the Ask AI widget's parser", (t) => {
  const widget = path.join(here, "../../../sdk/ask-docs.js");
  if (!fs.existsSync(widget)) return t.skip("widget source not in this checkout");
  const src = fs.readFileSync(widget, "utf8");
  const start = src.indexOf("function llmsEntries(");
  const end = src.indexOf("\n  }\n", start) + 4;
  const llmsEntries = new Function(src.slice(start, end) + "\nreturn llmsEntries;")();
  const r = build([
    { url: "https://a.dev/", path: "/", title: "Home", text: "Welcome.\n\n```sh\n# a comment in code\nnpm i\n```" },
    { url: "https://a.dev/g/", title: "Guide", sections: [{ heading: "", id: "", text: "Intro text." }, { heading: "Step one", id: "step-one", text: "Do the thing." }] },
  ], { title: "A" });
  const entries = llmsEntries(r.llmsFull);
  assert.deepEqual(entries.map((e) => [e.title, e.url]), [
    ["Home", "https://a.dev/"],
    ["Guide", "https://a.dev/g/"],
    ["Guide › Step one", "https://a.dev/g/#step-one"],
  ]);
  assert.match(entries[0].text, /# a comment in code/);
  assert.doesNotMatch(entries[1].text, /Source:/);
});

test("scriptTag escapes values and skips empty options", () => {
  assert.equal(scriptTag({ key: "ot_x", ref: "my-plugin", label: 'Ask "us"', color: "" }),
    '<script async src="https://onetagai.com/ask-docs.js" data-key="ot_x" data-ref="my-plugin" data-label="Ask &quot;us&quot;"></script>');
});

test("inject adds the tag once before the last </body> and is idempotent", () => {
  const dir = site({ "index.html": page("Home", "<p>x</p>"), "a/b.html": "<html><body><pre>&lt;/body&gt;</pre></BODY></html>", "frag.html": "<p>no body</p>", "skip/x.html": page("S", "<p>x</p>") });
  const changed = inject(dir, { key: "ot_x", ref: "t", exclude: ["skip/**"] });
  assert.deepEqual(changed.sort(), ["a/b.html", "index.html"]);
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(html, /<script async src="https:\/\/onetagai\.com\/ask-docs\.js" data-key="ot_x" data-ref="t"><\/script>\n<\/body>/);
  assert.deepEqual(inject(dir, { key: "ot_x", ref: "t", exclude: ["skip/**"] }), []);
});

test("globToRegExp", () => {
  assert.ok(globToRegExp("tags/**").test("tags/a/index.html"));
  assert.ok(globToRegExp("**/print.html").test("a/b/print.html"));
  assert.ok(globToRegExp("**/print.html").test("print.html"));
  assert.ok(globToRegExp("*.html").test("a.html"));
  assert.equal(globToRegExp("*.html").test("a/b.html"), false);
});

test("the CommonJS entry exports the same API", () => {
  const cjs = require("../index.cjs");
  assert.equal(typeof cjs.generate, "function");
  assert.equal(cjs.MARK, MARK);
});

test("cli writes both files and reports pages; --ask-ai injects the script", () => {
  const dir = site({ "index.html": page("Home", "<h1>Home</h1>" + LONG) });
  const out = execFileSync(process.execPath, [path.join(here, "../cli.cjs"), dir, "--site", "https://a.dev", "--ask-ai"], { encoding: "utf8" });
  assert.match(out, /wrote .*llms\.txt/);
  assert.match(out, /1 pages/);
  assert.match(out, /demo key answers on localhost only/);
  assert.match(fs.readFileSync(path.join(dir, "index.html"), "utf8"), /ask-docs\.js" data-key="ot_demo000000000000000000000" data-ref="static-llms-txt"/);
  assert.throws(() => execFileSync(process.execPath, [path.join(here, "../cli.cjs"), dir, "--nope"], { encoding: "utf8", stdio: "pipe" }), /Unknown option/);
});

test("readHtml keeps words apart for back-to-back links and blocks inside list items", () => {
  const info = readHtml(page("S", '<h1>S</h1><div><a href="/a">Start free</a><a href="/b">See how it works</a></div><ol><li><span>Step 1</span><h3>Add a client</h3><p>Name and address.</p></li></ol><p>Use <code><span>foo</span><span>(</span><span>)</span></code> now.</p>'));
  assert.match(info.text, /^Start free See how it works$/m);
  assert.match(info.text, /^1\. Step 1 Add a client Name and address\.$/m);
  assert.match(info.text, /Use `foo\(\)` now\./);
});
