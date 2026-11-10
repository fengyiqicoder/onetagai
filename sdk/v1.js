/*! OneTag AI SDK v1.3.0 | https://onetagai.com | onetag.ask(prompt, input?, options?) */
(() => {
  "use strict";

  const MAX_TEXT = 32000;
  const MAX_SIDE = 1600;
  const CONTROLS = ["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement"];
  const HOME = "https://onetagai.com";
  const script = typeof document !== "undefined" ? document.currentScript : null;
  const data = (script && script.dataset) || {};
  // The API lives where the SDK came from when that is OneTag AI itself or a local dev
  // server; loaded from a CDN (jsDelivr, unpkg) or a copy on your own site, it is HOME.
  // data-endpoint on the script tag overrides either.
  const origin = (() => {
    try {
      return script && script.src ? new URL(script.src) : null;
    } catch (e) {
      return null;
    }
  })();
  const OWN = origin && /^(onetagai\.com|htmlai\.000ooo\.ooo|localhost|127\.0\.0\.1)$/.test(origin.hostname);
  const SITE = OWN ? origin.origin : HOME;
  const config = {
    key: data.key || "",
    endpoint: data.endpoint || SITE + "/v1/ask",
    // A short slug naming the integration that sends the calls (a plugin or package name).
    via: data.via || "",
    // Pro keys only: the model that answers, by name (see /docs#models). Empty is the default model.
    model: data.model || "",
  };

  class OneTagError extends Error {
    constructor(code, message, status = 0) {
      super(message);
      this.name = "OneTagError";
      this.code = code;
      this.status = status;
    }
  }

  const isA = (value, type) => typeof globalThis[type] === "function" && value instanceof globalThis[type];
  const textPart = (text) => ({ type: "text", text: String(text) });
  const len = (s) => (typeof s === "string" ? s.length : 0);

  // Trim the text parts, in order, to the characters the server has left after the
  // prompt, system and history (it rejects the whole call over MAX_TEXT, counting 7 per
  // separator between parts). A cut never lands between the two halves of a surrogate
  // pair; parts trimmed to nothing are dropped.
  function fit(parts, budget) {
    const out = [];
    let sep = 0;
    for (const part of parts) {
      if (part.type !== "text") {
        out.push(part);
        continue;
      }
      let cut = Math.max(0, Math.min(budget - sep, part.text.length));
      const c = part.text.charCodeAt(cut - 1);
      if (cut < part.text.length && c >= 0xd800 && c < 0xdc00) cut--;
      if (!cut) continue;
      out.push({ type: "text", text: part.text.slice(0, cut) });
      budget -= sep + cut;
      sep = 7;
    }
    return out;
  }

  function configure(options = {}) {
    if (options.key !== undefined) config.key = options.key;
    if (options.endpoint !== undefined) config.endpoint = options.endpoint;
    if (options.via !== undefined) config.via = options.via;
    if (options.model !== undefined) config.model = options.model;
  }

  const isSvg = (s) => /^(data:)?image\/svg|\.svg([?#]|$)/i.test(s || "");

  // Draw onto a canvas no larger than MAX_SIDE: JPEG on white for photos, PNG for SVG.
  function rasterize(source, width, height, svg) {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale) || 1;
    canvas.height = Math.round(height * scale) || 1;
    const g = canvas.getContext("2d");
    if (!svg) {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { type: "image", data_url: svg ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85) };
  }

  async function fromImg(img, svg) {
    if (!img.naturalWidth) await img.decode();
    return rasterize(img, img.naturalWidth, img.naturalHeight, svg);
  }

  async function imagePart(input) {
    try {
      if (isA(input, "HTMLImageElement")) return await fromImg(input, isSvg(input.currentSrc || input.src));
      const svg = isSvg(input.type);
      if (!svg && typeof globalThis.createImageBitmap === "function") {
        const bitmap = await globalThis.createImageBitmap(input);
        try {
          return rasterize(bitmap, bitmap.width, bitmap.height, false);
        } finally {
          bitmap.close();
        }
      }
      const url = URL.createObjectURL(input);
      try {
        const img = new Image();
        img.src = url;
        return await fromImg(img, svg);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      throw new OneTagError("bad_input", e.name === "SecurityError"
        ? "Cross-origin image without CORS: add crossorigin=\"anonymous\" or pass a File"
        : "Could not read image: " + e.message);
    }
  }

  // Every field as a "name: value" line, except password fields.
  function formText(form) {
    const secret = new Set();
    for (const el of form.elements || []) if (el.type === "password") secret.add(el.name);
    const lines = [];
    for (const [name, value] of new FormData(form)) {
      if (!secret.has(name)) lines.push(name + ": " + (typeof value === "string" ? value : value.name));
    }
    return lines.join("\n");
  }

  async function normalizeInput(input) {
    if (input == null) return [];
    if (Array.isArray(input)) return (await Promise.all(input.map(normalizeInput))).flat();
    if (typeof input === "string") return [textPart(input)];
    if (isA(input, "HTMLImageElement") || (isA(input, "Blob") && /^image\//.test(input.type))) return [await imagePart(input)];
    if (isA(input, "Blob")) return [textPart(await input.text())];
    if (isA(input, "HTMLFormElement")) return [textPart(formText(input))];
    if (CONTROLS.some((type) => isA(input, type))) return [textPart(input.value)];
    if (isA(input, "HTMLElement")) return [textPart(input.innerText || input.textContent || "")];
    // NodeList, HTMLCollection, Set: read like an array. After the element checks,
    // because forms and selects are iterable too.
    if (typeof input[Symbol.iterator] === "function") return normalizeInput(Array.from(input));
    let json;
    try {
      json = JSON.stringify(input, null, 2);
    } catch (e) {}
    if (json === undefined) throw new OneTagError("bad_input", "Unsupported input: " + typeof input);
    return [textPart(json)];
  }

  function parseSSE(buffer) {
    const blocks = buffer.split("\n\n");
    const rest = blocks.pop();
    const events = [];
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
      }
    }
    return { events, rest };
  }

  const stripFences = (s) => s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  const networkError = (detail) => new OneTagError("network", "Network error: " + detail, 0);
  // A fired signal rejects fetch with its reason, which is an AbortError unless the caller gave one.
  const isAbort = (e, signal) => !!(signal && signal.aborted) || !!(e && e.name === "AbortError");
  const abortError = () => new OneTagError("aborted", "Request aborted", 0);

  async function readStream(response, onDelta, signal) {
    const reader = response.body.getReader();
    const decoder = new globalThis.TextDecoder();
    let buffer = "";
    let text = "";
    try {
      for (;;) {
        const { done, value } = await reader.read().catch((e) => { throw isAbort(e, signal) ? abortError() : networkError(e.message); });
        if (done) throw networkError("the stream ended before the answer was complete");
        const parsed = parseSSE(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.error) throw new OneTagError(event.error.code, event.error.message, response.status);
          if (event.done) return text;
          if (event.delta) {
            text += event.delta;
            if (typeof onDelta === "function") onDelta(event.delta);
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  async function ask(prompt, input, options) {
    const o = options || {};
    // options.key and options.via are for packages built on the SDK: they send their own
    // key and name with each call and leave the page's configuration alone.
    const key = o.key || config.key;
    if (!key || /^YOUR_/i.test(key)) {
      // A placeholder left by a template or an AI coding tool is reported like a missing key, with where to fix it.
      throw new OneTagError("no_key", (key ? "OneTag AI key is still the placeholder " + key + ". " : "No OneTag AI key. ")
        + "Get a free key (email only) at " + HOME + "/#get-key and put it in data-key on the script tag (or onetag.configure({key})).", 0);
    }
    const history = Array.isArray(o.history) ? o.history : [];
    // 20 per history message: the server's allowance for its role and framing.
    const budget = MAX_TEXT - len(prompt) - len(o.system) - history.reduce((n, m) => n + 20 + len(m && m.content), 0);
    const body = JSON.stringify({
      key,
      prompt,
      input: fit(await normalizeInput(input), budget),
      system: o.system,
      json: !!o.json,
      max_tokens: o.maxTokens,
      stream: !!o.stream,
      history: o.history,
      via: o.via || config.via || undefined,
      // options.model: null asks the default model on a page that set data-model.
      model: (o.model !== undefined ? o.model : config.model) || undefined,
    });
    let response;
    try {
      response = await globalThis.fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: o.signal });
    } catch (e) {
      throw isAbort(e, o.signal) ? abortError() : networkError(e && e.message);
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => null) || {}).error;
      throw error
        ? new OneTagError(error.code, error.message, response.status)
        : new OneTagError("upstream", "OneTag AI returned HTTP " + response.status, response.status);
    }
    const text = o.stream
      ? await readStream(response, o.stream, o.signal)
      : (await response.json().catch((e) => { throw isAbort(e, o.signal) ? abortError() : e; })).text;
    if (!o.json) return text;
    try {
      return JSON.parse(stripFences(text));
    } catch (e) {
      throw new OneTagError("bad_json", "The answer was not valid JSON", 0);
    }
  }

  globalThis.onetag = {
    version: "1.3.0",
    ask,
    configure,
    OneTagError,
    _internal: { parseSSE, normalizeInput, stripFences },
  };
})();
