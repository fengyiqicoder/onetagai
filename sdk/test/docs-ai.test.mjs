import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../docs-ai.js", import.meta.url), "utf8");

// A document that never becomes ready: the pure parts load, nothing is mounted.
function load(dataset, scriptSrc, lang, hostname) {
  const ctx = {
    document: { currentScript: { dataset, src: scriptSrc }, body: null, documentElement: { lang: lang || "en" }, addEventListener() {} },
    location: { hostname: hostname || "docs.example.com", href: "https://docs.example.com/guide/", pathname: "/guide/" },
    console: { warn() {} }, URL, TextDecoder, Intl,
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.onetagDocsAi;
}
const api = load({ key: "ot_test" }, "https://onetagai.com/docs-ai.js");
const { readConfig, detectPreset, viaFor, codeLang, explainBody, summaryBody, selectionBody, parseSSE, blocksOf, cut, hash, pickLang, isLocal, languageName, PRESETS, STRINGS, RULES, MAX_TEXT } = api._internal;
const plain = (v) => JSON.parse(JSON.stringify(v));
const size = (b) => b.prompt.length + b.system.length + (b.input || []).reduce((n, p) => n + p.text.length, 0) + (b.history || []).reduce((n, m) => n + m.content.length, 0);

test("readConfig: the script URL alone is enough", () => {
  const c = readConfig({}, "https://onetagai.com/docs-ai.js?key=ot_url&ref=zensical&features=explain,selection&lang=de&lines=3&chars=800&color=ff6600");
  assert.equal(c.key, "ot_url");
  assert.equal(c.ref, "zensical");
  assert.deepEqual(plain(c.features), { explain: true, summary: false, selection: true });
  assert.equal(c.lang, "de");
  assert.equal(c.lines, 3);
  assert.equal(c.chars, 800);
  assert.equal(c.color, "#ff6600");
  assert.equal(c.endpoint, "https://onetagai.com/v1/ask");
});

test("readConfig: endpoint points the requests somewhere else, for local testing", () => {
  assert.equal(readConfig({}, "https://onetagai.com/docs-ai.js?endpoint=http://localhost:8787/v1/ask").endpoint, "http://localhost:8787/v1/ask");
  assert.equal(readConfig({ endpoint: "http://127.0.0.1:9000/v1/ask" }, "").endpoint, "http://127.0.0.1:9000/v1/ask");
});

test("readConfig: data attributes win over the URL, and every feature is off until it is named", () => {
  const c = readConfig({ key: "ot_attr" }, "https://onetagai.com/docs-ai.js?key=ot_url");
  assert.equal(c.key, "ot_attr");
  assert.deepEqual(plain(c.features), { explain: false, summary: false, selection: false });
  assert.equal(c.lines, 1);
  assert.equal(c.chars, 1500);
  assert.equal(c.preset, "");
});

test("readConfig: bad values are dropped and a placeholder key is no key", () => {
  const c = readConfig({ key: "YOUR_ONETAG_KEY", ref: "Not a slug!", color: "red; x", preset: "hugo", features: "chat,dance", lines: "-2", chars: "abc" }, "");
  assert.equal(c.key, "");
  assert.equal(c.ref, "");
  assert.equal(c.color, "");
  assert.equal(c.preset, "");
  assert.deepEqual(plain(c.features), { explain: false, summary: false, selection: false });
  assert.equal(c.lines, 1);
  assert.equal(c.chars, 1500);
});

test("readConfig: features are turned on one by one, in a data attribute or the URL", () => {
  assert.deepEqual(plain(readConfig({ features: "summary" }, "").features), { explain: false, summary: true, selection: false });
  assert.deepEqual(plain(readConfig({ features: "Explain, summary selection" }, "").features), { explain: true, summary: true, selection: true });
  assert.deepEqual(plain(readConfig({}, "https://onetagai.com/docs-ai.js?features=selection").features), { explain: false, summary: false, selection: true });
});

test("start: with no feature turned on nothing is mounted and the console says how to turn one on", () => {
  const warnings = [];
  let touched = 0;
  const ctx = {
    document: { currentScript: { dataset: { key: "ot_test" }, src: "https://onetagai.com/docs-ai.js" }, body: {}, readyState: "complete", documentElement: { lang: "en", getAttribute() { return null; } },
      addEventListener() { touched++; }, querySelector() { touched++; return null; }, querySelectorAll() { touched++; return []; }, createElement() { touched++; return {}; } },
    location: { hostname: "docs.example.com", href: "https://docs.example.com/guide/", pathname: "/guide/" },
    console: { warn(m) { warnings.push(String(m)); } }, URL, TextDecoder, Intl,
    addEventListener() { touched++; }, setTimeout() { touched++; },
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /features=explain,summary,selection/);
  assert.equal(touched, 0);
});

test("readConfig: a preset and selectors can be forced", () => {
  const c = readConfig({ preset: "vitepress", content: ".my-doc", code: ".my-code" }, "");
  assert.equal(c.preset, "vitepress");
  assert.equal(c.content, ".my-doc");
  assert.equal(c.code, ".my-code");
});

test("detectPreset: the generator meta tag names the framework", () => {
  const none = () => false;
  assert.equal(detectPreset("mkdocs-1.6.1, mkdocs-material-9.6.14", none), "material");
  assert.equal(detectPreset("zensical-0.1.1", none), "material");
  assert.equal(detectPreset("VitePress v1.6.3", none), "vitepress");
  assert.equal(detectPreset("Docusaurus v3.9.2", none), "docusaurus");
  assert.equal(detectPreset("Astro v5.13.0 Starlight v0.36.0", none), "starlight");
});

test("detectPreset: without a generator the page markup decides, and anything else is generic", () => {
  const has = (...known) => (selector) => known.includes(selector);
  assert.equal(detectPreset("", has(".md-content")), "material");
  assert.equal(detectPreset("", has(".vp-doc")), "vitepress");
  assert.equal(detectPreset("", has(".theme-doc-markdown")), "docusaurus");
  assert.equal(detectPreset("", has(".sl-markdown-content")), "starlight");
  assert.equal(detectPreset("Hugo 0.150", has()), "generic");
});

test("PRESETS: each one says where the content and the code blocks are", () => {
  for (const name of ["material", "vitepress", "docusaurus", "starlight", "generic"]) {
    assert.ok(PRESETS[name].content.length, name + " content");
    assert.ok(PRESETS[name].code, name + " code");
  }
});

test("viaFor: requests are counted as docs-ai-<framework>, read from the generator tag", () => {
  assert.equal(viaFor("", "mkdocs-1.6.1, mkdocs-material-9.6.14", "material"), "docs-ai-mkdocs");
  assert.equal(viaFor("", "zensical-0.1.1", "material"), "docs-ai-zensical");
  assert.equal(viaFor("", "VitePress v1.6.3", "vitepress"), "docs-ai-vitepress");
  assert.equal(viaFor("", "Docusaurus v3.9.2", "docusaurus"), "docs-ai-docusaurus");
  assert.equal(viaFor("", "Astro v5.13.0 Starlight v0.36.0", "starlight"), "docs-ai-starlight");
});

test("viaFor: without a generator the preset names the framework, and an unknown site is plain docs-ai", () => {
  assert.equal(viaFor("", "", "vitepress"), "docs-ai-vitepress");
  assert.equal(viaFor("", "", "material"), "docs-ai-material");
  assert.equal(viaFor("", "Hugo 0.150", "generic"), "docs-ai");
  assert.equal(viaFor("", "", ""), "docs-ai");
});

test("viaFor: a ref replaces the framework name and the result fits the server's 40 characters", () => {
  assert.equal(viaFor("handbook", "VitePress v1.6.3", "vitepress"), "docs-ai-handbook");
  const long = viaFor("a".repeat(40), "", "generic");
  assert.equal(long.length, 40);
  assert.match(long, /^docs-ai-a+$/);
});

test("buildBody: a via worked out from the page is the one that is sent", () => {
  const c = readConfig({ key: "ot_test" }, "");
  c.via = "docs-ai-zensical";
  assert.equal(summaryBody(c, "ot_test", { title: "T", text: "Body text." }, "English").via, "docs-ai-zensical");
});

test("codeLang: the language comes from a data attribute or a language- class", () => {
  assert.equal(codeLang("language-js vp-adaptive-theme", ""), "js");
  assert.equal(codeLang("language-python highlight", ""), "python");
  assert.equal(codeLang("codeBlockContainer_x theme-code-block language-tsx", ""), "tsx");
  assert.equal(codeLang("highlight", "bash"), "bash");
  assert.equal(codeLang("highlight", ""), "");
  assert.equal(codeLang("language-c++", ""), "c++");
});

test("explainBody: sends the code with the heading and the text before it", () => {
  const c = readConfig({ key: "ot_test", ref: "mkdocs" }, "");
  const b = explainBody(c, "ot_test", { title: "Install", heading: "Add the script", before: "Put this in mkdocs.yml.", code: "extra_javascript:\n  - x.js", lang: "yaml", file: "mkdocs.yml" }, "German");
  assert.equal(b.key, "ot_test");
  assert.equal(b.system, RULES.explain);
  assert.equal(b.max_tokens, 600);
  assert.equal(b.stream, true);
  assert.equal(b.via, "docs-ai-mkdocs");
  assert.match(b.prompt, /Answer in German\./);
  assert.deepEqual(plain(b.input), [
    { type: "text", text: "Page: Install" },
    { type: "text", text: "Section: Add the script" },
    { type: "text", text: "Text before the code:\nPut this in mkdocs.yml." },
    { type: "text", text: "Code (yaml), file mkdocs.yml:\nextra_javascript:\n  - x.js" },
  ]);
});

test("explainBody: missing context is left out, long code is cut, and via falls back to docs-ai", () => {
  const c = readConfig({}, "");
  const b = explainBody(c, "k", { title: "T", heading: "", before: "", code: "x".repeat(20000), lang: "", file: "" }, "English");
  assert.equal(b.via, "docs-ai");
  assert.equal(b.input.length, 2);
  assert.equal(b.input[1].text.length, "Code:\n".length + 12000);
  assert.ok(size(b) <= MAX_TEXT);
});

test("every body: the site's own rules are added after the built-in ones", () => {
  const c = readConfig({ rules: "The product is called Acme." }, "");
  assert.equal(explainBody(c, "k", { title: "T", code: "ls" }, "English").system, RULES.explain + "\n\nSite rules: The product is called Acme.");
  assert.equal(summaryBody(c, "k", { title: "T", text: "x" }, "English").system, RULES.summary + "\n\nSite rules: The product is called Acme.");
});

test("summaryBody: sends the page under its title and stays inside the server limit", () => {
  const c = readConfig({}, "");
  const b = summaryBody(c, "k", { title: "Limits", text: "y".repeat(40000) }, "Japanese");
  assert.equal(b.system, RULES.summary);
  assert.equal(b.max_tokens, 400);
  assert.match(b.prompt, /Summarize this page\. Answer in Japanese\./);
  assert.equal(b.input[0].text, "Page: Limits");
  assert.ok(size(b) <= MAX_TEXT);
  assert.ok(b.input[1].text.length >= 28000);
});

test("selectionBody: the first question explains the selected text in its paragraph", () => {
  const c = readConfig({}, "");
  const b = selectionBody(c, "k", { title: "FAQ", text: "one-time quota", paragraph: "The free plan has a one-time quota.", page: "Whole page text" }, "", [], "English");
  assert.equal(b.system, RULES.selection + " Answer in English.");
  assert.equal(b.max_tokens, 400);
  assert.equal(b.prompt, 'Explain the selected text: "one-time quota". Answer in English.');
  assert.deepEqual(plain(b.input).map((p) => p.text), ["Page: FAQ", "Selected text: one-time quota", "Where it appears: The free plan has a one-time quota.", "The page:\nWhole page text"]);
  assert.equal(b.history, undefined);
});

test("selectionBody: a follow-up is the prompt and carries the last six messages", () => {
  const c = readConfig({}, "");
  const history = [];
  for (let i = 0; i < 5; i++) history.push({ role: "user", content: "q" + i }, { role: "assistant", content: "a" + i });
  const b = selectionBody(c, "k", { title: "FAQ", text: "quota", paragraph: "p", page: "page" }, "Does it reset?", history, "English");
  assert.equal(b.prompt, "Does it reset?");
  assert.equal(b.history.length, 6);
  assert.equal(b.history[0].content, "q2");
});

test("selectionBody: a long page is trimmed so the request fits the server limit", () => {
  const c = readConfig({}, "");
  const history = [];
  for (let i = 0; i < 3; i++) history.push({ role: "user", content: "q".repeat(300) }, { role: "assistant", content: "a".repeat(4000) });
  const b = selectionBody(c, "k", { title: "T", text: "s".repeat(2000), paragraph: "p".repeat(1500), page: "z".repeat(30000) }, "why?", history, "English");
  assert.ok(size(b) <= MAX_TEXT, "size " + size(b));
  assert.ok(b.input[3].text.length > 1000);
});

test("parseSSE: complete events are returned and a partial one is kept for the next chunk", () => {
  const r = parseSSE('data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\ndata: {"do');
  assert.deepEqual(plain(r.events), [{ delta: "Hel" }, { delta: "lo" }]);
  assert.equal(r.rest, 'data: {"do');
  assert.deepEqual(plain(parseSSE("data: not json\n\n").events), []);
});

test("blocksOf: paragraphs, lists and fenced code, with heading marks dropped", () => {
  const b = plain(blocksOf("## Steps\nFirst line.\n\n- one `a`\n- two\n\n1. three\n\n```js\nconst x = 1;\n\nlet y;\n```\nDone."));
  assert.deepEqual(b, [
    { type: "p", text: "Steps" },
    { type: "p", text: "First line." },
    { type: "ul", items: ["one `a`", "two"] },
    { type: "ul", items: ["three"] },
    { type: "pre", text: "const x = 1;\n\nlet y;" },
    { type: "p", text: "Done." },
  ]);
});

test("blocksOf: a code fence still open while streaming shows what has arrived", () => {
  assert.deepEqual(plain(blocksOf("Run:\n```bash\nnpm i")), [{ type: "p", text: "Run:" }, { type: "pre", text: "npm i" }]);
});

test("cut: never splits a surrogate pair", () => {
  assert.equal(cut("ab😀", 3), "ab");
  assert.equal(cut("abc", 5), "abc");
  assert.equal(cut("abc", 0), "");
});

test("hash: the same text gives the same short id, different text a different one", () => {
  assert.equal(hash("abc"), hash("abc"));
  assert.notEqual(hash("abc"), hash("abd"));
  assert.match(hash("abc"), /^[0-9a-z]+$/);
});

test("pickLang and languageName: the interface follows the page language", () => {
  assert.equal(pickLang("zh-CN"), "zh-Hans");
  assert.equal(pickLang("zh-TW"), "zh-Hant");
  assert.equal(pickLang("fr"), "en");
  assert.equal(languageName("de"), "German");
  assert.equal(languageName("zh-CN"), "Chinese (China)");
  assert.equal(languageName(""), "English");
});

test("isLocal: only local hosts get the shared demo key", () => {
  assert.equal(isLocal("localhost"), true);
  assert.equal(isLocal("127.0.0.1"), true);
  assert.equal(isLocal("docs.example.com"), false);
});

test("STRINGS: every language has every string", () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const lang of Object.keys(STRINGS)) assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, lang);
  for (const code of ["no_key", "bad_key", "domain_not_allowed", "quota_exceeded", "paused", "rate_limited", "too_large", "network", "fail"]) assert.ok(STRINGS.en[code], code);
});

