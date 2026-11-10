import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../v1.js", import.meta.url), "utf8");
const ctx = { window: {}, document: { currentScript: { dataset: { key: "ot_test" }, src: "https://onetagai.com/v1.js" } }, fetch: () => {}, TextDecoder, URL };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const { parseSSE, normalizeInput, stripFences } = ctx.onetag._internal;
// Objects made inside the vm context carry its prototypes, which strict deepEqual rejects; clone them into this realm.
const local = (v) => structuredClone(v);

test("parseSSE splits complete events and keeps the rest", () => {
  const r = parseSSE('data: {"delta":"He"}\n\ndata: {"delta":"llo"}\n\ndata: {"do');
  assert.deepEqual(local(r.events), [{ delta: "He" }, { delta: "llo" }]);
  assert.equal(r.rest, 'data: {"do');
});

test("normalizeInput handles string, object, array, null", async () => {
  assert.deepEqual(local(await normalizeInput("hi")), [{ type: "text", text: "hi" }]);
  assert.deepEqual(local(await normalizeInput({ a: 1 })), [{ type: "text", text: JSON.stringify({ a: 1 }, null, 2) }]);
  assert.deepEqual(local(await normalizeInput(["a", "b"])), [{ type: "text", text: "a" }, { type: "text", text: "b" }]);
  assert.deepEqual(local(await normalizeInput(null)), []);
  // normalizeInput keeps the whole text; ask() trims it to the budget the server has left.
  assert.equal((await normalizeInput("x".repeat(40000)))[0].text.length, 40000);
});

test("stripFences", () => {
  assert.equal(stripFences('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripFences('{"a":1}'), '{"a":1}');
});

test("ask posts the right body and parses json mode", async () => {
  let captured;
  ctx.fetch = async (url, init) => { captured = { url, init }; return { ok: true, status: 200, json: async () => ({ text: '```json\n{"ok":true}\n```', usage: { input: 1, output: 1 } }) }; };
  const out = await ctx.onetag.ask("Extract", "text", { json: true, system: "S", maxTokens: 50 });
  assert.deepEqual(local(out), { ok: true });
  assert.equal(captured.url, "https://onetagai.com/v1/ask");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.key, "ot_test"); assert.equal(body.json, true); assert.equal(body.max_tokens, 50); assert.equal(body.system, "S");
  assert.deepEqual(body.input, [{ type: "text", text: "text" }]);
});

test("ask sends the chosen model, per call or configured, and none by default", async () => {
  const bodies = [];
  ctx.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ text: "ok" }) }; };
  await ctx.onetag.ask("p");
  await ctx.onetag.ask("p", null, { model: "kimi-k3.1-pro" });
  ctx.onetag.configure({ model: "glm-5.3" });
  await ctx.onetag.ask("p");
  await ctx.onetag.ask("p", null, { model: "deepseek-v4-pro" });
  await ctx.onetag.ask("p", null, { model: null });
  ctx.onetag.configure({ model: "" });
  await ctx.onetag.ask("p");
  assert.deepEqual(bodies.map((b) => b.model), [undefined, "kimi-k3.1-pro", "glm-5.3", "deepseek-v4-pro", undefined, undefined]);
});

test("ask throws OneTagError with server code", async () => {
  ctx.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { code: "quota_exceeded", message: "nope" } }) });
  await assert.rejects(ctx.onetag.ask("p"), (e) => e instanceof ctx.onetag.OneTagError && e.code === "quota_exceeded" && e.status === 429);
});

