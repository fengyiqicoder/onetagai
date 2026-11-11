// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withOnetag, resolveKey, headEntry, llmsOptions, DEMO_KEY, REF } from "../index.js";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const quiet = () => { const msgs = { info: [], warn: [] }; return { msgs, info: (m) => msgs.info.push(m), warn: (m) => msgs.warn.push(m) }; };
const WARNED = Symbol.for("vitepress-onetag.warned");

test("package basics", () => {
  for (const f of pkg.files) assert.ok(fs.existsSync(new URL("../" + f, import.meta.url)), f);
  assert.equal(pkg.name, REF);
  assert.ok(REF.length <= 40 && REF === REF.toLowerCase());
  assert.ok(pkg.keywords.includes("vitepress-plugin"));
  assert.equal(pkg.dependencies["static-llms-txt"], "^0.1.0");
  assert.ok(pkg.peerDependencies.vitepress);
});

test("key lookup: option, then ONETAG_KEY, then the demo key", () => {
  assert.deepEqual(resolveKey({ key: "ot_a" }, { ONETAG_KEY: "ot_b" }), { key: "ot_a", demo: false });
  assert.deepEqual(resolveKey({}, { ONETAG_KEY: "ot_b" }), { key: "ot_b", demo: false });
  assert.deepEqual(resolveKey({}, {}), { key: DEMO_KEY, demo: true });
});

test("no key: one warning with the signup command, across several calls", () => {
  delete globalThis[WARNED];
  const log = quiet();
  withOnetag({}, { env: {}, logger: log });
  withOnetag({}, { env: {}, logger: log });
  assert.equal(log.msgs.warn.length, 1);
  assert.match(log.msgs.warn[0], /localhost only/);
  assert.match(log.msgs.warn[0], /api\/signup/);
});

test("a key: no warning", () => {
  delete globalThis[WARNED];
  const log = quiet();
  withOnetag({}, { key: "ot_x", logger: log });
  assert.equal(log.msgs.warn.length, 0);
});

test("the script tag goes in head once, with key and ref, after the user's own entries", () => {
  const cfg = withOnetag({ head: [["link", { rel: "icon", href: "/f.svg" }]] }, { key: "ot_x", label: "Ask the docs", color: "#ff6600", position: "none" });
  assert.equal(cfg.head.length, 2);
  const [tag, attrs] = cfg.head[1];
  assert.equal(tag, "script");
  assert.equal(attrs.src, "https://onetagai.com/ask-docs.js");
  assert.equal(attrs["data-key"], "ot_x");
  assert.equal(attrs["data-ref"], "vitepress-onetag");
  assert.equal(attrs["data-label"], "Ask the docs");
  assert.equal(attrs["data-color"], "ff6600");
  assert.equal(attrs["data-position"], "none");
  assert.ok("async" in attrs);
  withOnetag(cfg, { key: "ot_x" });
  assert.equal(cfg.head.filter((h) => h[0] === "script").length, 1, "applied twice adds no second tag");
});

test("data-index points at the base in production only", () => {
  assert.equal(headEntry({ key: "k" }, { base: "/docs/", production: true })[1]["data-index"], "/docs/llms-full.txt");
  assert.equal(headEntry({ key: "k" }, { production: true })[1]["data-index"], "/llms-full.txt");
  assert.equal(headEntry({ key: "k" }, { base: "/docs/", production: false })[1]["data-index"], undefined);
  assert.equal(headEntry({ key: "k", llms: false }, { production: true })[1]["data-index"], undefined);
  assert.equal(headEntry({ key: "k", index: "/x/llms-full.txt" }, { production: true })[1]["data-index"], "/x/llms-full.txt");
});

test("askAi: false adds no tag and prints no warning", () => {
  delete globalThis[WARNED];
  const log = quiet();
  const cfg = withOnetag({}, { askAi: false, env: {}, logger: log });
  assert.equal(cfg.head, undefined);
  assert.equal(log.msgs.warn.length, 0);
  assert.equal(typeof cfg.buildEnd, "function");
});

test("llms: false leaves buildEnd alone", () => {
  const mine = () => {};
  const cfg = withOnetag({ buildEnd: mine }, { llms: false, key: "k" });
  assert.equal(cfg.buildEnd, mine);
});

test("llmsOptions: base, sitemap hostname, cleanUrls, title", () => {
  const sc = { outDir: "/x", cleanUrls: true, site: { base: "/docs/", title: "Acme", description: "Anvils" }, userConfig: { sitemap: { hostname: "https://acme.dev/" } } };
  const o = llmsOptions(sc, {});
  assert.equal(o.site, "https://acme.dev/docs");
  assert.equal(o.cleanUrls, true);
  assert.equal(o.title, "Acme");
  assert.equal(o.description, "Anvils");
  assert.equal(llmsOptions({ site: { base: "/" }, userConfig: {} }, {}).site, undefined);
  assert.equal(llmsOptions({ site: { base: "/docs/" }, userConfig: {} }, {}).site, "/docs");
  assert.equal(llmsOptions(sc, { site: "https://x.io" }).site, "https://x.io/docs");
});