// ---- 0.3.0 ----

const more = api._internal;

test("codeSign: only the code is signed, so the same code gives the same signature and a changed line a new one", () => {
  assert.equal(typeof more.codeSign, "function");
  assert.equal(more.codeSign(["npm install", "pnpm add"]), more.codeSign(["npm install", "pnpm add"]));
  assert.notEqual(more.codeSign(["npm install"]), more.codeSign(["npm install -D"]));
  assert.notEqual(more.codeSign(["ab", "c"]), more.codeSign(["a", "bc"]));
  const long = "x".repeat(9000);
  assert.notEqual(more.codeSign([long + "a"]), more.codeSign([long + "b"]));   // a change far down a long block still counts
});

test("readConfig: the summary cache is on unless cache=off", () => {
  assert.equal(readConfig({}, "https://onetagai.com/docs-ai.js").cache, true);
  assert.equal(readConfig({}, "https://onetagai.com/docs-ai.js?cache=off").cache, false);
  assert.equal(readConfig({ cache: "false" }, "").cache, false);
  assert.equal(readConfig({ cache: "on" }, "https://onetagai.com/docs-ai.js?cache=off").cache, true);
});

test("summary cache: one entry per page and language, replaced when the page text changes", () => {
  assert.equal(more.cacheKey("/guide/", "German"), "onetag-docs-ai:summary:/guide/:German");
  assert.notEqual(more.cacheKey("/guide/", "German"), more.cacheKey("/guide/", "English"));
  const stored = more.cacheWrite("h1", "- one\n- two");
  assert.equal(more.cacheRead(stored, "h1"), "- one\n- two");
  assert.equal(more.cacheRead(stored, "h2"), "");            // the page changed: ask again, then overwrite
  assert.equal(more.cacheRead("", "h1"), "");
  assert.equal(more.cacheRead("not json", "h1"), "");
  assert.equal(more.cacheRead('{"h":"h1","t":5}', "h1"), "");
  assert.equal(more.cacheRead("null", "h1"), "");
});