const sse = (...events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
// A streaming 200 whose body arrives in byte chunks cut at the given offsets.
const streamed = (text, cuts) => {
  const bytes = new TextEncoder().encode(text);
  const ends = [...cuts, bytes.length];
  return { ok: true, status: 200, body: new ReadableStream({ start(c) { ends.forEach((end, i) => c.enqueue(bytes.slice(i ? ends[i - 1] : 0, end))); c.close(); } }) };
};

test("ask streams deltas split mid-event and mid-character, resolving the full text", async () => {
  const payload = sse({ delta: "Hé" }, { delta: "llo" }, { done: true, usage: { input: 1, output: 2 } });
  const midChar = payload.indexOf("é") + 1; // é is two UTF-8 bytes; everything before it is ASCII
  let body;
  ctx.fetch = async (url, init) => { body = JSON.parse(init.body); return streamed(payload, [5, midChar, payload.indexOf("llo")]); };
  const deltas = [];
  const out = await ctx.onetag.ask("p", null, { stream: (d) => deltas.push(d) });
  assert.equal(out, "Héllo");
  assert.deepEqual(deltas, ["Hé", "llo"]);
  assert.equal(body.stream, true);
  assert.deepEqual(body.input, []);
});

test("ask rejects on a mid-stream error event and on a stream that ends without done", async () => {
  ctx.fetch = async () => streamed(sse({ delta: "He" }, { error: { code: "upstream", message: "boom" } }), []);
  await assert.rejects(ctx.onetag.ask("p", null, { stream: () => {} }), (e) => e instanceof ctx.onetag.OneTagError && e.code === "upstream" && e.message === "boom");
  ctx.fetch = async () => streamed(sse({ delta: "He" }), []);
  await assert.rejects(ctx.onetag.ask("p", null, { stream: () => {} }), (e) => e.code === "network" && e.status === 0);
});

test("ask maps a failed fetch to network and a non-JSON error body to upstream", async () => {
  ctx.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(ctx.onetag.ask("p"), (e) => e instanceof ctx.onetag.OneTagError && e.code === "network" && e.status === 0);
  ctx.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  await assert.rejects(ctx.onetag.ask("p"), (e) => e.code === "upstream" && e.status === 502);
});

test("json mode rejects bad_json when the answer is not JSON", async () => {
  ctx.fetch = async () => ({ ok: true, status: 200, json: async () => ({ text: "Sorry, no JSON here", usage: { input: 1, output: 1 } }) });
  await assert.rejects(ctx.onetag.ask("p", null, { json: true }), (e) => e.code === "bad_json");
});

test("configure replaces key and endpoint; no key rejects no_key without a request", async () => {
  let captured;
  ctx.fetch = async (url, init) => { captured = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ text: "hi", usage: { input: 1, output: 1 } }) }; };
  try {
    ctx.onetag.configure({ key: "" });
    await assert.rejects(ctx.onetag.ask("p"), (e) => e.code === "no_key" && e.status === 0);
    assert.equal(captured, undefined);
    ctx.onetag.configure({ key: "ot_other", endpoint: "http://127.0.0.1:8020/v1/ask" });
    assert.equal(await ctx.onetag.ask("p", null, { history: [{ role: "user", content: "a" }] }), "hi");
    assert.equal(captured.url, "http://127.0.0.1:8020/v1/ask");
    assert.equal(captured.body.key, "ot_other");
    assert.deepEqual(captured.body.history, [{ role: "user", content: "a" }]);
  } finally {
    ctx.onetag.configure({ key: "ot_test", endpoint: "https://onetagai.com/v1/ask" });
  }
});

test("normalizeInput reads text Blobs and elements, and rejects unsupported values", async () => {
  ctx.Blob = Blob;
  ctx.HTMLElement = class {};
  try {
    assert.deepEqual(local(await normalizeInput(new Blob(["from a file"], { type: "text/plain" }))), [{ type: "text", text: "from a file" }]);
    const el = Object.assign(new ctx.HTMLElement(), { innerText: "", textContent: "fallback" });
    assert.deepEqual(local(await normalizeInput(el)), [{ type: "text", text: "fallback" }]);
    await assert.rejects(normalizeInput(() => 1), (e) => e.code === "bad_input");
    const loop = {}; loop.self = loop;
    await assert.rejects(normalizeInput(loop), (e) => e.code === "bad_input");
  } finally {
    delete ctx.Blob; delete ctx.HTMLElement;
  }
});

