// Unit tests for the plain logic in src/core.js. No Nuxt build needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { headScript, resolveKey, missingKeyWarning, resolveSite, hasPages, writeLlms, DEMO_KEY, NAME, SIGNUP } from "../src/core.js";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function site(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nuxt-onetag-"));
  for (const [rel, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), html);
  }
  return dir;
}
const page = (title, body) => `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title} page"></head><body><div id="__nuxt"><main><h1>${title}</h1><p>${body}</p></main></div></body></html>`;
const quiet = () => { const lines = []; return { lines, info: (m) => lines.push(m) }; };

test("data-ref is the package name", () => {
  assert.equal(NAME, pkg.name);
  assert.equal(headScript({ key: "ot_x" }, {})["data-ref"], "nuxt-onetag");
});

test("key option wins over ONETAG_KEY", () => {
  assert.deepEqual(resolveKey({ key: "ot_option" }, { ONETAG_KEY: "ot_env" }), { key: "ot_option", demo: false });
  assert.deepEqual(resolveKey({}, { ONETAG_KEY: "ot_env" }), { key: "ot_env", demo: false });
});

test("no key falls back to the demo key", () => {
  assert.deepEqual(resolveKey({}, {}), { key: DEMO_KEY, demo: true });
  assert.deepEqual(resolveKey({ key: "  " }, {}), { key: DEMO_KEY, demo: true });
  assert.equal(headScript({}, {})["data-key"], DEMO_KEY);
});

test("the warning says localhost only and shows the signup command", () => {
  const text = missingKeyWarning();
  assert.match(text, /localhost only/);
  assert.ok(text.includes(SIGNUP));
});

test("head script carries src, async and the widget options", () => {
  const s = headScript({ key: "ot_k", label: "Ask", position: "left", color: "#ff0000", theme: "dark", lang: "zh-CN", button: "#ask", placeholder: "Q?", rules: "Be short", exclude: ["x/**"] }, {});
  assert.equal(s.src, "https://onetagai.com/ask-docs.js");
  assert.equal(s.async, true);
  assert.equal(s["data-key"], "ot_k");
  assert.equal(s["data-color"], "ff0000");
  assert.equal(s["data-position"], "left");
  assert.equal(s["data-theme"], "dark");
  assert.equal(s["data-lang"], "zh-CN");
  assert.equal(s["data-button"], "#ask");
  assert.equal(s["data-placeholder"], "Q?");
  assert.equal(s["data-rules"], "Be short");
  assert.equal(s["data-label"], "Ask");
  assert.equal(s["data-exclude"], undefined);
});

test("askAi: false gives no script", () => {
  assert.equal(headScript({ askAi: false, key: "ot_k" }, {}), null);
});

test("site URL: option, then site.url, then runtimeConfig, with baseURL", () => {
  assert.equal(resolveSite({ site: "https://a.dev/", siteConfig: { url: "https://b.dev" } }), "https://a.dev");
  assert.equal(resolveSite({ siteConfig: { url: "https://b.dev" }, runtimeConfig: { public: { siteUrl: "https://c.dev" } } }), "https://b.dev");
  assert.equal(resolveSite({ runtimeConfig: { public: { siteUrl: "https://c.dev" } } }), "https://c.dev");
  assert.equal(resolveSite({ site: "https://a.dev", baseURL: "/docs/" }), "https://a.dev/docs");
  assert.equal(resolveSite({ site: "https://a.dev/docs/", baseURL: "/docs/" }), "https://a.dev/docs");
  assert.equal(resolveSite({ baseURL: "/docs/" }), "/docs");
  assert.equal(resolveSite({ baseURL: "/" }), undefined);
  assert.equal(resolveSite({}), undefined);
});

test("hasPages ignores the SPA fallback and error pages", () => {
  assert.equal(hasPages(site({ "200.html": page("x", "y"), "404.html": page("x", "y") })), false);
  assert.equal(hasPages(site({ "index.html": page("x", "y") })), true);
  assert.equal(hasPages(path.join(os.tmpdir(), "does-not-exist-nuxt-onetag")), false);
});

test("writeLlms writes both files with absolute links and skips 200.html", () => {
  const body = "This page has enough words in it to be kept by the scanner of static-llms-txt.";
  const dir = site({ "index.html": page("Home", body), "guide/index.html": page("Guide", body), "200.html": page("Fallback", body), "404.html": page("Not found", body) });
  const log = quiet();
  const result = writeLlms(dir, {}, { site: "https://acme.dev", logger: log });
  assert.deepEqual(result.written.sort(), ["llms-full.txt", "llms.txt"]);
  const llms = fs.readFileSync(path.join(dir, "llms.txt"), "utf8");
  assert.match(llms, /\[Guide\]\(https:\/\/acme\.dev\/guide\/\)/);
  assert.doesNotMatch(llms, /Fallback|Not found/);
  assert.match(fs.readFileSync(path.join(dir, "llms-full.txt"), "utf8"), /Source: https:\/\/acme\.dev\/guide\//);
  assert.equal(log.lines.length, 1);
});

test("writeLlms respects exclude", () => {
  const body = "This page has enough words in it to be kept by the scanner of static-llms-txt.";
  const dir = site({ "index.html": page("Home", body), "tags/a/index.html": page("Tag A", body) });
  writeLlms(dir, { exclude: "tags/**" }, { site: "https://acme.dev", logger: quiet() });
  assert.doesNotMatch(fs.readFileSync(path.join(dir, "llms.txt"), "utf8"), /Tag A/);
});

test("llms: false writes nothing", () => {
  const dir = site({ "index.html": page("Home", "Some text that is long enough for the scanner to keep it.") });
  assert.equal(writeLlms(dir, { llms: false }, { logger: quiet() }), null);
  assert.equal(fs.existsSync(path.join(dir, "llms.txt")), false);
});

test("no prerendered pages: one info line, nothing written", () => {
  const dir = site({ "200.html": page("x", "y") });
  const log = quiet();
  assert.equal(writeLlms(dir, {}, { logger: log }), null);
  assert.equal(log.lines.length, 1);
  assert.match(log.lines[0], /No prerendered pages/);
  assert.equal(fs.existsSync(path.join(dir, "llms.txt")), false);
});

test("an llms.txt you wrote yourself is kept", () => {
  const dir = site({ "index.html": page("Home", "Some text that is long enough for the scanner to keep it."), "llms.txt": "# Mine\n" });
  writeLlms(dir, {}, { logger: quiet() });
  assert.equal(fs.readFileSync(path.join(dir, "llms.txt"), "utf8"), "# Mine\n");
});
