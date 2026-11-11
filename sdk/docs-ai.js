/*! OneTag AI Docs AI | https://onetagai.com | MIT */
// One script tag adds three reader tools to a static documentation site:
//
//   <script async src="https://onetagai.com/docs-ai.js" data-key="YOUR_ONETAG_KEY" data-features="explain,summary,selection"></script>
//
// MkDocs and Zensical (mkdocs.yml):
//   extra_javascript:
//     - https://onetagai.com/docs-ai.js?key=YOUR_ONETAG_KEY&features=explain,summary,selection
//
// Every tool is off until it is named in `features`:
//
//   explain    an "Explain this code" button under every code block
//   summary    a "Summarize this page" button under the title of long pages
//   selection  select any text on the page, click "Ask AI", get it explained in context
//
// It knows where the content and the code blocks are in Material for MkDocs, Zensical,
// VitePress, Docusaurus and Starlight, and falls back to <main> and <pre> anywhere else.
// Nothing runs on a server of yours. Each tool sends the part of the page it is about,
// with the page around it, to OneTag AI when a reader clicks.
//
// Options, each a data-* attribute or a query parameter on the script URL:
//   key        your OneTag AI key (on localhost a shared demo key answers without one)
//   features   comma list of the tools to turn on: explain, summary, selection (default: none)
//   lang       language of the answers (default: the page's own language)
//   lines      smallest code block that gets a button, in lines (default 1)
//   chars      shortest page that gets a summary button, in characters (default 1500)
//   rules      extra instructions added to every request
//   preset     material, vitepress, docusaurus, starlight or generic (default: detected)
//   content    CSS selector of the content element, when it is not found on its own
//   code       CSS selector of code block wrappers, when they are not found on their own
//   color      accent colour as hex (default: the theme's own)
//   ref        a short name for the theme or plugin that adds this script; its requests are tagged docs-ai-<ref>
//              (default: the framework, as in docs-ai-vitepress)
//   endpoint   where requests are sent (default https://onetagai.com/v1/ask), for local testing
//   cache      off stops summaries being kept in the reader's browser (default: on)
// Every piece of interface lives in a shadow root, so the site's CSS and its own do not touch.
(function () {
  "use strict";
  const VERSION = "0.3.1";
  const HOME = "https://onetagai.com";
  const DEMO_KEY = "ot_demo000000000000000000000";  // answers on localhost only
  const MAX_TEXT = 32000;        // the server's limit on prompt + system + history + input
  const MAX_CODE = 12000;        // characters of one code block sent for an explanation
  const KEEP = 6;                // history messages sent with a follow-up
  const NAME = "data-onetag-docs-ai";
  const win = typeof window !== "undefined" ? window : globalThis;
  if (win.onetagDocsAi) return;  // loaded twice (instant navigation, two includes): the first one stays
  const doc = win.document;
  const script = doc.currentScript || (doc.querySelector && doc.querySelector('script[src*="/docs-ai.js"]'));

  const RULES = {
    explain: "You explain code samples in documentation to readers who are learning. Walk through what the code does, step by step, in plain words. Mention what they need to change before using it (placeholders, keys, paths). Use short paragraphs or a short list, under 180 words. Wrap identifiers and commands in backticks. No headings.",
    summary: "You summarize a documentation page for a reader deciding whether it answers their question. Give 3 to 5 bullets, each one line, with the concrete facts: what the page lets them do, the key steps, commands or options, and any warning. No intro, no heading, no closing line.",
    selection: "A reader selected part of a documentation page and wants it explained. Explain the selected text in the context of the page: what it means, why it matters here, and an example if that helps. Plain words, under 120 words, no headings. If they ask a follow-up, answer it from the page.",
  };
  const TOKENS = { explain: 600, summary: 400, selection: 400 };

  // Where things are in each docs framework. `content` is tried in order; `code` matches the
  // wrapper a theme puts around <pre>; `group` is a tab set that shows one wrapper at a time.
  const PRESETS = {
    material: { content: [".md-content__inner", ".md-content", '[role="main"]'], code: "div.highlight", group: "", file: ".filename" },
    vitepress: { content: [".vp-doc"], code: 'div[class*="language-"]', group: ".vp-code-group", file: "" },
    docusaurus: { content: [".theme-doc-markdown", "article .markdown"], code: ".theme-code-block", group: "", file: '[class*="codeBlockTitle"]' },
    starlight: { content: [".sl-markdown-content"], code: ".expressive-code", group: "", file: "figcaption .title" },
    generic: { content: ["main article", "article", "main", '[role="main"]'], code: "pre", group: "", file: "" },
  };
  const NOISE = "script, style, svg, button, .headerlink, .header-anchor, .hash-link, .sr-only, [" + NAME + "]";

  const STRINGS = {
    en: {
      explain: "Explain this code", summary: "Summarize this page", ask: "Ask AI",
      readingCode: "Reading the code…", readingPage: "Reading the page…",
      close: "Close", hide: "Hide", summaryTitle: "Summary", follow: "Ask a follow-up", send: "Ask",
      byExplain: "Explained by AI.", bySummary: "Summarized by AI from this page.", bySelection: "Explained by AI from this page.", powered: "Powered by OneTag AI",
      demo: "No key set: on localhost the answers come from a shared demo key. Add your own free OneTag AI key before you deploy.",
      no_key: "AI is not set up on this site yet: the site owner needs to add a OneTag AI key.",
      bad_key: "AI is not set up correctly on this site: its OneTag AI key is not valid here.",
      domain_not_allowed: "This site is not allowed to use its OneTag AI key.",
      quota_exceeded: "This site has used up its AI allowance for now.",
      paused: "The AI service is paused for today. Try again after 00:00 UTC.",
      rate_limited: "Too many requests in one minute. Give it a moment.",
      too_large: "That is too long to send in one request.",
      network: "Could not reach the AI service. Check your connection and try again.",
      fail: "No answer came back. Try again in a few seconds.",
    },
    "zh-Hans": {
      explain: "解释这段代码", summary: "总结本页", ask: "问 AI",
      readingCode: "正在读这段代码…", readingPage: "正在读这一页…",
      close: "关闭", hide: "收起", summaryTitle: "摘要", follow: "接着问", send: "提问",
      byExplain: "由 AI 解释。", bySummary: "由 AI 根据本页内容总结。", bySelection: "由 AI 根据本页内容解释。", powered: "由 OneTag AI 提供",
      demo: "还没有设置 key：在 localhost 上用的是共享的演示 key。上线前请换成你自己的免费 OneTag AI key。",
      no_key: "本站还没有配置好 AI：站长需要加上 OneTag AI key。",
      bad_key: "本站的 AI 配置有误：OneTag AI key 在这个地址上无效。",
      domain_not_allowed: "本站不在这个 OneTag AI key 允许的域名里。",
      quota_exceeded: "本站的 AI 额度暂时用完了。",
      paused: "AI 服务今天暂停了，请在 UTC 0 点之后再试。",
      rate_limited: "一分钟内请求太多，请稍等一下。",
      too_large: "内容太长，一次发不完。",
      network: "连不上 AI 服务，请检查网络后再试。",
      fail: "没有收到回答，请过几秒再试。",
    },
    "zh-Hant": {
      explain: "解釋這段程式碼", summary: "總結本頁", ask: "問 AI",
      readingCode: "正在讀這段程式碼…", readingPage: "正在讀這一頁…",
      close: "關閉", hide: "收起", summaryTitle: "摘要", follow: "接著問", send: "提問",
      byExplain: "由 AI 解釋。", bySummary: "由 AI 根據本頁內容總結。", bySelection: "由 AI 根據本頁內容解釋。", powered: "由 OneTag AI 提供",
      demo: "還沒有設定 key：在 localhost 上用的是共用的示範 key。上線前請換成你自己的免費 OneTag AI key。",
      no_key: "本站還沒有設定好 AI：站長需要加上 OneTag AI key。",
      bad_key: "本站的 AI 設定有誤：OneTag AI key 在這個網址上無效。",
      domain_not_allowed: "本站不在這個 OneTag AI key 允許的網域裡。",
      quota_exceeded: "本站的 AI 額度暫時用完了。",
      paused: "AI 服務今天暫停了，請在 UTC 0 點之後再試。",
      rate_limited: "一分鐘內請求太多，請稍等一下。",
      too_large: "內容太長，一次送不完。",
      network: "連不上 AI 服務，請檢查網路後再試。",
      fail: "沒有收到回答，請過幾秒再試。",
    },
  };

  // ---------------------------------------------------------------------------------------
  // Pure parts (tested in node)

  function pickLang(tag) {
    const t = String(tag || "").toLowerCase();
    if (!/^zh(-|_|$)/.test(t)) return "en";
    return /hant|tw|hk|mo/.test(t) ? "zh-Hant" : "zh-Hans";
  }

  // The language the model is asked to answer in, as an English name.
  function languageName(code) {
    const tag = String(code || "").trim() || "en";
    try { return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) || tag; } catch (e) { return tag; }
  }

  function isLocal(hostname) {
    return /^(|localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(String(hostname || ""));
  }

  // Options come from data-* on the script tag first, then from the script URL's query.
  function readConfig(dataset, src) {
    let url = null;
    try { url = new URL(src); } catch (e) { /* inline or relative without a base: attributes only */ }
    const get = (name) => String((dataset && dataset[name]) || (url && url.searchParams.get(name)) || "").trim();
    const count = (name, fallback) => { const n = parseInt(get(name), 10); return n >= 1 ? n : fallback; };
    const key = get("key");
    const ref = get("ref").toLowerCase();
    const color = get("color").replace(/^(?=[0-9a-f]{3,8}$)/i, "#");
    const preset = get("preset").toLowerCase();
    const wanted = get("features").toLowerCase().split(/[\s,]+/).filter((f) => f in RULES);
    const features = {};
    for (const f of Object.keys(RULES)) features[f] = wanted.includes(f);   // each one is off until it is named
    return {
      key: /^YOUR_|…|\.\.\./i.test(key) ? "" : key,   // a placeholder left in is no key
      ref: /^[a-z0-9][a-z0-9._-]{0,39}$/.test(ref) ? ref : "",
      endpoint: get("endpoint") || HOME + "/v1/ask",
      cache: !/^(off|false|0|no)$/i.test(get("cache")),
      features,
      lang: get("lang"),
      lines: count("lines", 1),
      chars: count("chars", 1500),
      rules: get("rules"),
      preset: preset in PRESETS ? preset : "",
      content: get("content"),
      code: get("code"),
      color: /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : "",
    };
  }

  // `generator` is every <meta name="generator"> joined; `has(selector)` asks the page.
  function detectPreset(generator, has) {
    const g = String(generator || "").toLowerCase();
    if (/starlight/.test(g)) return "starlight";
    if (/vitepress/.test(g)) return "vitepress";
    if (/docusaurus/.test(g)) return "docusaurus";
    if (/mkdocs|zensical/.test(g)) return "material";
    const marks = [["starlight", ".sl-markdown-content"], ["vitepress", ".vp-doc"], ["docusaurus", ".theme-doc-markdown"], ["material", ".md-content"]];
    for (const [name, selector] of marks) if (has(selector)) return name;
    return "generic";
  }

  // The name requests are counted under: docs-ai-<ref>, or docs-ai-<framework> when the page says
  // which one it is. The server takes at most 40 characters.
  function viaFor(ref, generator, presetName) {
    const g = String(generator || "").toLowerCase();
    const framework = ["zensical", "mkdocs", "vitepress", "docusaurus", "starlight"].find((name) => g.includes(name));
    const name = ref || framework || (presetName && presetName !== "generic" ? presetName : "");
    return ("docs-ai" + (name ? "-" + name : "")).slice(0, 40);
  }

  function codeLang(classes, dataLanguage) {
    if (dataLanguage) return String(dataLanguage);
    const m = String(classes || "").match(/(?:^|\s)(?:language|lang)-([^\s]+)/);
    return m ? m[1] : "";
  }

  // Cut to at most `budget` characters without splitting a surrogate pair.
  function cut(text, budget) {
    if (budget <= 0) return "";
    if (text.length <= budget) return text;
    const c = text.charCodeAt(budget - 1);
    return text.slice(0, c >= 0xd800 && c < 0xdc00 ? budget - 1 : budget);
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // A code block is recognised by its code alone. A copy button that writes "Copied!" next
  // to it, or a tab label that changes, is not a new block.
  function codeSign(texts) {
    const t = texts.join("\u0000");
    return t.length + ":" + hash(t);
  }

  // One summary is kept per page and language, in the reader's own browser. When the page
  // text changes its hash no longer matches, so the summary is asked for again and replaces
  // the old one.
  function cacheKey(path, language) { return "onetag-docs-ai:summary:" + path + ":" + language; }
  function cacheWrite(h, text) { return JSON.stringify({ h, t: text }); }
  function cacheRead(raw, h) {
    try {
      const kept = JSON.parse(raw || "null");
      return kept && kept.h === h && typeof kept.t === "string" ? kept.t : "";
    } catch (e) { return ""; }
  }

  function homeUrl(via) { return HOME + "/?ref=" + (via || "docs-ai"); }

  // Whether a batch of page changes can have added, moved or replaced content. Our own
  // widgets going in, and changes in another part of the page, are not worth another pass.
  function worthMount(records, root) {
    if (!root) return true;
    const ours = (n) => n.nodeType === 1 && n.hasAttribute(NAME);
    return Array.from(records).some((r) => {
      if (r.type !== "childList") return true;
      const added = Array.from(r.addedNodes || []);
      if (added.length && !(r.removedNodes || []).length && added.every(ours)) return false;
      return root.contains(r.target) || r.target.contains(root);
    });
  }

  // One request. `parts` are sent in order and the later ones give way when space runs out.
  function buildBody(config, key, feature, prompt, parts, history, note) {
    const system = RULES[feature] + (note ? " " + note : "") + (config.rules ? "\n\nSite rules: " + config.rules : "");
    const kept = (history || []).slice(-KEEP);
    let room = MAX_TEXT - prompt.length - system.length - kept.reduce((n, m) => n + 20 + m.content.length, 0) - 200;
    const input = [];
    for (const part of parts) {
      if (!part) continue;
      const text = cut(part, room);
      if (!text) break;
      input.push({ type: "text", text });
      room -= text.length;
    }
    const body = { key, prompt, system, max_tokens: TOKENS[feature], stream: true, via: config.via || viaFor(config.ref, "", "") };
    if (input.length) body.input = input;
    if (kept.length) body.history = kept;
    return body;
  }

  function explainBody(config, key, block, language) {
    const label = "Code" + (block.lang ? " (" + block.lang + ")" : "") + (block.file ? ", file " + block.file : "");
    return buildBody(config, key, "explain", "Explain this code to a reader of the docs. Answer in " + language + ".", [
      "Page: " + block.title,
      block.heading && "Section: " + block.heading,
      block.before && "Text before the code:\n" + block.before,
      label + ":\n" + cut(block.code, MAX_CODE),
    ]);
  }

  function summaryBody(config, key, page, language) {
    return buildBody(config, key, "summary", "Summarize this page. Answer in " + language + ".", ["Page: " + page.title, page.text]);
  }

  function selectionBody(config, key, picked, followUp, history, language) {
    const prompt = followUp || 'Explain the selected text: "' + picked.text + '". Answer in ' + language + ".";
    return buildBody(config, key, "selection", prompt, [
      "Page: " + picked.title,
      "Selected text: " + picked.text,
      "Where it appears: " + picked.paragraph,
      "The page:\n" + picked.page,
    ], history, "Answer in " + language + ".");   // a follow-up is the reader's own words, so the language is said here
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

  // A model answer as blocks: paragraphs, "- " lists and fenced code. Heading marks are dropped.
  function blocksOf(text) {
    const out = [];
    let list = null, pre = null;
    for (const line of String(text || "").replace(/\r/g, "").split("\n")) {
      if (pre) {
        if (/^\s*```/.test(line)) pre = null; else pre.lines.push(line);
        continue;
      }
      if (/^\s*```/.test(line)) { pre = { type: "pre", lines: [] }; out.push(pre); list = null; continue; }
      const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        if (!list) out.push((list = { type: "ul", items: [] }));
        list.items.push(item[1]);
        continue;
      }
      list = null;
      const t = line.replace(/^#+\s*/, "").trim();
      if (t) out.push({ type: "p", text: t });
    }
    return out.map((b) => (b.type === "pre" ? { type: "pre", text: b.lines.join("\n") } : b));
  }

  // ---------------------------------------------------------------------------------------
  // The page

  const config = readConfig(script && script.dataset, script && script.src);
  let presetName = "";
  let S = STRINGS.en;

  function preset() {
    if (!presetName) {
      const generators = Array.from(doc.querySelectorAll('meta[name="generator"]')).map((m) => m.getAttribute("content") || "").join(" ");
      presetName = config.preset || detectPreset(generators, (selector) => !!doc.querySelector(selector));
      config.via = viaFor(config.ref, generators, presetName);
    }
    return PRESETS[presetName];
  }

  function contentRoot() {
    const known = preset().content;   // every request starts from here, so the framework is known by then
    for (const selector of config.content ? [config.content] : known) {
      try { const node = doc.querySelector(selector); if (node) return node; } catch (e) { /* a bad selector finds nothing */ }
    }
    return null;
  }

  // Text of one element without anchors, buttons or our own interface.
  function clean(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(NOISE).forEach((n) => n.remove());
    return String(copy.textContent || "").replace(/[¶​]/g, "").replace(/\s+/g, " ").trim();
  }

  function pageTitle(root) {
    const h1 = (root && root.querySelector("h1")) || doc.querySelector("h1");
    return (h1 && clean(h1)) || doc.title || "";
  }

  function pageText(root, max) {
    return String(root.innerText || root.textContent || "").replace(/[¶​]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
  }

  function answerLanguage() {
    return languageName(config.lang || doc.documentElement.lang);
  }

  function activeKey() {
    return config.key || (isLocal(win.location.hostname) ? DEMO_KEY : "");
  }

  function fail(code) { const e = new Error(code); e.code = code; return e; }

  async function post(body, signal) {
    let response;
    try {
      response = await win.fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    } catch (e) { throw fail(signal && signal.aborted ? "aborted" : "network"); }
    if (!response.ok) {
      let code = "upstream";
      try { code = (await response.json()).error.code || code; } catch (e) { /* not our JSON: keep the generic code */ }
      throw fail(code);
    }
    return response;
  }

  async function request(body, onDelta, signal) {
    if (!body.key) throw fail("no_key");
    const response = await post(body, signal);
    const reader = response.body.getReader();
    const decoder = new win.TextDecoder();
    let buffer = "", text = "", finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read().catch(() => { throw fail(signal && signal.aborted ? "aborted" : "network"); });
        if (done) throw fail("network");
        const parsed = parseSSE(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.error) throw fail(event.error.code || "upstream");
          if (event.done) { finished = true; return text; }
          if (event.delta) { text += event.delta; onDelta(text); }
        }
      }
    } finally {
      if (!finished) reader.cancel().catch(() => {});   // after "done" the server closes the stream itself
    }
  }

  // ---------------------------------------------------------------------------------------
  // Interface

  const CSS = [
    ":host{display:block;margin:.6em 0 1.1em;--a:var(--onetag-accent,var(--md-typeset-a-color,var(--vp-c-brand-1,var(--ifm-color-primary,var(--sl-color-text-accent,LinkText)))));--line:rgba(128,128,128,.35);--soft:rgba(128,128,128,.09)}",
    "@supports (color:color-mix(in srgb,red,blue)){:host{--line:color-mix(in srgb,currentColor 22%,transparent);--soft:color-mix(in srgb,currentColor 5%,transparent)}}",
    "*{box-sizing:border-box}",
    "[hidden]{display:none!important}",
    "button{font:inherit;color:inherit;cursor:pointer}",
    ".btn{display:inline-flex;align-items:center;gap:.4em;font-size:.85em;line-height:1.5;padding:.25em .7em;border:1px solid var(--line);border-radius:.45em;background:var(--soft)}",
    ".btn:hover{border-color:var(--a);color:var(--a)}",
    ".btn:focus-visible,.link:focus-visible,input:focus-visible{outline:2px solid var(--a);outline-offset:2px}",
    ".btn svg{flex:none}",
    ".link{border:0;background:none;padding:0;color:var(--a);text-decoration:underline;text-underline-offset:3px}",
    ".panel{padding:.75em 1em;border:1px solid var(--line);border-inline-start:3px solid var(--a);border-radius:.45em;background:var(--soft);font-size:.92em;line-height:1.6}",
    ".title{margin:0 0 .4em;font-weight:600}",
    ".answer p{margin:0 0 .55em}",
    ".answer ul{margin:0 0 .55em;padding-inline-start:1.3em}",
    ".answer li{margin:.15em 0}",
    ".answer>:last-child{margin-bottom:0}",
    ".answer code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;padding:.1em .3em;border-radius:.3em;background:var(--soft)}",
    ".answer pre{margin:0 0 .55em;padding:.6em .8em;border-radius:.4em;background:var(--soft);overflow:auto;line-height:1.45}",
    ".answer pre code{padding:0;background:none}",
    ".status{margin:0;opacity:.75}",
    ".status:empty{display:none}",
    ".status.error{opacity:1;color:#e5484d}",
    ".note,.foot{margin:.6em 0 0;font-size:.85em;opacity:.7}",
    ".foot{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.2em 1.2em}",
    ".foot a{color:inherit;text-decoration:none}",
    ".foot a:hover{text-decoration:underline}",
    ".foot a:focus-visible{outline:2px solid var(--a);outline-offset:2px}",
    // On paper: an answer the reader opened stays, everything that is only a control goes.
    "@media print{:host(:not([data-open])){display:none!important}.btn,.link,.pill,.follow{display:none!important}}",
  ].join("");

  const FLOAT_CSS = [
    ":host{position:absolute;left:0;top:0;margin:0;z-index:1000}",
    ".pill{position:absolute;display:inline-flex;align-items:center;gap:.35em;white-space:nowrap;font-size:.85em;line-height:1.5;padding:.3em .75em;border:1px solid var(--a);border-radius:999px;background:var(--bg);color:var(--a);box-shadow:0 4px 14px rgba(0,0,0,.18)}",
    ".pill:hover{background:var(--a);color:var(--bg)}",
    ".card{position:absolute;width:min(28em,calc(100vw - 16px));padding:.9em 1em;border:1px solid var(--line);border-radius:.6em;background:var(--bg);box-shadow:0 10px 34px rgba(0,0,0,.24);font-size:.92em;line-height:1.6}",
    ".card:focus{outline:none}",
    ".quote{margin:0 0 .5em;font-style:italic;opacity:.75;overflow-wrap:anywhere}",
    ".follow{display:flex;gap:.4em;margin-top:.7em}",
    ".follow input{flex:1;min-width:0;font:inherit;font-size:.92em;color:inherit;padding:.3em .55em;border:1px solid var(--line);border-radius:.4em;background:transparent}",
  ].join("");

  function el(tag, attrs, children) {
    const node = doc.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children || []) if (c != null) node.append(c);
    return node;
  }

  function icon(path) {
    const s = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", "14"); s.setAttribute("height", "14"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    const p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linejoin", "round"); p.setAttribute("stroke-linecap", "round");
    p.setAttribute("d", path);
    s.append(p);
    return s;
  }
  const SPARK = "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z";
  const LINES = "M5 7h14M5 12h14M5 17h8";

  // A host element with a shadow root. Inherited styles (font, colour) come through; the
  // site's selectors do not.
  function makeHost(kind, extraCss) {
    const host = el("div", { [NAME]: kind });
    if (config.color) host.style.setProperty("--onetag-accent", config.color);
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", { text: CSS + (extraCss || "") }));
    return { host, root };
  }

  // Everything goes in as text nodes; nothing the model writes is parsed as HTML.
  function inline(text) {
    const out = [];
    for (const part of text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)) {
      if (!part) continue;
      if (part[0] === "`" && part.length > 2) out.push(el("code", { text: part.slice(1, -1) }));
      else if (part.slice(0, 2) === "**" && part.length > 4) out.push(el("strong", { text: part.slice(2, -2) }));
      else out.push(doc.createTextNode(part));
    }
    return out;
  }

  function render(target, text) {
    target.replaceChildren(...blocksOf(text).map((b) => {
      if (b.type === "pre") return el("pre", {}, [el("code", { text: b.text })]);
      if (b.type === "ul") return el("ul", {}, b.items.map((item) => el("li", {}, inline(item))));
      return el("p", {}, inline(b.text));
    }));
  }

  function errorText(e) { return S[e && e.code] || S.fail; }

  function demoNote() {
    return !config.key && isLocal(win.location.hostname) ? el("p", { class: "note", text: S.demo }) : null;
  }

  // The line under an opened answer: what it is, the way to close it, and where it comes from.
  function foot(text, closer) {
    preset();   // the link carries the name requests are counted under, so the framework has to be known
    return el("p", { class: "foot" }, [
      el("span", {}, [text + " ", closer]),
      el("a", { href: homeUrl(config.via), target: "_blank", rel: "noopener", text: S.powered }),
    ]);
  }

  // Widgets that may have a request in flight. When the page takes one away (navigation, a
  // rebuilt code block) its request is stopped: nobody is left to read the answer.
  const live = new Set();
  function sweep() {
    live.forEach((host) => {
      if (host.isConnected) return;
      host._stop();
      live.delete(host);
    });
  }

  // The selection card floats over the page, so navigation does not take it away by itself.
  // It has left its page when the address changed or the content element it read is gone.
  function leftPage(openedPath, path, rootConnected) {
    return openedPath !== path || !rootConnected;
  }
  let leaveSelection = null;   // set by setupSelection

  // Send one request and stream the answer into `answer`. Returns the text, or null when stopped.
  async function run(body, answer, status, reading, signal) {
    answer.replaceChildren();
    status.className = "status";
    status.textContent = reading;
    try {
      const text = await request(body, (sofar) => { status.textContent = ""; render(answer, sofar); }, signal);
      status.textContent = "";
      render(answer, text);
      return text;
    } catch (e) {
      if (e.code === "aborted" || (signal && signal.aborted)) return null;
      status.textContent = errorText(e);
      status.className = "status error";
      return null;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Explain this code

  // The code blocks of the page: the theme's wrappers (a tab group counts once), then any bare <pre>.
  function codeUnits(root) {
    const p = preset();
    const selector = config.code || p.code;
    const units = [];
    let wrappers = [];
    if (selector) { try { wrappers = Array.from(root.querySelectorAll(selector)); } catch (e) { /* a bad selector finds nothing */ } }
    for (const w of wrappers) {
      if (w.closest("[" + NAME + "]") || (w.parentElement && w.parentElement.closest(selector))) continue;
      const unit = (p.group && w.closest(p.group)) || w;
      if (!units.includes(unit)) units.push(unit);
    }
    const wrapped = units.slice();
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.classList.contains("mermaid") || pre.closest("[" + NAME + "]")) return;
      if (!wrapped.some((u) => u.contains(pre))) units.push(pre);
    });
    return units;
  }

  function readCode(unit) {
    const pres = unit.matches("pre") ? [unit] : Array.from(unit.querySelectorAll("pre")).filter((p) => !p.closest(".linenos, .linenodiv, .line-numbers-wrapper"));
    const pre = pres.find((p) => p.offsetParent !== null) || pres[0];
    if (!pre) return null;
    const inner = pre.querySelector("code");
    const wrapper = pre.closest('[class*="language-"]');
    const fileNode = preset().file ? unit.querySelector(preset().file) : null;
    return {
      code: String(pre.innerText || pre.textContent || "").replace(/\s+$/, "").replace(/^\n+/, ""),
      lang: codeLang([pre.className, inner && inner.className, wrapper && wrapper.className].join(" "), pre.getAttribute("data-language")),
      file: fileNode ? clean(fileNode) : "",
    };
  }

  // The heading a block sits under and the text just before it.
  function contextOf(unit, root) {
    let before = "";
    for (let n = unit; n && n !== root; n = n.parentElement) {
      for (let p = n.previousElementSibling; p; p = p.previousElementSibling) {
        if (p.hasAttribute(NAME)) continue;
        if (/^H[1-6]$/.test(p.tagName)) return { heading: clean(p), before };
        const inside = p.querySelectorAll("h1,h2,h3,h4,h5,h6");
        if (inside.length) return { heading: clean(inside[inside.length - 1]), before };
        if (!before && !p.matches("pre") && !p.querySelector("pre")) before = clean(p).slice(0, 1200);
      }
    }
    return { heading: "", before };
  }

  function signature(unit) {
    const pres = unit.matches("pre") ? [unit] : Array.from(unit.querySelectorAll("pre"));
    return codeSign(pres.map((pre) => (pre.querySelector("code") || pre).textContent || ""));
  }

  function explainHost(unit, root) {
    const { host, root: shadow } = makeHost("explain");
    host._sig = signature(unit);
    let controller = null;
    host._stop = () => { if (controller) controller.abort(); };
    const status = el("p", { class: "status", "aria-live": "polite" });
    const answer = el("div", { class: "answer" });
    const button = el("button", { type: "button", class: "btn", onclick: start }, [icon(SPARK), S.explain]);
    const close = el("button", { type: "button", class: "link", text: S.close, onclick: () => {
      if (controller) controller.abort();
      panel.hidden = true;
      button.hidden = false;
      host.removeAttribute("data-open");
      button.focus();
    } });
    const panel = el("div", { class: "panel", hidden: true }, [status, answer, demoNote(), foot(S.byExplain, close)]);
    shadow.append(button, panel);

    function start() {
      const found = readCode(unit);
      if (!found || !found.code) return;
      if (controller) controller.abort();
      controller = new win.AbortController();
      live.add(host);
      button.hidden = true;
      panel.hidden = false;
      host.setAttribute("data-open", "");
      const ctx = contextOf(unit, root);
      const body = explainBody(config, activeKey(), { title: pageTitle(root), heading: ctx.heading, before: ctx.before, code: found.code, lang: found.lang, file: found.file }, answerLanguage());
      run(body, answer, status, S.readingCode, controller.signal);
    }
    return host;
  }

  function mountExplain(root) {
    const units = codeUnits(root);
    root.querySelectorAll("[" + NAME + '="explain"]').forEach((host) => {
      const unit = host.previousElementSibling;
      if (unit && units.includes(unit) && host._sig === signature(unit)) return;
      host._stop();    // the code under it changed or went away
      host.remove();
    });
    for (const unit of units) {
      const next = unit.nextElementSibling;
      if (next && next.getAttribute(NAME) === "explain") continue;
      const found = readCode(unit);
      if (!found || !found.code || found.code.split("\n").length < config.lines) continue;
      unit.after(explainHost(unit, root));
    }
  }

  // ---------------------------------------------------------------------------------------
  // Summarize this page

  let tooShort = "";   // the page last found too short for a summary, so it is measured once

  function summaryHost(root, id) {
    const { host, root: shadow } = makeHost("summary");
    host._id = id;
    let controller = null, done = false;
    host._stop = () => { if (controller) controller.abort(); };
    const status = el("p", { class: "status", "aria-live": "polite" });
    const answer = el("div", { class: "answer" });
    const button = el("button", { type: "button", class: "btn", onclick: start }, [icon(LINES), S.summary]);
    const hide = el("button", { type: "button", class: "link", text: S.hide, onclick: () => {
      panel.hidden = true;
      button.hidden = false;
      host.removeAttribute("data-open");
      button.focus();
    } });
    const panel = el("div", { class: "panel", hidden: true }, [el("p", { class: "title", text: S.summaryTitle }), status, answer, demoNote(), foot(S.bySummary, hide)]);
    shadow.append(button, panel);

    async function start() {
      button.hidden = true;
      panel.hidden = false;
      host.setAttribute("data-open", "");
      if (done) return;
      const text = pageText(root, 28000);
      const store = cacheKey(win.location.pathname, answerLanguage()), sum = hash(text);
      let cached = "";
      if (config.cache) { try { cached = cacheRead(win.localStorage.getItem(store), sum); } catch (e) { /* storage is off: ask again */ } }
      if (cached) { render(answer, cached); done = true; return; }
      if (controller) controller.abort();
      controller = new win.AbortController();
      live.add(host);
      const out = await run(summaryBody(config, activeKey(), { title: pageTitle(root), text }, answerLanguage()), answer, status, S.readingPage, controller.signal);
      if (!out) return;
      done = true;
      if (config.cache) { try { win.localStorage.setItem(store, cacheWrite(sum, out)); } catch (e) { /* storage is off or full */ } }
    }
    return host;
  }

  function mountSummary(root) {
    const id = win.location.pathname + "|" + pageTitle(root);
    const old = root.querySelector("[" + NAME + '="summary"]');
    if (old) {
      if (old._id === id) return;
      old._stop();
      old.remove();   // same element, another page (client-side navigation)
    }
    if (tooShort === id) return;
    if (pageText(root, config.chars).length < config.chars) { tooShort = id; return; }
    const host = summaryHost(root, id);
    const h1 = root.querySelector("h1");
    if (!h1) root.prepend(host);
    else (h1.parentElement && h1.parentElement.tagName === "HEADER" && root.contains(h1.parentElement) ? h1.parentElement : h1).after(host);
  }

  // ---------------------------------------------------------------------------------------
  // Ask AI about a selection

  // The first opaque background behind the content, so the floating card is readable in any theme.
  function backgroundOf(node) {
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const c = win.getComputedStyle(n).backgroundColor || "";
      const m = c.match(/^rgba?\(([^)]+)\)$/);
      if (!m) { if (c && c !== "transparent") return c; continue; }
      const parts = m[1].split(/[,\s/]+/).filter(Boolean);
      if (parts.length < 4 || parseFloat(parts[3]) >= 0.99) return c;
    }
    return "Canvas";
  }

  function setupSelection() {
    const { host, root: shadow } = makeHost("selection", FLOAT_CSS);
    let picked = null, controller = null, history = [], timer = 0;
    const pill = el("button", { type: "button", class: "pill", hidden: true, onmousedown: (e) => e.preventDefault(), onclick: open }, [icon(SPARK), S.ask]);
    const quote = el("p", { class: "quote" });
    const status = el("p", { class: "status", "aria-live": "polite" });
    const answer = el("div", { class: "answer" });
    const field = el("input", { type: "text", maxlength: "300", placeholder: S.follow, "aria-label": S.follow });
    const form = el("form", { class: "follow", onsubmit: (e) => {
      e.preventDefault();
      const q = field.value.trim();
      if (!q) return;
      field.value = "";
      ask(q);
    } }, [field, el("button", { type: "submit", class: "btn", text: S.send })]);
    const close = el("button", { type: "button", class: "link", text: S.close, onclick: hideCard });
    const card = el("div", { class: "card", hidden: true, role: "dialog", "aria-label": S.ask, tabindex: "-1" }, [quote, status, answer, form, demoNote(), foot(S.bySelection, close)]);
    shadow.append(pill, card);

    function attach(root) {
      if (!host.isConnected) doc.body.append(host);
      const style = win.getComputedStyle(root);
      host.style.color = style.color;
      host.style.fontFamily = style.fontFamily;
      host.style.fontSize = style.fontSize;
      host.style.setProperty("--bg", backgroundOf(root));
    }

    function current() {
      const root = contentRoot();
      const sel = win.getSelection && win.getSelection();
      if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
      const text = sel.toString().trim();
      if (text.length < 2 || text.length > 2000) return null;
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const elm = node.nodeType === 1 ? node : node.parentElement;
      if (!elm || !root.contains(elm) || elm.closest("[" + NAME + "], input, textarea")) return null;
      const block = elm.closest("p, li, td, pre, blockquote, dd, h2, h3, h4") || elm;
      const rects = range.getClientRects();
      const rect = rects[rects.length - 1] || range.getBoundingClientRect();
      return { root, path: win.location.pathname, text, paragraph: String(block.textContent || "").trim().slice(0, 1500), rect };
    }

    function place(node, rect, below) {
      const base = host.getBoundingClientRect();   // the host sits at the page origin unless <body> is offset
      const width = node.offsetWidth;
      const left = Math.min(Math.max(8, rect.left), doc.documentElement.clientWidth - width - 8);
      node.style.left = left - base.left + "px";
      node.style.top = rect.bottom - base.top + below + "px";
    }

    function check() {
      win.clearTimeout(timer);
      timer = win.setTimeout(() => {
        if (!card.hidden) return;
        const s = current();
        if (!s) { pill.hidden = true; return; }
        picked = s;
        attach(s.root);
        pill.hidden = false;
        place(pill, s.rect, 6);
      }, 250);
    }

    function hideCard() {
      if (controller) controller.abort();
      card.hidden = true;
      pill.hidden = true;
      host.removeAttribute("data-open");
    }

    function open() {
      if (!picked) return;
      pill.hidden = true;
      history = [];
      quote.textContent = "“" + (picked.text.length > 160 ? picked.text.slice(0, 160) + "…" : picked.text) + "”";
      card.hidden = false;
      host.setAttribute("data-open", "");
      place(card, picked.rect, 10);
      card.focus({ preventScroll: true });   // Tab goes to the follow-up box next; the selection on the page stays
      ask("");
    }

    async function ask(followUp) {
      if (controller) controller.abort();
      controller = new win.AbortController();
      const body = selectionBody(config, activeKey(), { title: pageTitle(picked.root), text: picked.text, paragraph: picked.paragraph, page: pageText(picked.root, 12000) }, followUp, history, answerLanguage());
      const text = await run(body, answer, status, S.readingPage, controller.signal);
      if (!text) return;
      history.push({ role: "user", content: body.prompt }, { role: "assistant", content: text });
      history = history.slice(-KEEP);
    }

    leaveSelection = () => {
      if (!card.hidden && picked && leftPage(picked.path, win.location.pathname, picked.root.isConnected)) hideCard();
    };

    doc.addEventListener("selectionchange", check);
    doc.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      pill.hidden = true;
      if (!card.hidden) hideCard();
    });
    doc.addEventListener("mousedown", (e) => {
      if (!card.hidden && e.target !== host) hideCard();
    });
  }

  // ---------------------------------------------------------------------------------------
  // Start

  let late = false;   // Docusaurus: do not touch the content before React has hydrated it

  function mount() {
    if (preset() === PRESETS.docusaurus && !late && doc.documentElement.getAttribute("data-has-hydrated") !== "true") return;
    sweep();
    if (leaveSelection) leaveSelection();
    const root = contentRoot();
    if (!root) return;
    if (config.features.explain) mountExplain(root);
    if (config.features.summary) mountSummary(root);
  }

  function start() {
    if (!Object.keys(config.features).some((f) => config.features[f])) {
      if (win.console && win.console.warn) win.console.warn("OneTag AI docs-ai.js: no feature is turned on. Add features=explain,summary,selection (or only the ones you want) to the script URL, or data-features to the script tag.");
      return;
    }
    S = STRINGS[pickLang(config.lang || doc.documentElement.lang)];
    if (config.features.selection) setupSelection();
    const ready = () => {
      mount();
      win.setTimeout(() => { late = true; mount(); }, 3000);
    };
    if (doc.readyState === "complete") ready(); else win.addEventListener("load", ready);
    if (win.MutationObserver) {
      let queued = 0;
      const observer = new win.MutationObserver((records) => {
        if (queued || doc.readyState !== "complete" || !worthMount(records, contentRoot())) return;
        queued = win.setTimeout(() => { queued = 0; mount(); }, 120);   // client-side navigation swaps the content
      });
      observer.observe(doc.body, { childList: true, subtree: true });
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-has-hydrated"] });
    }
  }

  win.onetagDocsAi = {
    version: VERSION,
    mount,
    _internal: { readConfig, detectPreset, viaFor, codeSign, cacheKey, cacheRead, cacheWrite, homeUrl, worthMount, leftPage, codeLang, explainBody, summaryBody, selectionBody, buildBody, parseSSE, blocksOf, cut, hash, pickLang, isLocal, languageName, PRESETS, STRINGS, RULES, MAX_TEXT, DEMO_KEY },
  };

  if (doc.body) start();
  else if (doc.addEventListener) doc.addEventListener("DOMContentLoaded", start);
})();