// A canvas stand-in: records fills and draws, and "exports" its size, type and quality.
const fakeCanvas = () => {
  const canvas = { width: 0, height: 0, ops: [], taint: false };
  const g = { fillStyle: "", fillRect: (...a) => canvas.ops.push(`fill ${g.fillStyle} ${a}`), drawImage: (src, ...a) => canvas.ops.push(`draw ${a}`) };
  canvas.getContext = () => g;
  canvas.toDataURL = (type, quality) => {
    if (canvas.taint) throw Object.assign(new Error("tainted"), { name: "SecurityError" });
    return `data:${type};${canvas.width}x${canvas.height}@${quality}`;
  };
  return canvas;
};
// Fake <img>: dimensions appear only after decode(), like an image that has not loaded yet.
class FakeImg {
  constructor(w, h, src) { this.size = [w, h]; this.currentSrc = src; }
  decode() { [this.naturalWidth, this.naturalHeight] = this.size; return Promise.resolve(); }
}

test("images are scaled to at most 1600 px and sent as JPEG 0.85 on white; SVG stays PNG", async () => {
  const canvases = [];
  const bitmaps = [];
  ctx.document.createElement = (tag) => { assert.equal(tag, "canvas"); canvases.push(fakeCanvas()); return canvases.at(-1); };
  ctx.HTMLImageElement = FakeImg;
  ctx.Blob = Blob;
  ctx.createImageBitmap = async (blob) => { const b = { width: 3000, height: 4000, closed: false, close() { b.closed = true; } }; bitmaps.push(b); return b; };
  ctx.Image = class extends FakeImg { constructor() { super(300, 150); } set src(url) { this.currentSrc = url; } };
  const one = async (input) => { const parts = local(await normalizeInput(input)); assert.equal(parts.length, 1); assert.equal(parts[0].type, "image"); return parts[0].data_url; };
  try {
    assert.equal(await one(new FakeImg(4000, 3000, "https://a.example/hero.jpg")), "data:image/jpeg;1600x1200@0.85");
    assert.deepEqual(canvases[0].ops, ["fill #fff 0,0,1600,1200", "draw 0,0,1600,1200"]);
    assert.equal(await one(new FakeImg(800, 600, "https://a.example/small.png")), "data:image/jpeg;800x600@0.85");
    assert.equal(await one(new Blob(["x"], { type: "image/jpeg" })), "data:image/jpeg;1200x1600@0.85");
    assert.equal(bitmaps.length, 1);
    assert.equal(bitmaps[0].closed, true);
    assert.equal(await one(new FakeImg(400, 200, "https://a.example/logo.svg?v=2")), "data:image/png;400x200@undefined");
    assert.deepEqual(canvases.at(-1).ops, ["draw 0,0,400,200"]);
    assert.equal(await one(new Blob(["<svg/>"], { type: "image/svg+xml" })), "data:image/png;300x150@undefined");
    assert.equal(bitmaps.length, 1);
    ctx.document.createElement = () => Object.assign(fakeCanvas(), { taint: true });
    await assert.rejects(normalizeInput(new FakeImg(10, 10, "https://other.example/a.jpg")), (e) => e.code === "bad_input" && /crossorigin/.test(e.message));
  } finally {
    delete ctx.document.createElement; delete ctx.HTMLImageElement; delete ctx.Blob; delete ctx.createImageBitmap; delete ctx.Image;
  }
});

test("forms send name: value lines and form controls send their value", async () => {
  ctx.HTMLElement = class { constructor(props) { Object.assign(this, { innerText: "", textContent: "" }, props); } };
  ctx.HTMLFormElement = class extends ctx.HTMLElement {};
  ctx.HTMLInputElement = class extends ctx.HTMLElement {};
  ctx.HTMLTextAreaElement = class extends ctx.HTMLElement {};
  ctx.HTMLSelectElement = class extends ctx.HTMLElement {};
  ctx.FormData = class { constructor(form) { this.form = form; } *[Symbol.iterator]() { yield* this.form.fields; } };
  try {
    const form = new ctx.HTMLFormElement({ innerText: "Name Email CV Send", fields: [["name", "Jane Doe"], ["email", "jane@example.com"], ["cv", new File(["x"], "cv.pdf")]] });
    assert.deepEqual(local(await normalizeInput(form)), [{ type: "text", text: "name: Jane Doe\nemail: jane@example.com\ncv: cv.pdf" }]);
    for (const Control of [ctx.HTMLInputElement, ctx.HTMLTextAreaElement, ctx.HTMLSelectElement]) {
      assert.deepEqual(local(await normalizeInput(new Control({ value: "typed by the user" }))), [{ type: "text", text: "typed by the user" }]);
    }
  } finally {
    for (const k of ["HTMLElement", "HTMLFormElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "FormData"]) delete ctx[k];
  }
});

const okFetch = (sink) => async (url, init) => { sink.body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ text: "ok", usage: { input: 1, output: 1 } }) }; };
const sentText = (body) => body.input.filter((p) => p.type === "text").map((p) => p.text).join("");

