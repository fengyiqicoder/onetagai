"use strict";
// eleventy-onetag: llms.txt, llms-full.txt and an Ask AI box for Eleventy 2 and 3.
const fs = require("fs");
const path = require("path");
const core = require("static-llms-txt");

const NAME = "eleventy-onetag";
const DEMO_KEY = "ot_demo000000000000000000000";
const SIGNUP = `curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;
const WIDGET = ["label", "placeholder", "position", "button", "color", "theme", "lang", "rules", "index", "src"];

let warned = false; // one warning per process, also across config reloads in --serve

function log(msg) {
  console.warn("[" + NAME + "] " + msg);
}

// Key lookup: the key option, then ONETAG_KEY, then the demo key with one warning.
function resolveKey(options, env) {
  const o = options || {};
  const e = env || process.env;
  const k = String(o.key || e.ONETAG_KEY || "").trim();
  if (k) return { key: k, demo: false };
  return { key: DEMO_KEY, demo: true };
}

function missingKeyWarning() {
  return "No OneTag AI key set, so the Ask AI box uses the demo key and answers on localhost only.\n" +
    "  Get a free key (1,000,000 tokens a month) and set ONETAG_KEY or the key option:\n  " + SIGNUP;
}

function tagFor(options, key) {
  const o = options || {};
  const t = { key, ref: NAME };
  for (const n of WIDGET) if (o[n] !== undefined && o[n] !== null && o[n] !== "") t[n] = o[n];
  if (t.color) t.color = String(t.color).replace(/^#/, "");
  return core.scriptTag(t);
}

// Add the tag before the last </body>. Pages that already have one are left alone.
function addTag(html, tag) {
  if (typeof html !== "string" || /<script[^>]+\/ask-docs\.js/i.test(html)) return html;
  const at = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
  if (at === -1) return html;
  return html.slice(0, at) + tag + "\n" + html.slice(at);
}

// "/tags/x/" → "tags/x/index.html", the same relative form static-llms-txt matches globs against.
function relFromUrl(url) {
  let p = String(url || "").replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  return decodeURI(p);
}

function normalizePrefix(p) {
  let s = String(p || "/").trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s += "/";
  return s.replace(/\/{2,}/g, "/");
}

// Public address of the output root. Adds the path prefix unless the site already carries it.
function siteWithPrefix(site, prefix) {
  if (!site) return "";
  const base = String(site).replace(/\/+$/, "");
  const pre = normalizePrefix(prefix).replace(/\/$/, "");
  if (!pre) return base;
  try {
    const u = new URL(base);
    if (u.pathname.replace(/\/+$/, "") === pre || u.pathname.replace(/\/+$/, "").endsWith(pre)) return base;
    if (u.pathname !== "/" && u.pathname !== "") return base; // the site has its own path, trust it
  } catch (e) { /* not a full URL; use as given */ }
  return base + pre;
}

// Write a file only when its text changed. A file this plugin did not write is left alone unless force.
function writeIfChanged(file, text, force) {
  let old = null;
  try { old = fs.readFileSync(file, "utf8"); } catch (e) { /* missing */ }
  if (old !== null && !force && !old.includes(core.MARK)) return "skipped";
  if (old === text) return "same";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return "written";
}

// Scan the built folder and write llms.txt and llms-full.txt. Returns the result, or null on error.
function writeLlms(outDir, options, prefix) {
  const o = options || {};
  const pre = normalizePrefix(prefix);
  const site = siteWithPrefix(o.site, pre);
  const opts = {
    site: site || undefined,
    title: o.title, description: o.description, section: o.section,
    content: o.content, remove: o.remove, exclude: o.exclude,
    cleanUrls: o.cleanUrls, minLength: o.minLength, full: o.full,
  };
  let pages = core.scan(outDir, opts);
  if (!site && pre !== "/") pages = pages.map((p) => Object.assign({}, p, { path: pre + p.path.replace(/^\//, "") }));
  const result = core.build(pages, opts);
  if (!site && pre !== "/") result.llms = result.llms.replace("](/llms-full.txt)", "](" + pre + "llms-full.txt)");
  const status = { "llms.txt": writeIfChanged(path.join(outDir, "llms.txt"), result.llms, o.force) };
  if (o.full !== false) status["llms-full.txt"] = writeIfChanged(path.join(outDir, "llms-full.txt"), result.llmsFull, o.force);
  return Object.assign(result, { status });
}

function outputDirOf(arg, eleventyConfig) {
  const a = arg || {};
  const d = (a.directories && a.directories.output) || (a.dir && a.dir.output) ||
    (eleventyConfig && eleventyConfig.dir && eleventyConfig.dir.output) || "_site";
  return path.resolve(d);
}

function prefixOf(eleventyConfig) {
  try {
    const url = eleventyConfig.getFilter && eleventyConfig.getFilter("url");
    if (typeof url === "function") return normalizePrefix(url("/"));
  } catch (e) { /* older Eleventy */ }
  return "/";
}

function onetag(eleventyConfig, options) {
  const o = Object.assign({ askAi: true, llms: true }, options || {});

  if (o.askAi !== false) {
    const { key, demo } = resolveKey(o);
    if (demo && !warned) { warned = true; log(missingKeyWarning()); }
    // The box is pointed straight at our llms-full.txt, so it does not probe folder by folder.
    // The path prefix is only known once the config is merged, so the tag is built on first use.
    let tag = null;
    const getTag = () => {
      if (tag) return tag;
      const t = Object.assign({}, o);
      if (!t.index && o.llms !== false && o.full !== false) t.index = prefixOf(eleventyConfig) + "llms-full.txt";
      return (tag = tagFor(t, key));
    };
    const excludes = [].concat(o.exclude || []).map(core.globToRegExp);
    eleventyConfig.addTransform("onetag-ask-ai", function (content, outputPath) {
      try {
        const out = outputPath || (this && this.page && this.page.outputPath);
        if (typeof out !== "string" || !/\.html?$/i.test(out)) return content;
        if (excludes.length) {
          const rel = relFromUrl(this && this.page && this.page.url);
          if (excludes.some((re) => re.test(rel))) return content;
        }
        return addTag(content, getTag());
      } catch (e) {
        log("could not add the Ask AI tag: " + (e && e.message));
        return content;
      }
    });
  }

  if (o.llms !== false) {
    let last = "";
    eleventyConfig.on("eleventy.after", function (arg) {
      try {
        if (arg && arg.outputMode && arg.outputMode !== "fs") return;
        const outDir = outputDirOf(arg, eleventyConfig);
        if (!fs.existsSync(outDir)) return;
        const r = writeLlms(outDir, o, prefixOf(eleventyConfig));
        const skipped = Object.keys(r.status).filter((k) => r.status[k] === "skipped");
        const written = Object.keys(r.status).filter((k) => r.status[k] === "written");
        const note = skipped.join(",");
        if (skipped.length && note !== last) log("left " + note + " alone: it was not written by this plugin. Set force: true to replace it.");
        last = note;
        if (written.length) console.log("[" + NAME + "] wrote " + written.join(" and ") + " (" + r.pages.length + " pages)");
      } catch (e) {
        // Never fail the build or crash the dev server over the llms files.
        log("could not write llms.txt: " + (e && e.message));
      }
    });
  }
}

module.exports = onetag;
module.exports.default = onetag;
module.exports.onetag = onetag;
module.exports._internal = { resolveKey, missingKeyWarning, tagFor, addTag, relFromUrl, normalizePrefix, siteWithPrefix, writeLlms, writeIfChanged, DEMO_KEY, NAME, resetWarning: () => { warned = false; } };
