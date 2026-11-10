// The loader with a small DOM shim: what onMount does in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, scriptAttributes, open, close, ask, DEMO_KEY, NAME, _reset } from "../src/lib/loader.js";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attributes = {}; this.children = []; this.listeners = {}; }
  setAttribute(n, v) { this.attributes[n] = String(v); }
  getAttribute(n) { return n in this.attributes ? this.attributes[n] : null; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type) { for (const fn of this.listeners[type] || []) fn(); }
}
function fakeDocument() {
  const head = new El("head");
  const body = new El("body");
  const all = () => [...head.children, ...body.children];
  return {
    head, body,
    createElement: (t) => new El(t),
    querySelector(sel) {
      assert.equal(sel, 'script[src*="/ask-docs.js"]');
      return all().find((e) => e.tagName === "SCRIPT" && (e.getAttribute("src") || "").includes("/ask-docs.js")) || null;
    },
    scripts: () => all().filter((e) => e.tagName === "SCRIPT"),
  };
}
function silence(t) {
  const warns = [];
  t.mock.method(console, "warn", (m) => warns.push(m));
  return warns;
}

test("data-ref is the package name", () => {
  assert.equal(NAME, pkg.name);
  assert.equal(scriptAttributes({ key: "ot_k" })["data-ref"], "svelte-onetag");
});

test("load adds one async script tag with the key and options as data attributes", (t) => {
  silence(t);
  const doc = fakeDocument();
  const s = load({ key: "ot_k", label: "Ask", position: "left", color: "#0b5fff", theme: "dark", lang: "en", button: "#ask", placeholder: "Q", rules: "R", index: "/llms-full.txt" }, doc);
  assert.equal(doc.scripts().length, 1);
  assert.equal(s.parentNode, doc.head);
  assert.equal(s.async, true);
  assert.equal(s.getAttribute("src"), "https://onetagai.com/ask-docs.js");
  assert.equal(s.getAttribute("data-key"), "ot_k");
  assert.equal(s.getAttribute("data-ref"), "svelte-onetag");
  assert.equal(s.getAttribute("data-color"), "0b5fff");
  for (const [n, v] of [["label", "Ask"], ["position", "left"], ["theme", "dark"], ["lang", "en"], ["button", "#ask"], ["placeholder", "Q"], ["rules", "R"], ["index", "/llms-full.txt"]]) assert.equal(s.getAttribute("data-" + n), v, n);
});

test("undefined options are left out", () => {
  const a = scriptAttributes({ key: "ot_k", label: undefined, position: undefined });
  assert.deepEqual(Object.keys(a), ["src", "data-key", "data-ref"]);
});

test("load twice, or with a tag already on the page, adds nothing", (t) => {
  silence(t);
  const doc = fakeDocument();
  const first = load({ key: "ot_k" }, doc);
  const second = load({ key: "ot_other" }, doc);
  assert.equal(first, second);
  assert.equal(doc.scripts().length, 1);
  const doc2 = fakeDocument();
  const own = doc2.createElement("script");
  own.setAttribute("src", "https://onetagai.com/ask-docs.js");
  doc2.body.appendChild(own);
  assert.equal(load({ key: "ot_k" }, doc2), own);
  assert.equal(doc2.scripts().length, 1);
});

test("no key: demo key and one console warning with the signup command", (t) => {
  _reset();
  const warns = silence(t);
  const a = load({}, fakeDocument());
  load({}, fakeDocument());
  assert.equal(a.getAttribute("data-key"), DEMO_KEY);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /localhost only/);
  assert.match(warns[0], /api\/signup/);
});

test("with a key there is no warning", (t) => {
  _reset();
  const warns = silence(t);
  load({ key: "ot_k" }, fakeDocument());
  assert.equal(warns.length, 0);
});

test("on the server load returns null and the helpers do nothing", () => {
  assert.equal(load({ key: "ot_k" }, undefined), null);
  assert.doesNotThrow(() => { open(); close(); ask("x"); });
});

test("helpers call window.onetagAskDocs, and wait for the script when it is still loading", () => {
  const calls = [];
  const doc = fakeDocument();
  globalThis.document = doc;
  globalThis.window = {};
  try {
    load({ key: "ot_k" }, doc);
    open();
    ask("How?");
    assert.deepEqual(calls, []);
    window.onetagAskDocs = { open: () => calls.push("open"), close: () => calls.push("close"), ask: (q) => calls.push("ask:" + q) };
    doc.scripts()[0].dispatch("load");
    assert.deepEqual(calls, ["open", "ask:How?"]);
    close();
    assert.deepEqual(calls, ["open", "ask:How?", "close"]);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