test("ask trims long input to the 32,000-character budget without splitting a surrogate pair", async () => {
  const sink = {};
  ctx.fetch = okFetch(sink);
  // 20 leaves an even budget, 21 an odd one: with emoji-only input the odd cut lands inside a pair.
  for (const prompt of ["p".repeat(20), "p".repeat(21)]) {
    for (const input of ["x".repeat(40000), "\u{1F600}".repeat(20000)]) {
      await ctx.onetag.ask(prompt, input);
      const text = sentText(sink.body);
      const total = sink.body.prompt.length + text.length;
      assert.ok(total <= 32000 && total >= 31999, `total ${total}`);
      assert.ok(text.isWellFormed(), "no lone surrogate at the cut");
    }
  }
});

test("the trim budget leaves room for system and history, and keeps parts in order", async () => {
  const sink = {};
  ctx.fetch = okFetch(sink);
  await ctx.onetag.ask("p".repeat(20), ["a".repeat(20000), "b".repeat(20000)], { system: "s".repeat(1000), history: [{ role: "user", content: "h".repeat(1000) }] });
  const [first, second] = sink.body.input;
  assert.equal(first.text, "a".repeat(20000));
  assert.ok(/^b+$/.test(second.text));
  // The server also counts 20 characters per history message and 7 per "\n\n---\n\n" between parts.
  assert.equal(second.text.length, 32000 - 20 - 1000 - (1000 + 20) - 20000 - 7);
  await ctx.onetag.ask("p".repeat(32001), "page");
  assert.deepEqual(sink.body.input, []);
});

test("forms never send password fields", async () => {
  ctx.HTMLElement = class { constructor(props) { Object.assign(this, { innerText: "", textContent: "" }, props); } };
  ctx.HTMLFormElement = class extends ctx.HTMLElement {};
  ctx.FormData = class { constructor(form) { this.form = form; } *[Symbol.iterator]() { yield* this.form.fields; } };
  try {
    const form = new ctx.HTMLFormElement({
      fields: [["user", "jane"], ["pass", "hunter2"], ["note", "hi"]],
      elements: [{ name: "user", type: "text" }, { name: "pass", type: "password" }, { name: "note", type: "textarea" }],
    });
    assert.deepEqual(local(await normalizeInput(form)), [{ type: "text", text: "user: jane\nnote: hi" }]);
  } finally {
    for (const k of ["HTMLElement", "HTMLFormElement", "FormData"]) delete ctx[k];
  }
});

test("normalizeInput reads a NodeList, a Set or another iterable like an array; forms stay forms", async () => {
  ctx.HTMLElement = class { constructor(props) { Object.assign(this, { innerText: "", textContent: "" }, props); } };
  // Real forms are iterable over their controls; they must still send name: value lines.
  ctx.HTMLFormElement = class extends ctx.HTMLElement { *[Symbol.iterator]() { yield* this.controls; } };
  ctx.FormData = class { constructor(form) { this.form = form; } *[Symbol.iterator]() { yield* this.form.fields; } };
  class FakeNodeList { constructor(...items) { this.items = items; this.length = items.length; } [Symbol.iterator]() { return this.items[Symbol.iterator](); } }
  try {
    const list = new FakeNodeList(new ctx.HTMLElement({ innerText: "one" }), new ctx.HTMLElement({ innerText: "two" }));
    assert.deepEqual(local(await normalizeInput(list)), [{ type: "text", text: "one" }, { type: "text", text: "two" }]);
    assert.deepEqual(local(await normalizeInput(new Set(["a", "b"]))), [{ type: "text", text: "a" }, { type: "text", text: "b" }]);
    const form = new ctx.HTMLFormElement({ fields: [["q", "hi"]], controls: [new ctx.HTMLElement({ innerText: "x" })] });
    assert.deepEqual(local(await normalizeInput(form)), [{ type: "text", text: "q: hi" }]);
  } finally {
    for (const k of ["HTMLElement", "HTMLFormElement", "FormData"]) delete ctx[k];
  }
});

