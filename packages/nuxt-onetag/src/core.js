// Plain logic of nuxt-onetag, kept free of Nuxt so it can be tested with node --test.
// src/module.ts wires these functions into Nuxt.
import fs from "node:fs";
import path from "node:path";
import { generate } from "static-llms-txt";

export const NAME = "nuxt-onetag";
export const SCRIPT = "https://onetagai.com/ask-docs.js";
export const DEMO_KEY = "ot_demo000000000000000000000";
export const SIGNUP = `curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;

// Widget options passed to ask-docs.js as data-* attributes, in this order.
export const WIDGET_OPTIONS = ["label", "placeholder", "position", "button", "color", "theme", "lang", "rules"];

// Pages Nuxt writes that are not content: the SPA fallback and the error pages.
export const DEFAULT_EXCLUDE = ["200.html", "404.html", "404/**", "_nuxt/**", "__nuxt_error/**"];

export const DEFAULTS = { askAi: true, llms: true };

const empty = (v) => v === undefined || v === null || v === "";

// Key lookup: the key option, then ONETAG_KEY, then the demo key.
export function resolveKey(options, env) {
  const own = (options && options.key) || (env && env.ONETAG_KEY) || "";
  const key = String(own).trim();
  return key ? { key, demo: false } : { key: DEMO_KEY, demo: true };
}

export function missingKeyWarning() {
  return "No OneTag AI key (the `onetag.key` option or ONETAG_KEY). The Ask AI box uses the demo key, which answers on localhost only. Get a free key before you deploy:\n  " + SIGNUP;
}

// The ask-docs.js script as a Nuxt head script entry, or null when askAi is false.
export function headScript(options, env) {
  const o = { ...DEFAULTS, ...options };
  if (o.askAi === false) return null;
  const { key } = resolveKey(o, env);
  const entry = { key: "onetag-ask-docs", src: SCRIPT, async: true, "data-key": key, "data-ref": NAME };
  for (const name of WIDGET_OPTIONS) {
    let value = o[name];
    if (empty(value)) continue;
    if (name === "color") value = String(value).replace(/^#/, "");
    entry["data-" + name] = String(value);
  }
  return entry;
}

// Public address of the site for the links in llms.txt, with app.baseURL appended.
// Order: the site option, then site.url (nuxt-site-config), then runtimeConfig.public.siteUrl.
export function resolveSite({ site, siteConfig, runtimeConfig, baseURL } = {}) {
  const pub = (runtimeConfig && runtimeConfig.public) || {};
  const url = site || (siteConfig && siteConfig.url) || pub.siteUrl || (pub.site && pub.site.url) || "";
  const base = String(baseURL || "/").replace(/^\/*/, "/").replace(/\/+$/, "");
  if (!url) return base || undefined;
  const root = String(url).replace(/\/+$/, "");
  if (!base || root.endsWith(base)) return root;
  return root + base;
}

function htmlFiles(dir, rel = "", out = []) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== "_nuxt" && e.name !== "node_modules") htmlFiles(dir, r, out); }
    else if (/\.html?$/i.test(e.name)) out.push(r);
  }
  return out;
}

// True when the folder holds at least one prerendered page (not only the SPA fallback or error pages).
export function hasPages(dir) {
  return htmlFiles(dir).some((f) => !/^(200|404)\.html$|^404\/index\.html$|^__nuxt_error\//.test(f));
}

const consoleLogger = { info: (msg) => console.log("[" + NAME + "] " + msg) };

// Write llms.txt and llms-full.txt into the public output folder after prerendering.
// Returns the generate() result, or null when it was skipped.
export function writeLlms(publicDir, options, { site, logger = consoleLogger } = {}) {
  const o = { ...DEFAULTS, ...options };
  if (o.llms === false) return null;
  if (!publicDir || !hasPages(publicDir)) {
    logger.info("No prerendered pages, so llms.txt was not written. Use `nuxi generate` or prerender routes to get it.");
    return null;
  }
  const exclude = DEFAULT_EXCLUDE.concat(o.exclude || []);
  const result = generate(publicDir, { site, exclude });
  for (const f of result.skipped) logger.info("Kept your own " + f + " (not written by " + NAME + ").");
  if (result.written.length) logger.info("Wrote " + result.written.join(" and ") + " from " + result.pages.length + " pages.");
  return result;
}
