/*! OneTag AI widget | https://onetagai.com/docs#widget | MIT */
// One script tag puts an "ask this page" button on any page:
//
//   <script async src="https://onetagai.com/widget.js" data-key="YOUR_ONETAG_KEY"></script>
//
// Every option can be a data-* attribute or a query parameter on the script URL (for
// loaders that only take a URL). The widget lives in a shadow root, so the page's CSS
// and the widget's do not touch. It does not need v1.js and does not define `onetag`.
(function () {
  "use strict";
  const VERSION = "1.0.1";
  const HOME = "https://onetagai.com";
  const MAX_TEXT = 32000;        // the server's limit on prompt + system + history + input
  const MAX_TOKENS = 400;
  const KEEP = 6;                // history messages sent with each question
  const win = typeof window !== "undefined" ? window : globalThis;
  if (win.onetagWidget) return;  // loaded twice (pjax, two includes): the first one stays
  const doc = win.document;
  const script = doc.currentScript || (doc.querySelector && doc.querySelector('script[src*="/widget.js"][data-key],script[src*="onetagai.com/widget.js"]'));

  const SYSTEM = "You answer a visitor's question about the web page given as input. Answer from the page content, in the language of the question, in one to four sentences of plain text without Markdown. If the page does not cover it, say so.";

  const STRINGS = {
    en: {
      title: "Ask this page", greeting: "Ask anything about this page.", placeholder: "Type a question",
      send: "Send", close: "Close", launcher: "Ask AI about this page", question: "Question", powered: "Powered by OneTag AI",
      quota: "This site has used up its AI quota for now.", rate: "Too many questions at once. Try again in a minute.",
      setup: "The AI key on this site is not set up correctly.", fail: "No answer came back. Try again.",
    },
    "zh-Hans": {
      title: "问问这一页", greeting: "关于这一页的内容，想问什么都可以。", placeholder: "输入问题",
      send: "发送", close: "关闭", launcher: "向 AI 提问本页内容", question: "问题", powered: "由 OneTag AI 提供",
      quota: "本站的 AI 额度暂时用完了。", rate: "提问太频繁，请一分钟后再试。",
      setup: "本站的 AI key 没有配置正确。", fail: "没有收到回答，请再试一次。",
    },
    "zh-Hant": {
      title: "問問這一頁", greeting: "關於這一頁的內容，想問什麼都可以。", placeholder: "輸入問題",
      send: "傳送", close: "關閉", launcher: "向 AI 提問本頁內容", question: "問題", powered: "由 OneTag AI 提供",
      quota: "本站的 AI 額度暫時用完了。", rate: "提問太頻繁，請一分鐘後再試。",
      setup: "本站的 AI key 沒有設定正確。", fail: "沒有收到回答，請再試一次。",
    },
  };

  function pickLang(tag) {
    const t = String(tag || "").toLowerCase();
    if (!/^zh(-|_|$)/.test(t)) return "en";
    return /hant|tw|hk|mo/.test(t) ? "zh-Hant" : "zh-Hans";
  }

  // Options come from data-* on the script tag first, then from the script URL's query.
  function readConfig(dataset, src) {
    let url = null;
    try { url = new URL(src); } catch (e) { /* inline or relative without a base: attributes only */ }
    const get = (name) => String((dataset && dataset[name]) || (url && url.searchParams.get(name)) || "").trim();
    const own = url && /^(onetagai\.com|htmlai\.000ooo\.ooo|localhost|127\.0\.0\.1)$/.test(url.hostname);
    const ref = get("ref").toLowerCase();
    const color = get("color").replace(/^(?=[0-9a-f]{3,8}$)/i, "#");
    const theme = get("theme");
    return {
      key: get("key"),
      ref: /^[a-z0-9][a-z0-9._-]{0,39}$/.test(ref) ? ref : "",
      endpoint: get("endpoint") || (own ? url.origin : HOME) + "/v1/ask",
      source: get("source"),
      title: get("title"),
      greeting: get("greeting"),
      placeholder: get("placeholder"),
      system: get("system"),
      position: get("position") === "left" ? "left" : "right",
      color: /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : "",
      theme: theme === "light" || theme === "dark" ? theme : "auto",
      lang: get("lang"),
      launcher: get("launcher") !== "false",
    };
  }

  // The page the visitor is on. Hash routers (docsify, Vue hash mode) keep the route after
  // "#/" or "#!/", up to a "?"; a plain "#section" is still the same page.
  function pagePath(loc) {
    const hash = String((loc && loc.hash) || "");
    return String((loc && loc.pathname) || "") + (/^#!?\//.test(hash) ? hash.split("?")[0] : "");
  }

  // Cut to at most `budget` characters without splitting a surrogate pair.
  function cut(text, budget) {
    if (budget <= 0) return "";
    if (text.length <= budget) return text;
    const c = text.charCodeAt(budget - 1);
    return text.slice(0, c >= 0xd800 && c < 0xdc00 ? budget - 1 : budget);
  }

  // The request for one question. The page text takes whatever room the question, the
  // system prompt and the history leave (20 per history message is the server's
  // allowance for its framing); the oldest turns go first when the room runs out.
  function buildBody(config, question, history, page) {
    const system = config.system || SYSTEM;
    let kept = history.slice(-KEEP);
    const room = () => MAX_TEXT - question.length - system.length - kept.reduce((n, m) => n + 20 + m.content.length, 0);
    while (kept.length && room() < 4000) kept = kept.slice(2);
    const body = { key: config.key, prompt: question, system, max_tokens: MAX_TOKENS, stream: true, via: config.ref || "widget" };
    const text = cut(page, room());
    if (text) body.input = [{ type: "text", text }];
    if (kept.length) body.history = kept;
    return body;
  }

  function parseSSE(buffer) {
    const blocks = buffer.split("\n\n");
    const rest = blocks.pop();
    const events = [];
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try { events.push(JSON.parse(line.slice(6))); } catch (e) { /* a malformed event is skipped */ }
      }
    }
    return { events, rest };
  }

  // true/false for an rgb()/rgba() colour, null when it is transparent or in a form we do not read.
  function isDark(color) {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(String(color || "").trim());
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha < 0.5) return null;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.5;
  }

  const config = readConfig(script && script.dataset, script && script.src);
  const strings = STRINGS[pickLang(config.lang || (doc.documentElement && doc.documentElement.lang) || (win.navigator && win.navigator.language))];
  const usable = !!config.key && !/^YOUR_|…|\.\.\./i.test(config.key);
  if (!usable && win.console) {
    win.console.warn("[OneTag AI widget] " + (config.key ? "The key is still a placeholder." : "No key.")
      + " Get a free key (email only) at " + HOME + "/#get-key and put it in data-key on the widget script tag. Nothing is shown until then.");
  }

  const CSS = [
    ":host{all:initial}",
    ".ot{--blue:#0b5fff;--paper:#fff;--paper2:#f5f7fb;--ink:#0b1020;--line:#d8dee9;--edge:#0b1020;--head:#0b1020;--muted:#5c667d;font:15px/1.5 system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:var(--ink);text-align:left}",
    ".ot[data-theme=dark]{--paper:#111830;--paper2:#1d2640;--ink:#f5f7fb;--line:#33405f;--edge:#33405f;--head:#060a16;--muted:#99a2b5}",
    "*{box-sizing:border-box}",
    "button{font:inherit;border-radius:0;cursor:pointer}",
    ":focus-visible{outline:2px solid var(--blue);outline-offset:2px}",
    ".launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:52px;height:52px;padding:0;border:0;background:var(--blue);color:#fff;display:grid;place-items:center;box-shadow:0 4px 14px rgba(11,16,32,.25)}",
    ".launcher:hover,.send:hover{filter:brightness(.88)}",
    ".launcher[hidden],.panel[hidden]{display:none}",
    ".panel{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:min(360px,calc(100vw - 40px));height:min(480px,calc(100vh - 104px));display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--edge);box-shadow:0 8px 30px rgba(11,16,32,.18)}",
    ".ot[data-pos=left] .launcher,.ot[data-pos=left] .panel{right:auto;left:20px}",
    ".ot[data-launcher=off] .panel{bottom:20px;height:min(480px,calc(100vh - 40px))}",
    ".head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;background:var(--head);color:#fff;font-weight:600}",
    ".close{border:0;background:none;color:#fff;font-size:22px;line-height:1;padding:0 2px}",
    ".close:focus-visible{outline-color:#fff}",
    ".log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
    ".msg{margin:0;padding:8px 12px;max-width:85%;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".ai{align-self:flex-start;background:var(--paper2)}",
    ".me{align-self:flex-end;background:var(--blue);color:#fff}",
    ".err{align-self:flex-start;border:1px solid var(--line);color:var(--muted)}",
    ".wait{color:var(--muted);animation:ot-wait 1.2s ease-in-out infinite}",
    "@keyframes ot-wait{50%{opacity:.35}}",
    "form{display:flex;gap:8px;margin:0;padding:10px 14px;border-top:1px solid var(--line)}",
    "input{flex:1;min-width:0;font:inherit;font-size:16px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:0;padding:7px 10px}",
    "input:focus{outline:0;border-color:var(--blue)}",
    "input::placeholder{color:var(--muted)}",
    ".send{border:0;background:var(--blue);color:#fff;padding:0 14px;white-space:nowrap}",
    ".send:disabled{opacity:.5;cursor:default}",
    ".foot{padding:0 14px 8px;font-size:12px;text-align:right}",
    ".foot a{color:var(--muted);text-decoration:none}",
    ".foot a:hover{text-decoration:underline}",
    "@media (max-width:480px){.panel,.ot[data-pos=left] .panel{left:12px;right:12px;width:auto}}",
    "@media (prefers-reduced-motion:reduce){.wait{animation:none}}",
    "@media print{.ot{display:none}}",
  ].join("");

  let ui = null;           // built on first use
  let history = [];        // [{role, content}] for the page the visitor is on
  let historyPath = "";
  let busy = false;
  let launcherShown = config.launcher;

  function el(tag, attrs, children) {
    const node = doc.createElement(tag);
    for (const name in attrs || {}) {
      if (name === "text") node.textContent = attrs[name];
      else node.setAttribute(name, attrs[name]);
    }
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  function bubbleIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(NS, "svg");
    const attrs = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
    for (const name in attrs) svg.setAttribute(name, attrs[name]);
    const path = doc.createElementNS(NS, "path");
    path.setAttribute("d", "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12z");
    svg.appendChild(path);
    return svg;
  }

  function build() {
    const host = el("div", { "data-onetag-widget": "" });
    const root = host.attachShadow({ mode: "open" });
    const launcher = el("button", { class: "launcher", type: "button", "aria-label": strings.launcher, "aria-expanded": "false" }, [bubbleIcon()]);
    const close = el("button", { class: "close", type: "button", "aria-label": strings.close, text: "×" });
    const log = el("div", { class: "log", role: "log", "aria-live": "polite" });
    const input = el("input", { type: "text", maxlength: "500", autocomplete: "off", enterkeyhint: "send", placeholder: config.placeholder || strings.placeholder, "aria-label": strings.question });
    const send = el("button", { class: "send", type: "submit", text: strings.send });
    const form = el("form", {}, [input, send]);
    const link = el("a", { href: HOME + "/?ref=" + (config.ref || "widget"), target: "_blank", rel: "noopener", text: strings.powered });
    const panel = el("section", { class: "panel", role: "dialog", "aria-label": config.title || strings.title, hidden: "" }, [
      el("div", { class: "head" }, [el("span", { text: config.title || strings.title }), close]),
      log, form, el("div", { class: "foot" }, [link]),
    ]);
    const wrap = el("div", { class: "ot", "data-pos": config.position, "data-theme": "light" }, [panel, launcher]);
    if (config.color) wrap.style.setProperty("--blue", config.color);
    root.appendChild(el("style", { text: CSS }));
    root.appendChild(wrap);
    log.appendChild(el("p", { class: "msg ai", text: config.greeting || strings.greeting }));
    launcher.addEventListener("click", toggle);
    close.addEventListener("click", () => { closePanel(); if (launcherShown) launcher.focus(); });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { closePanel(); if (launcherShown) launcher.focus(); } });
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    return { host, wrap, launcher, panel, log, input, send };
  }

  // Builds the widget once and keeps it attached: a page that swaps its <body> (pjax) drops the host.
  function mount() {
    if (!usable || !doc.body) return null;
    if (!ui) ui = build();
    if (ui.host.parentNode !== doc.body) doc.body.appendChild(ui.host);
    ui.launcher.hidden = !launcherShown;
    ui.wrap.setAttribute("data-launcher", launcherShown ? "on" : "off");
    return ui;
  }

  function pageIsDark() {
    if (config.theme !== "auto") return config.theme === "dark";
    for (const node of [doc.body, doc.documentElement]) {
      const dark = isDark(win.getComputedStyle(node).backgroundColor);
      if (dark !== null) return dark;
    }
    return false;
  }

  function openPanel() {
    if (!mount()) return;
    ui.wrap.setAttribute("data-theme", pageIsDark() ? "dark" : "light");
    ui.panel.hidden = false;
    ui.launcher.setAttribute("aria-expanded", "true");
    ui.input.focus();
  }

  function closePanel() {
    if (!ui) return;
    ui.panel.hidden = true;
    ui.launcher.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (ui && !ui.panel.hidden) closePanel(); else openPanel();
  }

  function show() { launcherShown = true; mount(); }
  function hide() { launcherShown = false; mount(); }

  function pageText() {
    let node = null;
    if (config.source) { try { node = doc.querySelector(config.source); } catch (e) { /* a bad selector falls back to the default */ } }
    node = node || doc.querySelector("main") || doc.querySelector('[role="main"]') || doc.body;
    const text = String(node.innerText || node.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return "Page title: " + doc.title + "\nPage URL: " + win.location.origin + pagePath(win.location) + "\n\n" + text;
  }

  function fail(code) { const e = new Error(code); e.code = code; return e; }

  async function request(body, onDelta) {
    let response;
    try {
      response = await win.fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { throw fail("network"); }
    if (!response.ok) {
      let code = "upstream";
      try { code = (await response.json()).error.code || code; } catch (e) { /* not our JSON: keep the generic code */ }
      throw fail(code);
    }
    const reader = response.body.getReader();
    const decoder = new win.TextDecoder();
    let buffer = "", text = "";
    try {
      for (;;) {
        const { done, value } = await reader.read().catch(() => { throw fail("network"); });
        if (done) throw fail("network");
        const parsed = parseSSE(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.error) throw fail(event.error.code || "upstream");
          if (event.done) return text;
          if (event.delta) { text += event.delta; onDelta(text); }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  function errorText(code) {
    if (code === "quota_exceeded") return strings.quota;
    if (code === "rate_limited") return strings.rate;
    if (code === "bad_key" || code === "domain_not_allowed") return strings.setup;
    return strings.fail;
  }

  async function submit() {
    const question = ui.input.value.trim();
    if (!question || busy) return;
    busy = true;
    ui.send.disabled = true;
    ui.input.value = "";
    const path = pagePath(win.location);
    if (historyPath !== path) { history = []; historyPath = path; }
    const add = (cls, text) => { const p = el("p", { class: "msg " + cls, text }); ui.log.appendChild(p); ui.log.scrollTop = ui.log.scrollHeight; return p; };
    add("me", question);
    const answer = add("ai wait", "···");
    try {
      const text = await request(buildBody(config, question, history, pageText()), (soFar) => {
        const pinned = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 40;
        answer.className = "msg ai";
        answer.textContent = soFar;
        if (pinned) ui.log.scrollTop = ui.log.scrollHeight;
      });
      if (!text) throw fail("upstream");
      history.push({ role: "user", content: question }, { role: "assistant", content: text });
      history = history.slice(-KEEP);
    } catch (e) {
      answer.className = "msg err";
      answer.textContent = errorText(e.code);
      if (win.console) win.console.warn("[OneTag AI widget] " + (e.code || e.message) + ". Error codes: " + HOME + "/docs#errors");
    } finally {
      busy = false;
      ui.send.disabled = false;
      ui.log.scrollTop = ui.log.scrollHeight;
    }
  }

  win.onetagWidget = {
    version: VERSION,
    open: openPanel,
    close: closePanel,
    toggle,
    show,   // show / hide the floating button; the panel is still opened with open() or toggle()
    hide,
    _internal: { readConfig, pickLang, pagePath, cut, buildBody, parseSSE, isDark, STRINGS, SYSTEM },
  };

  if (usable) {
    if (doc.body) mount();
    else doc.addEventListener("DOMContentLoaded", mount);
  }
})();