const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

test("ask passes options.signal to fetch and maps an abort to OneTagError aborted", async () => {
  const signal = { aborted: false };
  let init;
  ctx.fetch = async (url, i) => { init = i; throw abortError(); };
  await assert.rejects(ctx.onetag.ask("p", null, { signal }), (e) => e instanceof ctx.onetag.OneTagError && e.code === "aborted" && e.message === "Request aborted" && e.status === 0);
  assert.equal(init.signal, signal);
  // abort(reason) rejects fetch with the reason itself; the fired signal still means aborted.
  ctx.fetch = async () => { throw "user left"; };
  await assert.rejects(ctx.onetag.ask("p", null, { signal: { aborted: true } }), (e) => e.code === "aborted");
  ctx.fetch = async () => ({ ok: true, status: 200, json: async () => { throw abortError(); } });
  await assert.rejects(ctx.onetag.ask("p", null, { signal }), (e) => e.code === "aborted");
});

test("a stream cancels its reader when it is aborted, when it fails and when it finishes", async () => {
  const enc = new TextEncoder();
  const fakeReader = (...reads) => { const r = { cancelled: 0, read: async () => reads.shift()(), cancel: async () => { r.cancelled++; } }; return r; };
  let reader;
  ctx.fetch = async () => ({ ok: true, status: 200, body: { getReader: () => reader } });
  const deltas = [];
  reader = fakeReader(() => ({ done: false, value: enc.encode(sse({ delta: "He" })) }), () => { throw abortError(); });
  await assert.rejects(ctx.onetag.ask("p", null, { stream: (d) => deltas.push(d), signal: { aborted: true } }), (e) => e.code === "aborted");
  assert.deepEqual(deltas, ["He"]);
  assert.equal(reader.cancelled, 1);
  reader = fakeReader(() => ({ done: false, value: enc.encode(sse({ error: { code: "upstream", message: "boom" } })) }));
  await assert.rejects(ctx.onetag.ask("p", null, { stream: () => {} }), (e) => e.code === "upstream");
  assert.equal(reader.cancelled, 1);
  reader = fakeReader(() => ({ done: false, value: enc.encode(sse({ delta: "Hi" }, { done: true, usage: { input: 1, output: 1 } })) }));
  assert.equal(await ctx.onetag.ask("p", null, { stream: () => {} }), "Hi");
  assert.equal(reader.cancelled, 1);
});


// A fresh SDK instance whose script tag carries the given data-key (or none).
const fresh = (key) => {
  const c = { window: {}, document: { currentScript: { dataset: key === undefined ? {} : { key }, src: "https://onetagai.com/v1.js" } }, fetch: () => { throw new Error("fetch must not be called"); }, TextDecoder, URL };
  c.window = c; vm.createContext(c); vm.runInContext(src, c);
  return c.onetag;
};

test("ask without a key throws no_key pointing to the get-key page", async () => {
  const h = fresh(undefined);
  await assert.rejects(h.ask("p"), (e) => e instanceof h.OneTagError && e.code === "no_key" && e.message.includes("https://onetagai.com/#get-key"));
  await assert.rejects(h.ask("p"), (e) => !/lock/i.test(e.message));  // free keys are not locked to a domain
});

