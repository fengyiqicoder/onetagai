/*! OneTag AI Ask Docs | https://onetagai.com/docs#ask-docs | MIT */
// One script tag gives a static documentation site an "Ask AI" box that answers from the
// site's own pages and links to the ones it used:
//
//   <script async src="https://onetagai.com/ask-docs.js" data-key="YOUR_ONETAG_KEY"></script>
//
// MkDocs (mkdocs.yml):
//   extra_javascript:
//     - https://onetagai.com/ask-docs.js?key=YOUR_ONETAG_KEY
//
// Nothing runs on a server of yours and nothing is crawled. When a reader asks a question,
// the browser reads the full-text index the site already publishes, picks the passages that
// match, and sends them with the question to OneTag AI. The index is found on its own:
//   - MkDocs and Material for MkDocs: search/search_index.json
//   - Zensical: search.json
//   - Pagefind (Starlight, Docusaurus with docusaurus-onetag, or any site built with
//     `npx pagefind --site <dir>`): pagefind/
//   - llms-full.txt
//   - none of these: the page the reader is on
//
// Every option can be a data-* attribute or a query parameter on the script URL. The box
// lives in a shadow root, so the site's CSS and its own do not touch. It does not need v1.js.
(function () {
  "use strict";
  const VERSION = "1.1.2";
  const HOME = "https://onetagai.com";
  const DEMO_KEY = "ot_demo000000000000000000000";  // answers on localhost only
  const MAX_TEXT = 32000;        // the server's limit on prompt + system + history + input
  const MAX_CONTEXT = 20000;     // characters of site text sent with one question
  const PER_ENTRY = 4000;        // characters kept from one page or section
  const TOP = 8;                 // passages retrieved for one question
  const MAX_TOKENS = 500;
  const KEEP = 6;                // history messages sent with each question
  const win = typeof window !== "undefined" ? window : globalThis;
  if (win.onetagAskDocs) return;  // loaded twice (instant navigation, two includes): the first one stays
  const doc = win.document;
  const script = doc.currentScript || (doc.querySelector && doc.querySelector('script[src*="/ask-docs.js"]'));

  const RULES = "You are the help desk for this documentation site. Answer only from the pages provided. When the pages cover the question, answer it directly and stop. Only when they do not, say so in one sentence and name the closest page. Under 150 words, no headings. Put commands, code and configuration in a fenced code block, copied the way the pages write them; never invent syntax the pages do not show, and never put ordinary sentences in a code block. Answer in the language of the question.";

  const STRINGS = {
    en: {
      label: "Ask AI", placeholder: "Ask a question about these docs", follow: "Ask a follow-up", ask: "Ask", close: "Close",
      intro: "Ask in your own words. The answer is written from the pages of this site and links to the ones it used.",
      reading: "Reading the docs…", sources: "Sources", matches: "Pages that match your question",
      scope: "Answers come only from the pages of this site.", reset: "Start over", powered: "Powered by OneTag AI",
      demo: "No key set: on localhost the answers come from a shared demo key. Add your own free OneTag AI key before you deploy.",
      no_key: "Ask AI is not set up on this site yet: the site owner needs to add a OneTag AI key to the ask-docs script.",
      bad_key: "Ask AI is not set up correctly on this site: its OneTag AI key is not valid here.",
      quota_exceeded: "This site has used up its AI allowance for now.",
      paused: "The AI service is paused for today. Try again after 00:00 UTC.",
      rate_limited: "Too many questions in one minute. Give it a moment.",
      too_large: "That question is too long.",
      network: "Could not reach the AI service. Check your connection and try again.",
      fail: "No answer came back. Try again in a few seconds.",
    },
    "zh-Hans": {
      label: "问 AI", placeholder: "就这份文档提一个问题", follow: "接着问", ask: "提问", close: "关闭",
      intro: "用自己的话提问。回答只根据本站的页面写成，并附上用到的页面链接。",
      reading: "正在查阅文档…", sources: "来源", matches: "和问题相关的页面",
      scope: "回答只来自本站的页面。", reset: "重新开始", powered: "由 OneTag AI 提供",
      demo: "还没有设置 key：在 localhost 上用的是共享的演示 key。上线前请换成你自己的免费 OneTag AI key。",
      no_key: "本站还没有配置好问 AI：站长需要给 ask-docs 脚本加上 OneTag AI key。",
      bad_key: "本站的问 AI 配置有误：OneTag AI key 在这个地址上无效。",
      quota_exceeded: "本站的 AI 额度暂时用完了。",
      paused: "AI 服务今天暂停了，请在 UTC 0 点之后再试。",
      rate_limited: "一分钟内提问太多，请稍等一下。",
      too_large: "这个问题太长了。",
      network: "连不上 AI 服务，请检查网络后再试。",
      fail: "没有收到回答，请过几秒再试。",
    },
    "zh-Hant": {
      label: "問 AI", placeholder: "就這份文件提一個問題", follow: "接著問", ask: "提問", close: "關閉",
      intro: "用自己的話提問。回答只根據本站的頁面寫成，並附上用到的頁面連結。",
      reading: "正在查閱文件…", sources: "來源", matches: "和問題相關的頁面",
      scope: "回答只來自本站的頁面。", reset: "重新開始", powered: "由 OneTag AI 提供",
      demo: "還沒有設定 key：在 localhost 上用的是共用的示範 key。上線前請換成你自己的免費 OneTag AI key。",
      no_key: "本站還沒有設定好問 AI：站長需要給 ask-docs 腳本加上 OneTag AI key。",
      bad_key: "本站的問 AI 設定有誤：OneTag AI key 在這個網址上無效。",
      quota_exceeded: "本站的 AI 額度暫時用完了。",
      paused: "AI 服務今天暫停了，請在 UTC 0 點之後再試。",
      rate_limited: "一分鐘內提問太多，請稍等一下。",
      too_large: "這個問題太長了。",
      network: "連不上 AI 服務，請檢查網路後再試。",
      fail: "沒有收到回答，請過幾秒再試。",
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
    const position = get("position");
    const key = get("key");
    return {
      key: /^YOUR_|…|\.\.\./i.test(key) ? "" : key,   // a placeholder left in is no key
      ref: /^[a-z0-9][a-z0-9._-]{0,39}$/.test(ref) ? ref : "",
      endpoint: get("endpoint") || (own ? url.origin : HOME) + "/v1/ask",
      index: get("index"),          // where the index is, when it is not found on its own
      label: get("label"),
      placeholder: get("placeholder"),
      rules: get("rules"),
      button: get("button"),        // CSS selector of your own element(s) that open the box
      position: /^(float|left|none)$/.test(position) ? position : "auto",
      color: /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : "",
      theme: theme === "light" || theme === "dark" ? theme : "auto",
      lang: get("lang"),
    };
  }

  function isLocal(hostname) {
    return /^(|localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(String(hostname || ""));
  }

  // ---------------------------------------------------------------------------------------
  // Text

  // Cut to at most `budget` characters without splitting a surrogate pair.
  function cut(text, budget) {
    if (budget <= 0) return "";
    if (text.length <= budget) return text;
    const c = text.charCodeAt(budget - 1);
    return text.slice(0, c >= 0xd800 && c < 0xdc00 ? budget - 1 : budget);
  }

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  // Index text that is HTML (Material for MkDocs keeps the markup) as plain text.
  function stripHtml(html) {
    return String(html || "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      // Code keeps its line breaks and indentation (YAML and Python mean something by them): they are
      // set aside as control characters while the rest is tidied, and put back at the end.
      .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (m, code) => "\n" + code.replace(/\s+(<\/code>\s*)?$/i, "").replace(/ /g, "\u0001").replace(/\t/g, "\u0003").replace(/\n/g, "\u0002") + "\n")
      .replace(/<\/(p|div|li|tr|pre|h[1-6]|blockquote|table|dd|dt)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
        if (name[0] !== "#") return ENTITIES[name.toLowerCase()] || m;
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        try { return String.fromCodePoint(code); } catch (e) { return m; }
      })
      .replace(/[ \t\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      .replace(/\u0001/g, " ").replace(/\u0003/g, "\t").replace(/\u0002/g, "\n");
  }

  const STOP = new Set(("a about an and any are as at be by can could do does for from get have how i if in into is it its me my " +
    "of on or our should site that the their there these this to use using want we what when where which who why will with you your").split(" "));
  const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
  const CJK_RUNS = /([぀-ヿ㐀-䶿一-鿿가-힯]+)/;

  // "installing" and "installed" should find "install"; matching is by word prefix, so the
  // stem only has to be a common beginning.
  function stem(word) {
    if (!/^[a-z]+$/.test(word)) return word;
    if (word.length > 6 && word.endsWith("ing")) return word.slice(0, -3);
    if (word.length > 6 && word.endsWith("ed")) return word.slice(0, -2);
    if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3);
    if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
  }

  // What to search for in a question: its words without the filler (stemmed), names like
  // mkdocs.yml kept whole and also split, and every pair of neighbouring characters of
  // Chinese, Japanese and Korean text, which has no spaces to split on.
  // Each term is { t: what to find, raw: the word as typed, word: match at a word start }.
  function queryTerms(question) {
    const out = [];
    const seen = new Set();
    const add = (t, raw, word) => { if (t && !seen.has(t)) { seen.add(t); out.push({ t, raw, word }); } };
    const tokens = String(question || "").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_.'’-]*/gu) || [];
    for (const token of tokens) {
      for (const piece of token.split(CJK_RUNS)) {
        if (!piece) continue;
        if (CJK.test(piece[0])) {
          for (let i = 0; i + 1 < piece.length; i++) add(piece.slice(i, i + 2), piece, false);
          continue;
        }
        const name = piece.replace(/^[_.'’-]+|[_.'’-]+$/g, "");
        if (name.length < 2 || STOP.has(name)) continue;
        add(stem(name), name, true);
        if (/[_.'’-]/.test(name)) {
          for (const part of name.split(/[_.'’-]+/)) if (part.length > 2 && !STOP.has(part)) add(stem(part), part, true);
        }
      }
    }
    return out.slice(0, 24);
  }

  function isWordChar(ch) { return !!ch && /[\p{L}\p{N}]/u.test(ch); }

  // How many times `term` is in `hay` (both lower case), up to 32, and where the first one is.
  function count(hay, term) {
    let n = 0, first = -1, i = 0;
    while ((i = hay.indexOf(term.t, i)) !== -1) {
      if (!term.word || i === 0 || !isWordChar(hay[i - 1])) {
        if (first < 0) first = i;
        if (++n >= 32) break;
      }
      i += term.t.length;
    }
    return { n, first };
  }

  // ---------------------------------------------------------------------------------------
  // A full-text index held in the page: entries are { url, title, text }, ranked by BM25
  // with the title counting three times, and a bonus for matching more of the question.
  function makeIndex(entries) {
    // An entry without text has nothing to answer from. A section's title is "Page › Section":
    // a word in the section's own name counts three times, one in the page's name once, or every
    // section of a page called "Limits and cost" would look like the answer to a question about cost.
    const items = entries.filter((e) => e && e.text).map((e) => {
      const full = String(e.title || "").toLowerCase();
      const at = full.lastIndexOf(" › ");
      return { entry: e, title: at < 0 ? full : full.slice(at + 3), crumb: at < 0 ? "" : full.slice(0, at), text: String(e.text).toLowerCase() };
    });
    const avg = items.reduce((n, it) => n + it.text.length, 0) / (items.length || 1) || 1;
    function search(terms, limit) {
      const N = items.length;
      const score = new Float64Array(N), matched = new Uint8Array(N);
      for (const term of terms) {
        const found = [];
        for (let i = 0; i < N; i++) {
          const tf = count(items[i].text, term).n + 3 * count(items[i].title, term).n + count(items[i].crumb, term).n;
          if (tf) found.push([i, tf]);
        }
        if (!found.length) continue;
        const idf = Math.log(1 + (N - found.length + 0.5) / (found.length + 0.5));
        for (const [i, tf] of found) {
          score[i] += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * items[i].text.length / avg));
          matched[i]++;
        }
      }
      const hits = [];
      for (let i = 0; i < N; i++) if (score[i] > 0) hits.push({ entry: items[i].entry, score: score[i] * (1 + matched[i] / terms.length) });
      return hits.sort((a, b) => b.score - a.score).slice(0, limit || TOP).map((h) => h.entry);
    }
    // What the docs are written in: the share of entries with Chinese, Japanese or Korean text,
    // and a few of the titles.
    const cjk = items.filter((it) => CJK.test(it.text)).length / (items.length || 1);
    const sample = cut(items.slice(0, 6).map((it) => String(it.entry.title || "")).filter(Boolean).join(" / "), 200);
    return { size: items.length, search, cjk, sample };
  }

  // The part of a long text around the first place a term is found.
  function focus(text, terms, room) {
    if (text.length <= room) return text;
    const lower = text.toLowerCase();
    let first = -1;
    for (const term of terms) {
      const at = count(lower, term).first;
      if (at >= 0 && (first < 0 || at < first)) first = at;
    }
    let start = Math.max(0, Math.min(first - 300, text.length - room));
    if (start > 0) { const nl = text.lastIndexOf("\n", start + 200); if (nl > start - 200 && nl >= 0) start = nl + 1; }
    return start > 0 ? "…" + cut(text.slice(start), room - 1) : cut(text, room);
  }

  // MkDocs search index → entries. Each doc is { location, title, text }: a page, or a
  // section of one ("guide/#install"). The built-in search plugin repeats the whole page
  // in the page's own doc; where the sections already hold that text, the page doc is
  // kept for its title only.
  function mkdocsEntries(docs, base) {
    const pages = new Map();
    const entries = [];
    for (const d of docs || []) {
      if (!d || typeof d.location !== "string") continue;
      const path = d.location.split("#")[0];
      const page = pages.get(path) || { title: "", own: null, sections: 0, longest: "" };
      pages.set(path, page);
      // "¶" is the permalink mark the built-in search plugin leaves after every heading.
      const entry = { location: d.location, path, title: stripHtml(d.title), text: stripHtml(d.text).replace(/ ?¶/g, ""), url: "" };
      try { entry.url = new URL(d.location, base).href; } catch (e) { /* no link for this one */ }
      if (d.location === path) { page.title = entry.title; page.own = entry; }
      else { page.sections += entry.text.length; if (entry.text.length > page.longest.length) page.longest = entry.text; }
      entries.push(entry);
    }
    // The built-in search plugin repeats the whole page in the page's own entry; Material keeps
    // only what stands before the first heading there. The copy is dropped, the opening is kept.
    const squash = (t) => t.replace(/\s+/g, " ");
    for (const page of pages.values()) {
      if (!page.own || !page.sections || page.own.text.length < 0.9 * page.sections) continue;
      if (squash(page.own.text).includes(squash(page.longest).slice(0, 80))) page.own.text = "";
    }
    for (const e of entries) {
      const pageTitle = pages.get(e.path).title;
      if (e.location !== e.path && pageTitle && pageTitle !== e.title) e.title = pageTitle + " › " + e.title;
    }
    return entries.map((e) => ({ url: e.url, title: e.title, text: e.text }));
  }

  // llms-full.txt → entries: one per "# " or "## " heading outside code fences, long ones
  // split at paragraph breaks. A "Source: https://…" or "URL: …" line right under a heading
  // becomes the link; without one the entry has a title only.
  function llmsEntries(text, max) {
    const size = max || 6000;
    const entries = [];
    let h1 = "", cur = null, fenced = false;
    const flush = () => {
      if (!cur) return;
      const body = cur.lines.join("\n").trim();
      if (body) {
        let rest = body;
        while (rest.length > size) {
          let at = rest.lastIndexOf("\n\n", size);
          if (at < size / 2) at = size;
          entries.push({ url: cur.url, title: cur.title, text: rest.slice(0, at).trim() });
          rest = rest.slice(at).trim();
        }
        if (rest) entries.push({ url: cur.url, title: cur.title, text: rest });
      }
      cur = null;
    };
    for (const line of String(text || "").split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      const h = fenced ? null : /^(#{1,2})\s+(.+?)\s*#*$/.exec(line);
      if (h) {
        flush();
        if (h[1].length === 1) h1 = h[2];
        cur = { title: h[1].length === 1 || !h1 ? h[2] : h1 + " › " + h[2], url: "", lines: [], fresh: 0 };
        continue;
      }
      if (!cur) cur = { title: h1 || "", url: "", lines: [], fresh: 0 };
      if (!cur.url && cur.fresh < 4) {
        const m = /^\s*(?:source|url|link)\s*:\s*(https?:\/\/\S+)/i.exec(line);
        if (m) { cur.url = m[1]; continue; }
        if (line.trim()) cur.fresh++;
      }
      cur.lines.push(line);
    }
    flush();
    return entries;
  }

  // Folders from the page's own up to the site root, nearest first.
  function ancestors(href, max) {
    const out = [];
    try {
      const u = new URL(href);
      if (!/^https?:$/.test(u.protocol)) return out;
      const parts = u.pathname.split("/");
      parts.pop();
      while (parts.length && out.length < (max || 6)) { out.push(u.origin + parts.join("/") + "/"); parts.pop(); }
    } catch (e) { /* not a URL: nowhere to look */ }
    return out;
  }

  // Entries → the passages sent with the question, within `budget` characters in all.
  function toPages(hits, terms, budget) {
    const pages = [];
    let room = budget;
    for (const h of hits) {
      if (room < 200) break;
      const text = focus(String(h.text || ""), terms, Math.min(PER_ENTRY, room));
      if (!text) continue;
      pages.push({ title: h.title || h.url || "", url: h.url || "", text });
      room -= text.length + String(h.title || "").length + String(h.url || "").length + 12;
    }
    return pages;
  }

  // Up to three different pages to show under the answer (two sections of one page count once).
  function sourcesOf(pages) {
    const seen = new Set();
    const out = [];
    for (const p of pages) {
      const page = String(p.url || p.title).split("#")[0];
      if (!p.title || seen.has(page)) continue;
      seen.add(page);
      out.push({ title: p.title, url: p.url });
      if (out.length === 3) break;
    }
    return out;
  }

  // The request for one question. The passages take the room the question, the rules and
  // the history leave (20 per history message is the server's allowance for its framing);
  // the oldest turns go first when the room runs out.
  function buildBody(config, key, question, history, pages, via) {
    const system = config.rules || RULES;
    const prompt = question + "\n\n(Reply in the same language as the question above.)";
    let kept = history.slice(-KEEP);
    const room = () => MAX_TEXT - prompt.length - system.length - kept.reduce((n, m) => n + 20 + m.content.length, 0);
    while (kept.length && room() < 6000) kept = kept.slice(2);
    const body = { key, prompt, system, max_tokens: MAX_TOKENS, stream: true, via: config.ref || via || "ask-docs" };
    let budget = Math.min(MAX_CONTEXT, room() - 200);
    const input = [];
    for (const p of pages) {
      const text = cut("Page: " + p.title + (p.url ? " (" + p.url + ")" : "") + "\n" + p.text, budget);
      if (!text) break;
      input.push({ type: "text", text });
      budget -= text.length;
    }
    if (input.length) body.input = input;
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

  // Text as spans: plain text, `code`, **bold** and [links](url).
  function spansOf(body) {
    const spans = [];
    const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(body))) {
      if (m.index > last) spans.push({ text: body.slice(last, m.index) });
      if (m[1] !== undefined) spans.push({ code: m[1] });
      else if (m[2] !== undefined) spans.push({ bold: m[2] });
      else spans.push({ link: m[3], href: m[4] });
      last = re.lastIndex;
    }
    if (last < body.length) spans.push({ text: body.slice(last) });
    return spans;
  }

  // "| a | `b|c` | d \| e |" -> ["a", "`b|c`", "d | e"]: a bar inside code or after a backslash is not a border.
  function tableCells(line) {
    const body = line.trim().replace(/^\|/, "");
    const cells = [];
    let cur = "", code = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "\\" && body[i + 1] === "|") { cur += "|"; i++; }
      else if (c === "|" && !code) { cells.push(cur.trim()); cur = ""; }
      else { if (c === "`") code = !code; cur += c; }
    }
    if (cur.trim()) cells.push(cur.trim());
    return cells;
  }

  // The answer as blocks: { code } for a fenced block (an unclosed one while the answer is
  // still streaming counts), { table } for a Markdown table (rows of cells of spans, the
  // header first; the model repeats tables it finds in the docs), { spans } for a paragraph.
  function parseAnswer(text) {
    const blocks = [];
    const parts = String(text || "").split(/^[ \t]*```[^\n]*$/m);
    parts.forEach((part, i) => {
      if (i % 2) { const code = part.replace(/^\n|\n$/g, ""); if (code) blocks.push({ code }); return; }
      for (const para of part.split(/\n{2,}/)) {
        const lines = para.split("\n");
        let prose = [];
        const flush = () => { const body = prose.join("\n").trim(); if (body) blocks.push({ spans: spansOf(body) }); prose = []; };
        for (let n = 0; n < lines.length; n++) {
          // a header row, then the rule under it: | --- | :-: |
          if (/^\s*\|/.test(lines[n]) && /^\s*\|[\s|:-]*-[\s|:-]*$/.test(lines[n + 1] || "")) {
            flush();
            const rows = [tableCells(lines[n])];
            for (n += 2; n < lines.length && /^\s*\|/.test(lines[n]); n++) rows.push(tableCells(lines[n]));
            n--;
            blocks.push({ table: rows.map((row) => row.map(spansOf)) });
          } else prose.push(lines[n]);
        }
        flush();
      }
    });
    return blocks;
  }

  // true/false for an rgb()/rgba() colour, null when it is transparent or in a form we do not read.
  function isDark(color) {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(String(color || "").trim());
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha < 0.5) return null;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.5;
  }

  // ---------------------------------------------------------------------------------------
  // Finding and loading the site's index

  const config = readConfig(script && script.dataset, script && script.src);
  const strings = STRINGS[pickLang(config.lang || (doc.documentElement && doc.documentElement.lang) || (win.navigator && win.navigator.language))];
  const local = isLocal(win.location && win.location.hostname);
  const key = config.key || (local ? DEMO_KEY : "");

  // What the page itself says about where the site starts. Read once, when the script
  // loads: a theme with instant navigation changes the address later, not these values.
  let hints = null;
  function readHints() {
    const out = { mkdocs: "", pagefind: "", generator: "" };
    try {
      const here = win.location.href;
      const meta = doc.querySelector('meta[name="generator"]');
      out.generator = String((meta && meta.content) || "").toLowerCase();
      let base = typeof win.base_url === "string" ? win.base_url : "";          // mkdocs and readthedocs themes
      const cfg = doc.getElementById("__config");                               // Material for MkDocs
      if (!base && cfg) { try { base = String(JSON.parse(cfg.textContent).base || ""); } catch (e) { /* not JSON */ } }
      if (base) out.mkdocs = new URL(base.replace(/\/*$/, "/"), here).href;
      const pf = doc.querySelector('script[src*="/pagefind/"],link[href*="/pagefind/"]');
      if (pf) { const u = new URL(pf.src || pf.href, here).href; out.pagefind = u.slice(0, u.indexOf("/pagefind/") + 1); }
    } catch (e) { /* no hints: the index is looked for folder by folder */ }
    return out;
  }

  async function getJson(url) {
    const r = await win.fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function localSearch(kind, base, entries) {
    const index = makeIndex(entries);
    if (!index.size) throw new Error("empty index");
    // The opening of a page: its own entry, or its first section when that entry is empty.
    const intros = new Map();
    for (const e of entries) {
      const page = e && e.text ? String(e.url || "").split("#")[0] : "";
      if (page && !intros.has(page)) intros.set(page, e);
    }
    return { kind, base, cjk: index.cjk, sample: index.sample, search: async (terms) => withIntros(index.search(terms, TOP), intros) };
  }

  // A section often leans on what its page says first (how the options are passed, where a
  // command is run), so the opening of the page comes along with each of the three best sections.
  function withIntros(hits, intros) {
    const out = hits.slice();
    for (const h of hits.slice(0, 3)) {
      const url = String(h.url || "");
      const intro = url.includes("#") && intros.get(url.split("#")[0]);
      if (intro && !out.includes(intro)) out.splice(out.indexOf(h) + 1, 0, intro);
    }
    return out;
  }

  async function loadMkdocs(base, url) {
    // MkDocs writes search/search_index.json with "docs"; Zensical writes search.json with "items".
    const json = url ? await getJson(url) : await getJson(base + "search/search_index.json").catch(() => getJson(base + "search.json"));
    const docs = json && (Array.isArray(json.docs) ? json.docs : json.items);
    if (!Array.isArray(docs)) throw new Error("not a MkDocs index");
    return localSearch("mkdocs", base, mkdocsEntries(docs, base));
  }

  async function loadLlms(base, url) {
    const r = await win.fetch(url || base + "llms-full.txt");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const type = r.headers.get("content-type") || "";
    const text = await r.text();
    // A host that answers every unknown address with its home page is not an llms-full.txt.
    if (/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text) || text.trim().length < 200) throw new Error("not llms-full.txt");
    if (text.length <= MAX_CONTEXT) return { kind: "llms", base, whole: true, search: async () => [{ url: "", title: "", text, whole: true }] };
    return localSearch("llms", base, llmsEntries(text));
  }

  async function probePagefind(base) {
    const entry = await getJson(base + "pagefind/pagefind-entry.json");
    if (!entry || !entry.languages) throw new Error("not a Pagefind index");
    return base;
  }

  // Pagefind matches every word of a query, so a whole question finds nothing: the words
  // are searched one by one and pages are ranked by how many of them they match.
  async function loadPagefind(base) {
    const pf = await import(base + "pagefind/pagefind.js");
    await pf.init();
    async function search(terms) {
      const words = [...new Set(terms.map((t) => t.raw))].slice(0, 8);
      const searches = await Promise.all(words.map((w) => pf.search(w).catch(() => ({ results: [] }))));
      const scores = new Map();
      for (const s of searches) {
        ((s && s.results) || []).slice(0, 10).forEach((r, rank) => {
          const cur = scores.get(r.id) || { score: 0, result: r };
          cur.score += 1 + Math.max(0, 10 - rank) / 20 + (r.score || 0) / 100;
          scores.set(r.id, cur);
        });
      }
      const top = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 5);
      const hits = await Promise.all(top.map((t) => t.result.data()));
      return hits.map((h) => ({ url: new URL(h.url, win.location.href).href, title: String((h.meta && h.meta.title) || h.url).replace(/ ?¶$/, ""), text: h.content || stripHtml(h.excerpt) }));
    }
    return { kind: "pagefind", base, search };
  }

  // The nearest folder for which `load` works.
  async function nearest(bases, load) {
    const tries = bases.map((b) => load(b).catch(() => null));
    for (const t of tries) { const got = await t; if (got) return got; }
    return null;
  }

  const PAGE = { kind: "page", base: "", search: null };

  async function findIndex() {
    const here = win.location.href;
    const h = hints || (hints = readHints());
    if (config.index) {
      try {
        const url = new URL(config.index, here).href;
        if (/\.json(\?|$)/.test(url)) return await loadMkdocs(new URL(/search_index\.json/.test(url) ? "../" : "./", url).href, url);
        if (/\.txt(\?|$)/.test(url)) return await loadLlms(new URL("./", url).href, url);
        return await loadPagefind(url.replace(/\/?(pagefind\/?)?$/, "/"));
      } catch (e) {
        if (win.console) win.console.warn("[OneTag AI Ask Docs] The index at " + config.index + " could not be loaded (" + e.message + "). Answering from the current page.");
        return PAGE;
      }
    }
    if (h.mkdocs) { const got = await loadMkdocs(h.mkdocs).catch(() => null); if (got) return got; }
    if (h.pagefind) { const got = await loadPagefind(h.pagefind).catch(() => null); if (got) return got; }
    const bases = ancestors(here, 6);
    if (!h.mkdocs && /mkdocs|zensical/.test(h.generator)) { const got = await nearest(bases, (b) => loadMkdocs(b)); if (got) return got; }
    const pfBase = await nearest(bases.filter((b) => b !== h.pagefind), probePagefind);
    if (pfBase) { const got = await loadPagefind(pfBase).catch(() => null); if (got) return got; }
    return (await nearest(bases, (b) => loadLlms(b))) || PAGE;
  }

  let indexPromise = null;
  function getIndex() {
    if (!indexPromise) {
      indexPromise = findIndex();
      indexPromise.catch(() => { indexPromise = null; });   // tried again with the next question
    }
    return indexPromise;
  }

  function pageText() {
    const node = doc.querySelector("main") || doc.querySelector('[role="main"]') || doc.querySelector("article") || doc.body;
    return String(node.innerText || node.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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

  // A question that matches nothing as typed (another language than the docs, or other
  // words than the docs use) is turned into search keywords by one short call.
  async function rewrite(question, previous, index, signal) {
    const lang = (doc.documentElement && doc.documentElement.lang) || "en";
    // The titles say what language the docs are in more reliably than the page's lang attribute,
    // which many sites leave at "en".
    const site = index.sample ? "whose page titles include: " + index.sample : "written in the language with the code \"" + lang + "\"";
    const response = await post({
      key, prompt: previous ? "Earlier question: " + previous + "\nQuestion now: " + question : question,
      max_tokens: 40, via: config.ref || "ask-docs-" + index.kind,
      system: "Turn the reader's question into search keywords for a documentation site " + site + ". Reply with three to six keywords for the question asked now, in the language of that site (which may not be the language of the question), lower case, separated by spaces, and nothing else.",
    }, signal);
    return String((await response.json()).text || "");
  }

  // The passages for a question: { pages, sources, kind }.
  async function retrieve(question, previous, signal) {
    const index = await getIndex().catch(() => PAGE);
    const here = () => ({ kind: index.kind, base: "", sources: [], pages: [{ title: doc.title, url: win.location.href, text: cut(pageText(), MAX_CONTEXT) }] });
    if (!index.search) return here();
    const own = queryTerms(question);
    // "And on Windows?" needs the question before it. A word counts as one; Chinese, Japanese
    // and Korean are matched by pairs of characters, and two pairs say about as much as a word.
    const short = !!previous && own.reduce((n, t) => n + (t.word ? 1 : 0.5), 0) < 3;
    let terms = short ? queryTerms(question + " " + previous) : own;
    // A question in Chinese, Japanese or Korean on docs that are not: its words cannot match the
    // pages (at most a stray quote of them), so it is turned into keywords before searching.
    const foreign = index.cjk < 0.05 && own.filter((t) => !t.word).length * 2 > own.length;
    let hits = index.whole || (terms.length && !foreign) ? await index.search(terms) : [];
    if (!hits.length) {
      const words = key ? await rewrite(question, short ? previous : "", index, signal).catch((e) => { if (e.code === "aborted") throw e; return ""; }) : "";
      const again = queryTerms(words);
      if (again.length) terms = foreign ? again.concat(own.filter((t) => t.word)) : again;   // names typed in Latin letters stay
      if (again.length || foreign) hits = await index.search(terms);
    }
    if (!hits.length) return here();
    if (hits[0].whole) return { kind: index.kind, base: index.base, sources: [], pages: [{ title: "All pages of this site", url: "", text: hits[0].text }] };
    const pages = toPages(hits, terms, MAX_CONTEXT);
    return { kind: index.kind, base: index.base, pages, sources: sourcesOf(pages).filter((s) => s.url) };
  }

  // ---------------------------------------------------------------------------------------
  // The box

  const BASE_CSS = ":host{all:initial}*{box-sizing:border-box}button{font:inherit;border-radius:0;cursor:pointer}[hidden]{display:none!important}";
  const CSS = BASE_CSS + [
    ".ot{--accent:#0b5fff;--paper:#fff;--paper2:#f5f7fb;--ink:#0b1020;--line:#d8dee9;--muted:#5c667d;font:15px/1.55 system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:var(--ink);text-align:left}",
    ".ot[data-theme=dark]{--paper:#111830;--paper2:#1d2640;--ink:#f5f7fb;--line:#33405f;--muted:#99a2b5}",
    ":focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
    ".launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;height:44px;padding:0 16px;border:0;background:var(--accent);color:#fff;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(11,16,32,.25)}",
    ".ot[data-pos=left] .launcher{right:auto;left:20px}",
    ".launcher:hover,.send:hover{filter:brightness(.9)}",
    "dialog{padding:0;border:1px solid var(--line);background:var(--paper);color:var(--ink);width:min(640px,calc(100vw - 24px));max-height:min(80vh,720px);margin:10vh auto auto;box-shadow:0 16px 48px rgba(11,16,32,.28)}",
    "dialog[open]{display:flex;flex-direction:column}",
    "dialog::backdrop{background:rgba(11,16,32,.5)}",
    ".head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px 0;font-weight:600}",
    ".close{border:0;background:none;color:var(--muted);font-size:22px;line-height:1;padding:0 2px}",
    "form{display:flex;gap:8px;margin:0;padding:12px 16px}",
    "input{flex:1;min-width:0;font:inherit;font-size:16px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:0;padding:9px 12px}",
    "input:focus{outline:0;border-color:var(--accent)}",
    "input::placeholder{color:var(--muted)}",
    ".send{border:0;background:var(--accent);color:#fff;font-weight:600;padding:0 18px;white-space:nowrap}",
    ".send:disabled{opacity:.5;cursor:default}",
    ".body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:0 16px 4px}",
    ".body p{margin:0 0 12px}",
    ".note,.intro,.status{color:var(--muted)}",
    ".note{font-size:13px;padding:8px 10px;background:var(--paper2)}",
    ".status.wait{animation:ot-wait 1.2s ease-in-out infinite}",
    "@keyframes ot-wait{50%{opacity:.4}}",
    ".status.error{color:var(--ink);padding:8px 10px;border:1px solid var(--line)}",
    ".q{font-weight:600}",
    ".answer p{white-space:pre-wrap;overflow-wrap:anywhere}",
    ".answer code,.answer pre{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--paper2)}",
    ".answer code{padding:1px 4px}",
    ".answer pre{margin:0 0 12px;padding:10px 12px;overflow-x:auto;white-space:pre}",
    ".answer pre code{padding:0;background:none}",
    ".answer .table{margin:0 0 12px;overflow-x:auto}",
    ".answer table{width:100%;border-collapse:collapse;font-size:14px}",
    ".answer th,.answer td{padding:6px 8px;border:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:break-word}",
    ".answer th{background:var(--paper2);font-weight:600}",
    ".answer a,.list a{color:var(--accent)}",
    ".list{margin:0 0 12px;padding:10px 12px;border-left:3px solid var(--accent);background:var(--paper2);font-size:14px}",
    ".list b{display:block;font-size:13px;color:var(--muted);font-weight:600;margin-bottom:2px}",
    ".list a,.list span{display:block;padding:2px 0;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".list a:hover{text-decoration:underline}",
    ".foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:8px 16px 10px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}",
    ".foot a{color:var(--muted);text-decoration:none}",
    ".foot a:hover{text-decoration:underline}",
    ".link{border:0;background:none;padding:0;color:var(--accent);text-decoration:underline}",
    "@media (max-width:480px){dialog{margin-top:12px;max-height:calc(100vh - 24px)}}",
    "@media (prefers-reduced-motion:reduce){.status.wait{animation:none}}",
    "@media print{.ot{display:none}}",
  ].join("");
  // The button a known theme gets in its header: it takes the header's own text colour.
  const TRIGGER_CSS = BASE_CSS + [
    ":host{display:inline-flex!important;align-items:center;margin:0 8px;flex-shrink:0;color:inherit}",
    "button{display:flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:1px solid;border-color:color-mix(in srgb,currentColor 45%,transparent);background:transparent;color:inherit;font:600 14px/1 system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;white-space:nowrap}",
    "button:hover{border-color:currentColor}",
    "button:focus-visible{outline:2px solid currentColor;outline-offset:2px}",
    "@media (max-width:600px){:host{margin:0 4px}button{padding:0 9px}span{display:none}}",
    "@media print{:host{display:none!important}}",
  ].join("");

  // The last exchange is kept for the tab, so following a source to its page (a full page
  // load on most sites) does not lose the conversation. `base` is the folder the answer was
  // found in: another site on the same host does not show it.
  const STORE = "onetag-ask-docs";
  function readSaved(raw, href) {
    try {
      const s = JSON.parse(raw || "null");
      if (!s || typeof s.question !== "string" || typeof s.answer !== "string") return null;
      if (typeof s.base !== "string" || !s.base || !String(href).startsWith(s.base)) return null;
      const http = (u) => (typeof u === "string" && /^https?:\/\//.test(u) ? u : "");
      return {
        base: s.base, question: s.question.slice(0, 400), answer: s.answer.slice(0, 8000),
        history: (Array.isArray(s.history) ? s.history : []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-KEEP),
        sources: (Array.isArray(s.sources) ? s.sources : []).filter((x) => x && typeof x.title === "string").map((x) => ({ title: x.title, url: http(x.url) })),
      };
    } catch (e) { return null; }
  }
  function remember(state) {
    try {
      if (state) win.sessionStorage.setItem(STORE, JSON.stringify(state));
      else win.sessionStorage.removeItem(STORE);
    } catch (e) { /* no storage (a private window, a blocked one): the conversation lasts as long as the page */ }
  }
  function restore() {
    let saved = null;
    try { saved = readSaved(win.sessionStorage.getItem(STORE), win.location.href); } catch (e) { /* no storage */ }
    if (!saved) return;
    history = saved.history;
    ui.intro.hidden = true;
    ui.question.textContent = saved.question;
    ui.question.hidden = false;
    paint(saved.answer);
    list(strings.sources, saved.sources);
    ui.reset.hidden = false;
    ui.input.placeholder = strings.follow;
  }

  let ui = null;           // the dialog and the floating button, built on first use
  let trigger = null;      // the button placed in a known theme's header
  let history = [];        // [{role, content}]
  let controller = null;

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
    const attrs = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
    for (const name in attrs) svg.setAttribute(name, attrs[name]);
    const path = doc.createElementNS(NS, "path");
    path.setAttribute("d", "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12z");
    svg.appendChild(path);
    return svg;
  }

  function build() {
    const host = el("div", { "data-onetag-ask-docs": "" });
    const root = host.attachShadow({ mode: "open" });
    const label = config.label || strings.label;
    const launcher = el("button", { class: "launcher", type: "button", hidden: "" }, [bubbleIcon(), el("span", { text: label })]);
    const close = el("button", { class: "close", type: "button", "aria-label": strings.close, text: "×" });
    const input = el("input", { type: "text", maxlength: "400", autocomplete: "off", enterkeyhint: "send", placeholder: config.placeholder || strings.placeholder, "aria-label": config.placeholder || strings.placeholder });
    const send = el("button", { class: "send", type: "submit", text: strings.ask });
    const form = el("form", {}, [input, send]);
    const note = el("p", { class: "note", text: strings.demo });
    note.hidden = !!config.key || !local;
    const intro = el("p", { class: "intro", text: strings.intro });
    const question = el("p", { class: "q", hidden: "" });
    const status = el("p", { class: "status", "aria-live": "polite", hidden: "" });
    const answer = el("div", { class: "answer", "aria-live": "polite" });
    const sources = el("div", { class: "list", hidden: "" });
    const body = el("div", { class: "body" }, [note, intro, question, status, answer, sources]);
    const reset = el("button", { class: "link", type: "button", text: strings.reset, hidden: "" });
    const link = el("a", { href: HOME + "/?ref=" + (config.ref || "ask-docs"), target: "_blank", rel: "noopener", text: strings.powered });
    const foot = el("div", { class: "foot" }, [el("span", {}, [el("span", { text: strings.scope + " " }), reset]), link]);
    const dialog = el("dialog", { "aria-label": label }, [el("div", { class: "head" }, [el("span", { text: label }), close]), form, body, foot]);
    const wrap = el("div", { class: "ot", "data-pos": config.position === "left" ? "left" : "right", "data-theme": "light" }, [dialog, launcher]);
    root.appendChild(el("style", { text: CSS }));
    root.appendChild(wrap);
    launcher.addEventListener("click", open);
    close.addEventListener("click", closeBox);
    dialog.addEventListener("click", (e) => { if (e.target === dialog) closeBox(); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      ask(q);
    });
    reset.addEventListener("click", startOver);
    // A link in the answer or among the sources leads to a page, often the one the reader is
    // on: the box gets out of its way. A click that opens a new tab leaves it open.
    body.addEventListener("click", (e) => {
      const link = e.target && e.target.closest && e.target.closest("a");
      if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.button) closeBox();
    });
    // Keys typed in the box stay in the box. Themes listen on the document for one-letter
    // shortcuts ("s" opens search, "n" goes to the next page) and skip them only when the focus
    // is in a field, which they cannot tell here: from outside, the focus is on the host element.
    for (const type of ["keydown", "keypress", "keyup"]) {
      host.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === "keydown" && isToggle(e)) { e.preventDefault(); closeBox(); }
      });
    }
    return { host, wrap, launcher, dialog, input, send, intro, question, status, answer, sources, reset };
  }

  function buildTrigger() {
    const host = el("span", { "data-onetag-ask-docs-trigger": "" });
    const root = host.attachShadow({ mode: "open" });
    const button = el("button", { type: "button", "aria-label": config.label || strings.label }, [bubbleIcon(), el("span", { text: config.label || strings.label })]);
    button.addEventListener("click", open);
    root.appendChild(el("style", { text: TRIGGER_CSS }));
    root.appendChild(button);
    return host;
  }

  // Where the button goes: next to the search box of a theme we know, otherwise floating
  // in a corner. position="none" shows no button (open it from your own with data-button
  // or onetagAskDocs.open()).
  function placementIn(d, position) {
    if (position === "none") return null;
    if (position === "auto") {
      const inner = d.querySelector(".md-header__inner");   // Material for MkDocs
      if (inner) {
        const search = inner.querySelector(":scope > .md-search");
        return { parent: inner, before: search ? search.nextSibling : inner.querySelector(":scope > .md-header__source") };
      }
      const right = d.querySelector(".navbar .navbar__items--right");   // Docusaurus
      if (right) {
        // React owns the navbar: a node added before it has hydrated is thrown away, or makes
        // it render the page again. Docusaurus 3 says when it is done on <html>; older ones do not.
        const hydrated = d.documentElement.getAttribute("data-has-hydrated");
        if (hydrated === "false" || (hydrated === null && d.readyState !== "complete")) return { wait: true };
        return { parent: right, before: right.querySelector(':scope > [class*="navbarSearchContainer"]') };
      }
    }
    return { float: true };
  }
  function placement() { return placementIn(doc, config.position); }

  // Builds the box once and keeps it and its button attached: a theme that swaps parts of
  // the page on navigation can drop either.
  function mount() {
    if (!doc.body) return null;
    if (!ui) { ui = build(); restore(); }
    if (ui.host.parentNode !== doc.body) doc.body.appendChild(ui.host);
    const spot = placement();
    const float = !!(spot && spot.float);
    if (ui.launcher.hidden === float) ui.launcher.hidden = !float;
    if (spot && spot.parent) {
      if (!trigger) trigger = buildTrigger();
      if (trigger.parentNode !== spot.parent) spot.parent.insertBefore(trigger, spot.before || null);
    } else if (trigger && trigger.parentNode) trigger.parentNode.removeChild(trigger);
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

  // The site's own accent colour, from the themes that publish one as a CSS variable.
  function pageAccent() {
    if (config.color) return config.color;
    const style = win.getComputedStyle(doc.body);
    for (const name of ["--md-accent-fg-color", "--sl-color-accent", "--ifm-color-primary", "--vp-c-brand-1"]) {
      const value = style.getPropertyValue(name).trim();
      if (value) return value;
    }
    return "";
  }

  function open() {
    if (!mount()) return;
    ui.wrap.setAttribute("data-theme", pageIsDark() ? "dark" : "light");
    const accent = pageAccent();
    if (accent) ui.wrap.style.setProperty("--accent", accent);
    if (!ui.dialog.open) ui.dialog.showModal();
    ui.input.focus();
    getIndex().catch(() => {});   // the index is on its way before the question is typed
  }

  function closeBox() { if (ui && ui.dialog.open) ui.dialog.close(); }

  function paint(text) {
    const span = (s) => {
      if (s.code !== undefined) return el("code", { text: s.code });
      if (s.bold !== undefined) return el("strong", { text: s.bold });
      if (s.link !== undefined) {
        let href = "";
        try { const u = new URL(s.href, win.location.href); if (/^https?:$/.test(u.protocol)) href = u.href; } catch (e) { /* shown as text */ }
        return href ? el("a", { href, text: s.link }) : doc.createTextNode(s.link);
      }
      return doc.createTextNode(s.text);
    };
    const nodes = parseAnswer(text).map((block) => {
      if (block.code !== undefined) return el("pre", {}, [el("code", { text: block.code })]);
      if (block.table) {
        const row = (cells, tag) => el("tr", {}, cells.map((cell) => el(tag, {}, cell.map(span))));
        // the wrapper scrolls sideways, so a wide table never widens the box
        return el("div", { class: "table" }, [el("table", {}, [
          el("thead", {}, [row(block.table[0], "th")]),
          el("tbody", {}, block.table.slice(1).map((cells) => row(cells, "td"))),
        ])]);
      }
      return el("p", {}, block.spans.map(span));
    });
    ui.answer.replaceChildren(...nodes);
  }

  function list(title, items) {
    ui.sources.replaceChildren(el("b", { text: title }), ...items.map((s) => (s.url ? el("a", { href: s.url, text: s.title }) : el("span", { text: s.title }))));
    ui.sources.hidden = !items.length;
  }

  function setStatus(text, cls) {
    ui.status.textContent = text;
    ui.status.className = "status" + (cls ? " " + cls : "");
    ui.status.hidden = !text;
  }

  async function ask(question) {
    open();
    if (!ui) return;
    if (controller) controller.abort();
    controller = new win.AbortController();
    const signal = controller.signal;
    ui.send.disabled = true;
    ui.intro.hidden = true;
    ui.question.textContent = question;
    ui.question.hidden = false;
    ui.answer.replaceChildren();
    ui.sources.hidden = true;
    ui.reset.hidden = false;
    setStatus(strings.reading, "wait");
    let found = null;
    try {
      if (!key) throw fail("no_key");
      const previous = history.length ? history[history.length - 2].content : "";
      found = await retrieve(question, previous, signal);
      if (signal.aborted) return;
      const text = await request(buildBody(config, key, question, history, found.pages, "ask-docs-" + found.kind), (soFar) => {
        if (signal.aborted) return;
        setStatus("");
        paint(soFar);
      }, signal);
      if (signal.aborted) return;
      if (!text) throw fail("upstream");
      setStatus("");
      paint(text);
      history.push({ role: "user", content: question }, { role: "assistant", content: text });
      history = history.slice(-KEEP);
      ui.input.placeholder = strings.follow;
      list(strings.sources, found.sources);
      remember({ base: found.base || win.location.href.split("#")[0], question, answer: text, history, sources: found.sources });
    } catch (e) {
      if (signal.aborted) return;
      const code = e.code === "domain_not_allowed" ? "bad_key" : e.code;
      ui.answer.replaceChildren();
      setStatus(strings[code] || strings.fail, "error");
      // Without an answer the reader still gets what plain search would have given them.
      if (found && found.sources.length) list(strings.matches, found.sources);
      if (win.console) win.console.warn("[OneTag AI Ask Docs] " + (e.code || e.message) + ". Error codes: " + HOME + "/docs#errors");
    } finally {
      if (!signal.aborted) ui.send.disabled = false;
    }
  }

  function startOver() {
    if (controller) controller.abort();
    history = [];
    remember(null);
    ui.question.hidden = true;
    ui.answer.replaceChildren();
    ui.sources.hidden = true;
    ui.reset.hidden = true;
    ui.intro.hidden = false;
    ui.send.disabled = false;
    ui.input.placeholder = config.placeholder || strings.placeholder;
    setStatus("");
    ui.input.focus();
  }

  win.onetagAskDocs = {
    version: VERSION,
    open,
    close: closeBox,
    ask,            // ask("How do I deploy?") opens the box and answers
    _internal: { readConfig, pickLang, isLocal, cut, stripHtml, stem, queryTerms, count, makeIndex, focus, mkdocsEntries, loadMkdocs, llmsEntries, ancestors, toPages, sourcesOf, buildBody, parseSSE, parseAnswer, withIntros, readSaved, isDark, placementIn, STRINGS, RULES, DEMO_KEY },
  };

  // Ctrl+/ or ⌘+/ opens and closes the box.
  function isToggle(e) { return (e.metaKey || e.ctrlKey) && e.key === "/"; }

  function start() {
    hints = readHints();
    mount();
    win.addEventListener("keydown", (e) => {
      if (isToggle(e)) { e.preventDefault(); if (ui && ui.dialog.open) closeBox(); else open(); }
    });
    if (config.button) {
      doc.addEventListener("click", (e) => {
        let hit = null;
        try { hit = e.target && e.target.closest && e.target.closest(config.button); } catch (err) { /* a bad selector opens nothing */ }
        if (hit) { e.preventDefault(); open(); }
      });
    }
    if (win.MutationObserver) {
      let queued = false;
      const observer = new win.MutationObserver(() => {
        if (queued) return;
        queued = true;
        win.requestAnimationFrame(() => { queued = false; mount(); });
      });
      observer.observe(doc.body, { childList: true, subtree: true });
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-has-hydrated"] });
      win.addEventListener("load", () => mount());
    }
  }

  if (doc.body) start();
  else if (doc.addEventListener) doc.addEventListener("DOMContentLoaded", start);
})();
