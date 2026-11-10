// vitepress-onetag: llms.txt, llms-full.txt and an Ask AI box for a VitePress site.
import { generate, scan, SCRIPT } from "static-llms-txt";

export const REF = "vitepress-onetag";
export const DEMO_KEY = "ot_demo000000000000000000000";
export const SIGNUP = `curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;

// The main content of a page: the home layout (hero, features and any Markdown below them)
// first, as it holds a .vp-doc of its own, then a doc page's .vp-doc, then any <main>.
export const CONTENT = [".VPHome", ".vp-doc", "main"];
// Parts of the default theme that are not the text of the page.
export const REMOVE = [
  ".header-anchor",           // the "#" link after each heading
  ".vp-code-group .tabs",     // tab labels of a code group
  ".line-numbers-wrapper",    // line numbers next to code
  "span.lang",                // the language label on a code block
  ".VPDocFooter",
  ".VPDocAside",
  ".VPLocalNav",
  ".VPHomeSponsors",
  ".VPHero .actions",         // the "Get started" buttons of the home hero
];

const WIDGET = ["label", "placeholder", "position", "button", "color", "theme", "lang", "rules", "index"];
const WARNED = Symbol.for("vitepress-onetag.warned");

/** The key to use: the option, then ONETAG_KEY, then the demo key (localhost only). */
export function resolveKey(options, env) {
  const o = options || {};
  const e = env || process.env;
  const key = String(o.key || e.ONETAG_KEY || "").trim();
  return key ? { key, demo: false } : { key: DEMO_KEY, demo: true };
}

export function warning() {
  return "[" + REF + "] No OneTag AI key set (option `key` or env ONETAG_KEY). " +
    "Using the demo key: the Ask AI box answers on localhost only. Get a free key:\n  " + SIGNUP;
}

/** "/docs/" → "/docs/", "docs" → "/docs/", "" → "/". */
export function normalizeBase(base) {
  let b = String(base || "/").trim();
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b += "/";
  return b;
}

/** The head entry VitePress renders on every page: ["script", { async, src, data-* }]. */
export function headEntry(options, ctx) {
  const o = options || {};
  const c = ctx || {};
  const attrs = { async: "", src: o.src || SCRIPT, "data-key": c.key || resolveKey(o, c.env).key, "data-ref": REF };
  for (const name of WIDGET) {
    const v = o[name];
    if (v !== undefined && v !== null && v !== "") attrs["data-" + name] = String(name === "color" ? String(v).replace(/^#/, "") : v);
  }
  // In a production build the index sits at the site base; point the box straight at it.
  // In dev there is no llms-full.txt, so the box finds what it can on its own.
  if (!attrs["data-index"] && o.llms !== false && c.production) attrs["data-index"] = normalizeBase(c.base) + "llms-full.txt";
  return ["script", attrs];
}

const hasWidget = (head) => (head || []).some((h) => Array.isArray(h) && h[0] === "script" && /\/ask-docs\.js/.test(String((h[1] && h[1].src) || "")));

/** Options for static-llms-txt.generate(), from what VitePress knows after the build. */
export function llmsOptions(siteConfig, options) {
  const o = options || {};
  const sc = siteConfig || {};
  const site = sc.site || {};
  const user = sc.userConfig || {};
  const host = String(o.site || (user.sitemap && user.sitemap.hostname) || "").replace(/\/+$/, "");
  const base = normalizeBase(site.base || user.base).replace(/\/$/, "");
  // The output folder holds the pages without the base, so the base goes in front of each path.
  const prefix = host + base;
  return {
    site: prefix || undefined,
    title: o.title || site.title || undefined,
    description: o.description || site.description || undefined,
    cleanUrls: !!(sc.cleanUrls !== undefined ? sc.cleanUrls : user.cleanUrls),
    content: CONTENT,
    remove: REMOVE.concat(o.remove || []),
    exclude: [].concat(o.exclude || []),
  };
}

/** Write llms.txt and llms-full.txt into the VitePress output folder. */
export function writeLlms(siteConfig, options) {
  const opts = llmsOptions(siteConfig, options);
  // VitePress gives every page the site description unless the page sets its own. Repeated on
  // every line of llms.txt it says nothing, so only the home page keeps it.
  const site = String(opts.description || "").trim();
  // The home hero's h1 runs its name and text together ("AcmeHeavy things"); the site title reads better.
  const pages = scan(siteConfig.outDir, opts).map((p) => {
    if (p.path === "/") return opts.title ? Object.assign({}, p, { title: opts.title }) : p;
    return site && String(p.description || "").trim() === site ? Object.assign({}, p, { description: "" }) : p;
  });
  const result = generate(siteConfig.outDir, Object.assign({}, opts, { pages }));
  const log = (options && options.logger) || console;
  if (result.written.length) log.info("[" + REF + "] wrote " + result.written.join(", ") + " (" + result.pages.length + " pages)");
  if (result.skipped.length) log.warn("[" + REF + "] left " + result.skipped.join(", ") + " alone: it was not written by this plugin");
  return result;
}

/**
 * Add llms.txt, llms-full.txt and the Ask AI box to a VitePress config.
 * Returns the same config object, changed in place.
 */
export function withOnetag(config, options) {
  const cfg = config || {};
  const o = options || {};
  const askAi = o.askAi !== false;
  const llms = o.llms !== false;

  if (askAi) {
    const { key, demo } = resolveKey(o, o.env);
    if (demo && !globalThis[WARNED]) {
      globalThis[WARNED] = true;
      ((o.logger && o.logger.warn) || console.warn)(warning());
    }
    const head = cfg.head ? cfg.head.slice() : [];
    if (!hasWidget(head)) {
      const production = o.production !== undefined ? !!o.production : process.env.NODE_ENV === "production";
      head.push(headEntry(o, { key, base: cfg.base, production }));
    }
    cfg.head = head;
  }

  if (llms) {
    const userBuildEnd = cfg.buildEnd;
    cfg.buildEnd = async function onetagBuildEnd(siteConfig) {
      if (typeof userBuildEnd === "function") await userBuildEnd.call(this, siteConfig);
      writeLlms(siteConfig, o);
    };
  }
  return cfg;
}

export default withOnetag;