// A fresh SDK instance loaded from `src` with the given data-* attributes; fetch records the URL it is called with.
const loaded = (scriptSrc, dataset = { key: "ot_test" }) => {
  const calls = [];
  const c = { window: {}, document: { currentScript: scriptSrc === null ? null : { dataset, src: scriptSrc } }, TextDecoder, URL,
    fetch: async (url) => { calls.push(url); return { ok: true, json: async () => ({ text: "ok" }) }; } };
  c.window = c; vm.createContext(c); vm.runInContext(src, c);
  return { onetag: c.onetag, calls };
};

test("endpoint follows the script origin only for OneTag AI itself and local dev servers", async () => {
  for (const [src, endpoint] of [
    ["https://onetagai.com/v1.js", "https://onetagai.com/v1/ask"],
    ["https://htmlai.000ooo.ooo/v1.js", "https://htmlai.000ooo.ooo/v1/ask"],
    ["http://localhost:8020/v1.js", "http://localhost:8020/v1/ask"],
    ["http://127.0.0.1:8020/v1.js", "http://127.0.0.1:8020/v1/ask"],
    ["https://cdn.jsdelivr.net/gh/fengyiqicoder/onetagai@main/sdk/v1.js", "https://onetagai.com/v1/ask"],
    ["https://unpkg.com/onetagai/v1.js", "https://onetagai.com/v1/ask"],
    ["https://example.com/js/v1.js", "https://onetagai.com/v1/ask"],
    ["https://evil-onetagai.com/v1.js", "https://onetagai.com/v1/ask"],
    ["", "https://onetagai.com/v1/ask"],
  ]) {
    const { onetag, calls } = loaded(src);
    await onetag.ask("p");
    assert.equal(calls[0], endpoint, src);
  }
  const none = loaded(null);
  none.onetag.configure({ key: "ot_test" });
  await none.onetag.ask("p");
  assert.equal(none.calls[0], "https://onetagai.com/v1/ask");
});

test("data-endpoint on the script tag overrides the default", async () => {
  const { onetag, calls } = loaded("https://cdn.jsdelivr.net/gh/x/y/v1.js", { key: "ot_test", endpoint: "https://my.proxy.test/ask" });
  await onetag.ask("p");
  assert.equal(calls[0], "https://my.proxy.test/ask");
});

test("ask with a placeholder key throws no_key naming the placeholder", async () => {
  const h = fresh("YOUR_ONETAG_KEY");
  await assert.rejects(h.ask("p"), (e) => e.code === "no_key" && /placeholder/i.test(e.message) && e.message.includes("/#get-key"));
  h.configure({ key: "YOUR_ONETAG_KEY" });
  await assert.rejects(h.ask("p"), (e) => e.code === "no_key" && /placeholder/i.test(e.message));
});

test("ask sends via from the script tag, configure() or the call, and a per-call key", async () => {
  let body;
  ctx.fetch = async (url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ text: "ok" }) }; };
  await ctx.onetag.ask("p");
  assert.equal("via" in body, false);
  ctx.onetag.configure({ via: "my-plugin" });
  await ctx.onetag.ask("p");
  assert.equal(body.via, "my-plugin");
  await ctx.onetag.ask("p", null, { via: "other-plugin", key: "ot_other" });
  assert.equal(body.via, "other-plugin");
  assert.equal(body.key, "ot_other");
  ctx.onetag.configure({ via: "" });
  await ctx.onetag.ask("p");
  assert.equal("via" in body, false);
  assert.equal(body.key, "ot_test");
});

test("data-model on the script tag names the model for every call", async () => {
  const bodies = [];
  const c = { window: {}, document: { currentScript: { dataset: { key: "ot_test", model: "kimi-k3.1-pro" }, src: "https://onetagai.com/v1.js" } }, TextDecoder, URL,
    fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ text: "ok" }) }; } };
  c.window = c; vm.createContext(c); vm.runInContext(src, c);
  await c.onetag.ask("p");
  await c.onetag.ask("p", null, { model: "glm-5.3" });
  await c.onetag.ask("p", null, { model: null });
  assert.deepEqual(bodies.map((b) => b.model), ["kimi-k3.1-pro", "glm-5.3", undefined]);
});
