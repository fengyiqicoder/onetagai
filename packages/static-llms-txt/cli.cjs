#!/usr/bin/env node
"use strict";
const path = require("node:path");
const { generate, inject } = require("./index.cjs");

const HELP = `static-llms-txt: write llms.txt and llms-full.txt from a built static site.

Usage
  npx static-llms-txt <folder> [options]

Options
  --site <url>          Public address of the site, e.g. https://example.com. Used for absolute links.
  --title <text>        Site title. Default: taken from the home page.
  --description <text>  One-line summary. Default: the home page meta description.
  --content <selector>  CSS selector of the main content. Default: main, article, then body.
  --exclude <glob>      Skip matching files, e.g. "tags/**". Repeatable.
  --clean-urls          Link /about instead of /about.html.
  --no-full             Write llms.txt only.
  --force               Overwrite an llms.txt this tool did not write.
  --ask-ai              Also add an "Ask AI" box to every page (one script tag, answers from llms-full.txt).
  --key <key>           OneTag AI site key for --ask-ai. Free: https://onetagai.com/?ref=static-llms-txt
  -h, --help            Show this help.
`;

function parseArgs(argv) {
  const o = { exclude: [] };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error("Missing value after " + a); return argv[++i]; };
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--site") o.site = next();
    else if (a === "--title") o.title = next();
    else if (a === "--description") o.description = next();
    else if (a === "--content") o.content = next();
    else if (a === "--exclude") o.exclude.push(next());
    else if (a === "--clean-urls") o.cleanUrls = true;
    else if (a === "--no-full") o.full = false;
    else if (a === "--force") o.force = true;
    else if (a === "--ask-ai") o.askAi = true;
    else if (a === "--key") o.key = next();
    else if (a.startsWith("-")) throw new Error("Unknown option " + a + ". Run with --help to see the options.");
    else rest.push(a);
  }
  o.dir = rest[0];
  return o;
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (o.help || !o.dir) { console.log(HELP); process.exit(o.help ? 0 : 2); }
  let result;
  try { result = generate(o.dir, o); } catch (e) { console.error(e.message); process.exit(1); }
  const dir = path.resolve(o.dir);
  for (const f of result.written) console.log("wrote " + path.join(dir, f));
  for (const f of result.skipped) console.log("kept  " + path.join(dir, f) + " (not written by this tool; pass --force to replace it)");
  console.log(result.pages.length + " pages");
  if (!o.site && result.pages.some((p) => !/^https?:/.test(p.url))) console.log("Tip: pass --site https://your-site.com so the links are absolute.");
  if (o.askAi) {
    const changed = inject(dir, { key: o.key || "ot_demo000000000000000000000", ref: "static-llms-txt", exclude: o.exclude });
    console.log("added the Ask AI script to " + changed.length + " pages");
    if (!o.key) console.log("No --key given: the demo key answers on localhost only. Get a free key:\n  curl -X POST https://onetagai.com/api/signup -H \"Content-Type: application/json\" -d '{\"email\":\"you@example.com\"}'");
  }
}

main();
