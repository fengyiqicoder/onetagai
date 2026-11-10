import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../widget.js", import.meta.url), "utf8");

// A document that never becomes ready: the pure parts load, nothing is mounted.
function load(dataset, scriptSrc, lang) {
  const warnings = [];
  const ctx = {
    document: { currentScript: { dataset, src: scriptSrc }, body: null, documentElement: { lang: lang || "en" }, addEventListener() {} },
    console: { warn: (m) => warnings.push(m) }, URL, TextDecoder,
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  return { api: ctx.onetagWidget, warnings };
}
const { api } = load({ key: "ot_test" }, "https://onetagai.com/widget.js");
const { readConfig, pickLang, pagePath, cut, buildBody, parseSSE, isDark, STRINGS, SYSTEM } = api._internal;
const local = (v) => structuredClone(v);

test("readConfig: attributes win over the URL query, and the URL alone is enough", () => {
  const fromUrl = readConfig({}, "https://onetagai.com/widget.js?key=ot_url&ref=hexo-theme-next&position=left&color=ff6600");
  assert.equal(fromUrl.key, "ot_url");
  assert.equal(fromUrl.ref, "hexo-theme-next");
  assert.equal(fromUrl.position, "left");
  assert.equal(fromUrl.color, "#ff6600");
  assert.equal(fromUrl.endpoint, "https://onetagai.com/v1/ask");
  assert.equal(fromUrl.launcher, true);
  const both = readConfig({ key: "ot_attr", launcher: "false", theme: "dark" }, "https://onetagai.com/widget.js?key=ot_url");
  assert.equal(both.key, "ot_attr");
  assert.equal(both.launcher, false);
  assert.equal(both.theme, "dark");
});

test("readConfig: a copy on another host still calls onetagai.com; localhost calls itself", () => {
  assert.equal(readConfig({ key: "k" }, "https://cdn.jsdelivr.net/gh/fengyiqicoder/onetagai/sdk/widget.js").endpoint, "https://onetagai.com/v1/ask");
  assert.equal(readConfig({ key: "k" }, "http://localhost:8000/widget.js").endpoint, "http://localhost:8000/v1/ask");
  assert.equal(readConfig({ key: "k", endpoint: "https://x.test/ask" }, "").endpoint, "https://x.test/ask");
});

test("readConfig drops values that are not what they should be", () => {
  const c = readConfig({ key: " ot_k ", ref: "Not a slug!", color: "red; background:url(x)", theme: "neon", position: "top" }, "");
  assert.equal(c.key, "ot_k");
  assert.equal(c.ref, "");
  assert.equal(c.color, "");
  assert.equal(c.theme, "auto");
  assert.equal(c.position, "right");
  assert.equal(readConfig({ ref: "Hexo-Theme-Butterfly" }, "").ref, "hexo-theme-butterfly");
});

test("pickLang", () => {
  assert.equal(pickLang("zh-CN"), "zh-Hans");
  assert.equal(pickLang("zh"), "zh-Hans");
  assert.equal(pickLang("zh-TW"), "zh-Hant");
  assert.equal(pickLang("zh-Hant-HK"), "zh-Hant");
  assert.equal(pickLang("en-US"), "en");
  assert.equal(pickLang("zhx"), "en");
  assert.equal(pickLang(""), "en");
  for (const lang of Object.keys(STRINGS)) assert.deepEqual(Object.keys(STRINGS[lang]), Object.keys(STRINGS.en));
});

test("pagePath: a hash route is part of the page, an in-page anchor is not", () => {
  assert.equal(pagePath({ pathname: "/docs/", hash: "" }), "/docs/");
  assert.equal(pagePath({ pathname: "/docs/", hash: "#install" }), "/docs/");
  assert.equal(pagePath({ pathname: "/docs/", hash: "#/guide" }), "/docs/#/guide");
  assert.equal(pagePath({ pathname: "/docs/", hash: "#/guide?id=install" }), "/docs/#/guide");
  assert.equal(pagePath({ pathname: "/", hash: "#!/zh-cn/quickstart" }), "/#!/zh-cn/quickstart");
  assert.equal(pagePath({ pathname: "/a" }), "/a");
});

test("cut never splits a surrogate pair", () => {
  assert.equal(cut("hello", 10), "hello");
  assert.equal(cut("hello", 3), "hel");
  assert.equal(cut("a😀b", 2), "a");
  assert.equal(cut("a😀b", 3), "a😀");
  assert.equal(cut("abc", 0), "");
  assert.equal(cut("abc", -5), "");
});

test("buildBody fits the page into what the question, system and history leave", () => {
  const config = readConfig({ key: "ot_k", ref: "docsify" }, "");
  const history = [{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }];
  const body = local(buildBody(config, "What is this?", history, "x".repeat(50000)));
  assert.equal(body.key, "ot_k");
  assert.equal(body.prompt, "What is this?");
  assert.equal(body.system, SYSTEM);
  assert.equal(body.stream, true);
  assert.equal(body.via, "docsify");
  assert.deepEqual(body.history, history);
  const total = body.prompt.length + body.system.length + body.input[0].text.length + history.reduce((n, m) => n + 20 + m.content.length, 0);
  assert.equal(total, 32000);
});

test("buildBody: no ref means via=widget, a short page is sent whole, a custom system replaces ours", () => {
  const body = local(buildBody(readConfig({ key: "ot_k", system: "Be brief." }, ""), "Q", [], "short page"));
  assert.equal(body.via, "widget");
  assert.equal(body.system, "Be brief.");
  assert.deepEqual(body.input, [{ type: "text", text: "short page" }]);
  assert.equal(body.history, undefined);
});

test("buildBody drops the oldest turns when history would crowd the page out", () => {
  const long = (role) => ({ role, content: "y".repeat(7000) });
  const history = [long("user"), long("assistant"), long("user"), long("assistant"), { role: "user", content: "q3" }, { role: "assistant", content: "a3" }];
  const body = local(buildBody(readConfig({ key: "ot_k" }, ""), "Q", history, "x".repeat(50000)));
  assert.deepEqual(body.history.map((m) => m.content.length), [7000, 7000, 2, 2]);
  assert.ok(body.input[0].text.length >= 4000);
});

test("parseSSE keeps the incomplete tail and skips malformed events", () => {
  const r = parseSSE('data: {"delta":"He"}\n\ndata: not json\n\ndata: {"delta":"llo"}\n\ndata: {"do');
  assert.deepEqual(local(r.events), [{ delta: "He" }, { delta: "llo" }]);
  assert.equal(r.rest, 'data: {"do');
});

test("isDark", () => {
  assert.equal(isDark("rgb(255, 255, 255)"), false);
  assert.equal(isDark("rgb(18, 18, 18)"), true);
  assert.equal(isDark("rgba(0, 0, 0, 0)"), null);
  assert.equal(isDark("rgb(13 17 23 / 90%)"), true);
  assert.equal(isDark("rgba(0, 0, 0, 0.2)"), null);
  assert.equal(isDark("color(srgb 0 0 0)"), null);
  assert.equal(isDark(""), null);
});

test("without a key, or with a placeholder, nothing is shown and the console says how to get one", () => {
  for (const key of ["", "YOUR_ONETAG_KEY", "ot_…"]) {
    const { api: a, warnings } = load({ key }, "https://onetagai.com/widget.js");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /onetagai\.com\/#get-key/);
    a.open(); a.toggle(); a.show(); a.hide(); a.close();  // safe to call: themes wire these to their own buttons
  }
  assert.equal(load({ key: "ot_real" }, "https://onetagai.com/widget.js").warnings.length, 0);
});

test("a second load keeps the first widget", () => {
  const ctx = { document: { currentScript: { dataset: { key: "ot_a" }, src: "" }, body: null, documentElement: { lang: "en" }, addEventListener() {} }, console: { warn() {} }, URL, TextDecoder };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  const first = ctx.onetagWidget;
  vm.runInContext(src, ctx);
  assert.equal(ctx.onetagWidget, first);
});