test("homeUrl: the footer link carries the same name the requests are counted under", () => {
  assert.equal(more.homeUrl("docs-ai-vitepress"), "https://onetagai.com/?ref=docs-ai-vitepress");
  assert.equal(more.homeUrl(""), "https://onetagai.com/?ref=docs-ai");
});

test("STRINGS: the footer credit reads the same as in ask-docs.js", () => {
  assert.equal(STRINGS.en.powered, "Powered by OneTag AI");
  assert.equal(STRINGS["zh-Hans"].powered, "由 OneTag AI 提供");
  assert.equal(STRINGS["zh-Hant"].powered, "由 OneTag AI 提供");
});

test("selectionBody: the answer language is in the rules, so a follow-up is answered in it too", () => {
  const picked = { title: "T", text: "static adapter", paragraph: "Use the static adapter.", page: "page" };
  const first = selectionBody({ rules: "" }, "k", picked, "", [], "German");
  const next = selectionBody({ rules: "Be brief." }, "k", picked, "And on Vercel?", [{ role: "user", content: "q" }, { role: "assistant", content: "a" }], "German");
  assert.match(first.system, /Answer in German\./);
  assert.match(next.system, /Answer in German\./);
  assert.match(next.system, /Site rules: Be brief\./);
  assert.equal(next.prompt, "And on Vercel?");
});

