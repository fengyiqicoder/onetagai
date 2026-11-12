// docusaurus-onetag: llms.txt and llms-full.txt at build time, and an Ask AI box on every page.
//   postBuild       writes llms.txt and llms-full.txt into the build folder (no key, no network)
//   injectHtmlTags  adds the ask-docs.js script tag before </body> of every page, and the
//                   docs-ai.js one when `features` names any of the tools on the page
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { scan, generate, scriptTag } = require("static-llms-txt");

const NAME = "docusaurus-onetag";
const DEMO_KEY = "ot_demo000000000000000000000";
const SIGNUP = `curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;

// The article of a doc, a blog post or a Markdown page, without the theme around it.
const CONTENT = [".theme-doc-markdown", "article[itemprop=blogPost]", "main article", "main", "[role=main]"];
const REMOVE = [
  ".hash-link",
  ".theme-doc-sidebar-container", ".theme-doc-breadcrumbs", ".breadcrumbs",
  ".theme-doc-toc-mobile", ".theme-doc-toc-desktop", ".table-of-contents",
  ".theme-doc-version-badge", ".theme-doc-version-banner",
  ".theme-doc-footer", ".theme-edit-this-page", ".theme-last-updated", ".pagination-nav",
  "header > div",   // the date, reading time and authors of a blog post
];
// Generated listings: search, tag pages, blog index pages, archive and author pages.
const EXCLUDE = ["search/**", "search.html", "**/tags/**", "tags/**", "**/tags.html", "**/page/*/**", "**/page/*.html", "**/archive/**", "**/archive.html", "**/authors/**", "**/authors.html"];
// Page classes Docusaurus puts on <html>, and the wrapper of a category's generated index.
const LISTING_PAGES = /^(blog-list-page|blog-tags-list-page|blog-tags-post-list-page|blog-archive-page|blog-authors-list-page|blog-authors-posts-page|docs-tags-list-page|docs-tags-doc-list-page|search-page-wrapper)$/;
const GENERATED_INDEX = /class=["']?[^"'>]*\bgeneratedIndexPage_/;

function isListing(html) {
  const tag = /<html\b[^>]*>/i.exec(html);
  const cls = tag && /\bclass=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
  const names = cls ? (cls[1] || cls[2] || cls[3] || "").split(/\s+/) : [];
  return names.some((n) => LISTING_PAGES.test(n)) || GENERATED_INDEX.test(html);
}

const SCRIPT_OPTIONS = ["label", "placeholder", "position", "button", "color", "theme", "lang", "rules"];
// The tools docs-ai.js adds to the page itself. Each one is off until `features` names it.
const FEATURES = ["explain", "summary", "selection", "search"];
const DOCS_AI = "https://onetagai.com/docs-ai.js";

let warned = false;

function resolveKey(options, env) {
  const key = String((options && options.key) || (env || process.env).ONETAG_KEY || "").trim();
  return key || "";
}

function warnNoKey(log) {
  if (warned) return;
  warned = true;
  (log || console.warn)(
    `[${NAME}] No OneTag AI key found (option "key" or env ONETAG_KEY). Without one the AI uses the demo key and answers on localhost only. ` +
    `llms.txt and llms-full.txt are written either way. Get a free key:\n  ${SIGNUP}`
  );
}

// "https://example.com" + "/docs/" -> "https://example.com/docs"
function siteUrl(url, baseUrl) {
  return String(url || "").replace(/\/+$/, "") + String(baseUrl || "/").replace(/\/+$/, "");
}

// The script tag for one locale. `index` points the box at this build's llms-full.txt, so it
// is found under any baseUrl and from pages at any depth.
function tagFor(options, baseUrl, key) {
  const o = { key: key || DEMO_KEY, ref: NAME };
  for (const n of SCRIPT_OPTIONS) if (options[n] !== undefined && options[n] !== "") o[n] = n === "color" ? String(options[n]).replace(/^#/, "") : options[n];
  if (options.llms !== false) o.index = (baseUrl || "/").replace(/\/*$/, "/") + "llms-full.txt";
  return scriptTag(o);
}

const attr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The script tag of the tools on the page, or "" when `features` names none. With no key the
// attribute is left out: docs-ai.js then answers on localhost with the demo key, and says so.
function toolsTag(options, key) {
  const features = FEATURES.filter((f) => [].concat(options.features || []).includes(f));
  if (!features.length) return "";
  const o = { key, features: features.join(","), ref: NAME, color: String(options.color || "").replace(/^#/, "") };
  let tag = '<script async src="' + DOCS_AI + '"';
  for (const n of Object.keys(o)) if (o[n]) tag += " data-" + n + '="' + attr(o[n]) + '"';
  return tag + "></script>";
}

// Scan the build folder, drop generated listings, and write both files.
function writeLlms(outDir, siteConfig, options) {
  const site = siteUrl(siteConfig.url, siteConfig.baseUrl);
  if (/your-docusaurus-site\.example\.com|^https?:\/\/(www\.)?example\.com/i.test(siteConfig.url || "")) {
    console.warn(`[${NAME}] siteConfig.url is still the template value (${siteConfig.url}), so every Source link in llms-full.txt and every link the Ask AI box shows will point there. Set url in docusaurus.config to your real address.`);
  }
  const exclude = EXCLUDE.concat(options.exclude || []);
  const pages = scan(outDir, { site, content: CONTENT, remove: REMOVE, exclude, cleanUrls: true }).filter((p) => {
    try {
      return !isListing(fs.readFileSync(path.join(outDir, p.file), "utf8"));
    } catch (e) {
      return true;
    }
  });
  // "Hello from My Site | My Site" -> "Hello from My Site"
  const suffix = siteConfig.title ? " | " + siteConfig.title : "";
  for (const p of pages) if (suffix && p.title.endsWith(suffix) && p.title.length > suffix.length) p.title = p.title.slice(0, -suffix.length);
  // Docusaurus links pages without a trailing slash unless trailingSlash is true.
  if (siteConfig.trailingSlash !== true) {
    for (const p of pages) {
      if (p.path !== "/" && p.path.endsWith("/")) {
        p.path = p.path.replace(/\/+$/, "");
        p.url = site + p.path;
      }
    }
  }
  return generate(outDir, { pages, site, title: siteConfig.title, description: siteConfig.tagline || "" });
}

function pluginOnetag(context, options) {
  const o = Object.assign({ askAi: true, llms: true, exclude: [] }, options);
  const key = resolveKey(o);
  const tags = [
    o.askAi !== false ? tagFor(o, context.baseUrl || (context.siteConfig && context.siteConfig.baseUrl), key) : "",
    toolsTag(o, key),
  ].filter(Boolean);
  if (tags.length && !key) warnNoKey();

  return {
    name: NAME,

    injectHtmlTags() {
      if (!tags.length) return {};
      return { postBodyTags: tags };
    },

    async postBuild({ outDir, siteConfig }) {
      if (o.llms === false) return;
      const result = writeLlms(outDir, siteConfig || context.siteConfig, o);
      if (result.skipped.length) {
        console.warn(`[${NAME}] ${result.skipped.join(" and ")} already exist and were not written by this plugin, so they were left alone. Set llms: false if another plugin writes them.`);
      }
    },
  };
}

function schema(Joi) {
  const text = Joi.string().allow("");
  return Joi.object({
    key: text,
    askAi: Joi.boolean().default(true),
    llms: Joi.boolean().default(true),
    label: text,
    placeholder: text,
    position: Joi.string().valid("auto", "float", "left", "none"),
    button: text,
    color: Joi.string().pattern(/^#?[0-9a-fA-F]{3,8}$/).message('"color" must be a hex color such as "0b5fff"'),
    theme: Joi.string().valid("light", "dark"),
    lang: Joi.string(),
    rules: text,
    features: Joi.array().items(Joi.string().valid(...FEATURES)).default([]),
    exclude: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).default([]),
  });
}

function validateOptions({ validate, options }) {
  const { Joi } = require("@docusaurus/utils-validation");
  const out = validate(schema(Joi), options || {});
  out.exclude = [].concat(out.exclude || []);
  if (out.features.includes("search") && out.askAi === false) {
    throw new Error(`[${NAME}] "features" has "search", which hands what the reader typed to the Ask AI box, so it cannot be used with askAi: false.`);
  }
  return out;
}

module.exports = pluginOnetag;
module.exports.default = pluginOnetag;
module.exports.validateOptions = validateOptions;
module.exports.DEMO_KEY = DEMO_KEY;
module.exports._internal = { resolveKey, tagFor, toolsTag, writeLlms, schema, isListing, resetWarning: () => { warned = false; }, CONTENT, REMOVE, EXCLUDE };