function fakeSite(base) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "vp-onetag-"));
  const page = (title, body) => `<!doctype html><html lang="en"><head><title>${title} | Acme</title><meta name="description" content="${title} page"></head><body><div id="app"><header class="VPNav"><nav>Menu</nav></header><main><div class="vp-doc"><div><h1 id="t">${title} <a class="header-anchor" href="#t" aria-label="Permalink">&#8203;</a></h1>${body}</div></div><footer class="VPDocFooter">Edit this page</footer></main></div></body></html>`;
  fs.writeFileSync(path.join(out, "index.html"), page("Home", "<p>Acme makes anvils for every kind of coyote and roadrunner story.</p>"));
  fs.mkdirSync(path.join(out, "guide"));
  fs.writeFileSync(path.join(out, "guide", "start.html"), page("Start", `<h2 id="install">Install <a class="header-anchor" href="#install">&#8203;</a></h2><div class="language-sh"><button class="copy"></button><span class="lang">sh</span><pre><code>npm i anvil</code></pre></div><p>Then drop it from a cliff, carefully, and watch.</p>`));
  fs.writeFileSync(path.join(out, "404.html"), page("404", "<p>Page not found anywhere on this site at all, sorry.</p>"));
  return { outDir: out, cleanUrls: true, site: { base, title: "Acme", description: "Anvils" }, userConfig: { sitemap: { hostname: "https://acme.dev" } } };
}

test("buildEnd chains the user's hook and writes clean llms files under the base", async () => {
  const sc = fakeSite("/docs/");
  let called = false;
  const log = quiet();
  const cfg = withOnetag({ buildEnd: () => { called = true; } }, { key: "k", logger: log });
  await cfg.buildEnd(sc);
  assert.ok(called);
  const llms = fs.readFileSync(path.join(sc.outDir, "llms.txt"), "utf8");
  const full = fs.readFileSync(path.join(sc.outDir, "llms-full.txt"), "utf8");
  assert.match(llms, /^# Acme\n\n> Anvils/);
  assert.match(llms, /\[Start\]\(https:\/\/acme\.dev\/docs\/guide\/start\)/);
  assert.match(llms, /https:\/\/acme\.dev\/docs\/llms-full\.txt/);
  assert.doesNotMatch(llms, /404/);
  assert.match(full, /## Install\n/);
  assert.match(full, /npm i anvil/);
  assert.doesNotMatch(full, /header-anchor|​|Edit this page|Menu|(^|\n)sh\n/);
  assert.match(llms, /\[Acme\]\(https:\/\/acme\.dev\/docs\/\): Home page/);
  assert.match(llms, /\[Start\]\([^)]*\): Start page/);
  assert.match(log.msgs.info[0], /wrote llms\.txt, llms-full\.txt \(2 pages\)/);
});

test("a page that repeats the site description gets none in llms.txt; the home layout is read", async () => {
  const sc = fakeSite("/");
  const home = `<!doctype html><html><head><title>Acme</title><meta name="description" content="Anvils"></head><body><main><div class="VPHome"><div class="VPHero"><h1>Acme Anvils</h1><p class="tagline">Heavy things, delivered from above to any cartoon desert.</p></div><div class="vp-doc"></div></div></main></body></html>`;
  fs.writeFileSync(path.join(sc.outDir, "index.html"), home);
  fs.writeFileSync(path.join(sc.outDir, "guide", "start.html"), fs.readFileSync(path.join(sc.outDir, "guide", "start.html"), "utf8").replace("Start page", "Anvils"));
  await withOnetag({}, { key: "k", logger: quiet() }).buildEnd(sc);
  const llms = fs.readFileSync(path.join(sc.outDir, "llms.txt"), "utf8");
  assert.match(llms, /\[Acme\]\(https:\/\/acme\.dev\/\): Anvils/);
  assert.match(llms, /\[Start\]\(https:\/\/acme\.dev\/guide\/start\)\n/);
  assert.match(fs.readFileSync(path.join(sc.outDir, "llms-full.txt"), "utf8"), /Heavy things, delivered/);
});

test("a hand-written llms.txt in the output is left alone", async () => {
  const sc = fakeSite("/");
  fs.writeFileSync(path.join(sc.outDir, "llms.txt"), "# mine\n");
  const log = quiet();
  await withOnetag({}, { key: "k", logger: log }).buildEnd(sc);
  assert.equal(fs.readFileSync(path.join(sc.outDir, "llms.txt"), "utf8"), "# mine\n");
  assert.match(log.msgs.warn[0], /left llms\.txt alone/);
});

test("theme module exports the nav button helpers", async () => {
  let mod;
  try { mod = await import("../theme.js"); } catch (e) { return; } // vue not installed next to the package
  assert.equal(typeof mod.withAskAiButton, "function");
  const Theme = { Layout: { render: () => null }, enhanceApp() {} };
  const wrapped = mod.withAskAiButton(Theme);
  assert.equal(wrapped.extends, Theme);
  assert.ok(wrapped.Layout);
  assert.equal(mod.openAskAi(), false);
});