// Records the way a MutationObserver reports them, with just the parts that are read.
const node = (name, inside) => ({ nodeType: 1, hasAttribute: (n) => n === "data-onetag-docs-ai" && name === "ours", contains: (other) => (inside || []).includes(other) });
test("worthMount: our own widgets and changes outside the content do not start another pass", () => {
  const root = node("root");
  const body = node("body", [root]);
  const sidebar = node("sidebar");
  const ours = node("ours");
  const block = node("block");
  root.contains = (other) => other === root || other === block;
  const rec = (target, added, removed) => ({ type: "childList", target, addedNodes: added || [], removedNodes: removed || [] });
  assert.equal(more.worthMount([rec(root, [block])], root), true);             // new content
  assert.equal(more.worthMount([rec(body, [node("main")])], root), true);      // the content element itself was swapped
  assert.equal(more.worthMount([rec(root, [ours])], root), false);             // we added a button
  assert.equal(more.worthMount([rec(root, [], [ours])], root), true);          // the page took our button away: put it back
  assert.equal(more.worthMount([rec(body, [ours])], root), false);             // we added the selection layer
  assert.equal(more.worthMount([rec(sidebar, [node("x")])], root), false);     // a carousel somewhere else
  assert.equal(more.worthMount([rec(sidebar, [node("x")]), rec(block, [node("y")])], root), true);
  assert.equal(more.worthMount([rec(body, [node("x")])], null), true);         // no content found yet: look again
  assert.equal(more.worthMount([{ type: "attributes", target: body }], root), true);
  assert.equal(more.worthMount([rec(root, [{ nodeType: 3 }], [])], root), true);   // text nodes count as content
});
