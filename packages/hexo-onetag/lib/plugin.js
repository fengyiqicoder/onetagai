// hexo-onetag: llms.txt, llms-full.txt and an Ask AI box for Hexo sites.
//
// - A generator turns the site's posts and pages (already rendered by Hexo) into
//   llms.txt and llms-full.txt routes, so they are part of `hexo generate` and `hexo server`.
// - An injector adds the ask-docs.js script tag before </body> of every page, on any theme.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { build, readHtml, scriptTag, globToRegExp } = require("static-llms-txt");

const NAME = "hexo-onetag";
const DEMO_KEY = "ot_demo000000000000000000000";
const SIGNUP = "curl -X POST https://onetagai.com/api/signup -H \"Content-Type: application/json\" -d '{\"email\":\"you@example.com\"}'";
const TAG_OPTIONS = ["label", "placeholder", "position", "button", "color", "theme", "lang", "rules", "index"];

const camel = (s) => s.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
const bool = (v, fallback) => (v === undefined || v === null || v === "" ? fallback : !(v === false || v === "false" || v === 0));

// The `onetag:` block of _config.yml, with snake_case keys read as camelCase.
function readOptions(config, env) {
  const raw = (config && typeof config.onetag === "object" && config.onetag) || {};
  const o = {};
  for (const k of Object.keys(raw)) o[camel(k)] = raw[k];
  const e = env || process.env;
  // A placeholder left in ("ot_...", "YOUR_KEY") counts as no key, as it does in ask-docs.js.
  const real = (k) => { const v = String(k || "").trim(); return /^YOUR_|…|\.\.\./i.test(v) ? "" : v; };
  const key = real(o.key) || real(e.ONETAG_KEY);
  const exclude = [].concat(o.exclude || []).filter(Boolean).map(String);
  const out = {
    key: key || DEMO_KEY,
    demo: !key,
    askAi: bool(o.askAi, true),
    llms: bool(o.llms, true),
    site: o.site ? String(o.site) : "",
    exclude,
  };
  for (const n of TAG_OPTIONS) if (o[n] !== undefined && o[n] !== null && o[n] !== "") out[n] = String(o[n]);
  if (out.color) out.color = out.color.replace(/^#/, "");
  return out;
}

// The tag added to every page.
function tag(options) {
  const t = { key: options.key, ref: NAME };
  for (const n of TAG_OPTIONS) if (options[n]) t[n] = options[n];
  return scriptTag(t);
}

function warning() {
  return NAME + ": no OneTag AI key set. The Ask AI box uses the demo key, which answers on localhost only.\n" +
    "  Get a free key (1,000,000 tokens), then set onetag.key in _config.yml or ONETAG_KEY:\n  " + SIGNUP;
}

// Public address of the site root, including the subfolder in `root` (https://example.com/blog).
function siteBase(config, override) {
  let url = String(override || (config && config.url) || "").replace(/\/+$/, "");
  const root = "/" + String((config && config.root) || "/").replace(/^\/+|\/+$/g, "");
  if (!/^https?:\/\//i.test(url)) return "";
  if (root !== "/") {
    let pathname = "/";
    try { pathname = new URL(url).pathname.replace(/\/+$/, "") || "/"; } catch (e) { /* keep "/" */ }
    if (!pathname.endsWith(root)) url += root;
  }
  return url;
}

// "about/index.html" → "about/" (and "x.html" → "x") the way Hexo's pretty_urls option asks.
function prettyPath(p, config) {
  let out = String(p || "").replace(/^\/+/, "");
  const pretty = (config && config.pretty_urls) || {};
  if (pretty.trailing_index === false) out = out.replace(/(^|\/)index\.html$/, "$1");
  if (pretty.trailing_html === false) out = out.replace(/\.html$/, "");
  return out;
}

const toArray = (q) => (!q ? [] : typeof q.toArray === "function" ? q.toArray() : Array.isArray(q) ? q : []);

// Hexo's highlight.js output is a two-column <table> (line numbers | code). Turn it back into
// <pre><code> so llms-full.txt gets a fenced code block, not a table.
function plainCode(html) {
  return String(html || "").replace(/<figure class="highlight\s*([\w+#.-]*)[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi, (m, lang, inner) => {
    const code = /<td class="code"[^>]*>\s*<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(inner);
    if (!code) return m;
    const body = code[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
    return "<pre><code" + (lang ? ' class="language-' + lang + '"' : "") + ">" + body.replace(/\n+$/, "") + "</code></pre>";
  });
}

// One line for llms.txt: the description from front matter, else the first paragraph.
function summary(doc, info) {
  let text = String(doc.description || "").replace(/\s+/g, " ").trim();
  if (!text) {
    const para = String(info.text || "").split(/\n{2,}/).find((b) => b.trim() && !/^\s*(#|\||```|~~~|>|- |\d+\. )/.test(b)) || "";
    text = para.replace(/`/g, "").replace(/\s+/g, " ").trim();
  }
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const at = cut.lastIndexOf(" ");
  return (at > 80 ? cut.slice(0, at) : cut) + "...";
}

// Posts and pages from Hexo's locals → static-llms-txt pages. Archive, category, tag and index
// listings are made by generators, not stored as pages, so they are never in this list.
function collect(locals, config, options) {
  const base = siteBase(config, options.site);
  const excludes = options.exclude.map(globToRegExp);
  const skip = (doc) => {
    const p = String(doc.path || "").replace(/^\/+/, "");
    return excludes.some((re) => re.test(p) || re.test(String(doc.source || "")));
  };
  const one = (doc) => {
    const p = prettyPath(doc.path, config);
    // doc.content is the rendered body without the theme around it: no menus, no sidebar.
    const info = readHtml("<main>" + plainCode(doc.content) + "</main>");
    return {
      url: base ? base + "/" + p : "",
      path: "/" + p,
      title: String(doc.title || "").trim() || info.title || "/" + p,
      description: summary(doc, info),
      sections: info.sections,
      text: info.text,
    };
  };
  const usable = (doc) => doc && doc.published !== false && doc.content && !skip(doc) && doc.llms !== false && doc.sitemap !== false;
  const pages = toArray(locals && locals.pages).filter(usable)
    .sort((a, b) => (String(a.path) < String(b.path) ? -1 : String(a.path) > String(b.path) ? 1 : 0)).map(one);
  const posts = toArray(locals && locals.posts).filter(usable)
    .sort((a, b) => +new Date(b.date || 0) - +new Date(a.date || 0)).map(one);
  return pages.concat(posts).filter((p) => p.text);
}

// Text of both files for the site: { llms, llmsFull, pages }.
function llmsFiles(locals, config, options) {
  return build(collect(locals, config, options), {
    site: siteBase(config, options.site),
    // " " rather than empty: an empty value would make build() borrow the first page's text.
    title: config.title || " ",
    description: config.description || config.subtitle || " ",
  });
}

function register(hexo) {
  const config = hexo.config || {};
  const options = readOptions(config, process.env);
  const log = hexo.log || console;

  if (options.askAi) {
    hexo.extend.injector.register("body_end", tag(options), "default");
    if (options.demo) {
      let warned = false;
      hexo.on("generateBefore", () => {
        if (warned) return;
        warned = true;
        log.warn(warning());
      });
    }
  }

  if (options.llms) {
    hexo.extend.generator.register("onetag_llms", function (locals) {
      const result = llmsFiles(locals, config, options);
      const sourceDir = hexo.source_dir || path.join(hexo.base_dir || process.cwd(), config.source_dir || "source");
      const routes = [];
      const add = (name, text) => {
        // An llms.txt of your own in source/ is copied by Hexo as is; this plugin leaves it alone.
        if (fs.existsSync(path.join(sourceDir, name))) { log.info(NAME + ": source/" + name + " exists, keeping it"); return; }
        routes.push({ path: name, data: text });
      };
      add("llms.txt", result.llms);
      add("llms-full.txt", result.llmsFull);
      return routes;
    });
  }
  return options;
}

module.exports = { register, readOptions, tag, warning, siteBase, prettyPath, plainCode, collect, llmsFiles, NAME, DEMO_KEY, SIGNUP };
