// Shared by gatsby-node.js and gatsby-ssr.js. No Node built-ins here: gatsby-ssr.js is bundled by webpack.
"use strict";

const NAME = "gatsby-onetag";
const SCRIPT = "https://onetagai.com/ask-docs.js";
const DEMO_KEY = "ot_demo000000000000000000000";
const SIGNUP = `curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;
const BOX_OPTIONS = ["label", "placeholder", "position", "button", "color", "theme", "lang", "rules"];

// The key option, then ONETAG_KEY. "" when there is none.
function resolveKey(optionKey, envKey) {
  return String(optionKey || envKey || "").trim();
}

const noKeyWarning = () =>
  `[${NAME}] No OneTag AI key found (option "key" or env ONETAG_KEY). The Ask AI box uses the demo key and answers on localhost only. ` +
  `llms.txt and llms-full.txt are written either way. Get a free key:\n  ${SIGNUP}`;

// "/blog" or "" -> "/blog/llms-full.txt" or "/llms-full.txt"
function llmsFullPath(basePath) {
  return String(basePath || "").replace(/\/+$/, "") + "/llms-full.txt";
}

// The attributes of the script tag, in the order static-llms-txt's scriptTag() writes them.
function scriptAttributes(options, key, basePath) {
  const o = options || {};
  const attrs = { src: SCRIPT, "data-key": key || DEMO_KEY, "data-ref": NAME };
  for (const n of BOX_OPTIONS) {
    if (o[n] === undefined || o[n] === null || o[n] === "") continue;
    attrs["data-" + n] = n === "color" ? String(o[n]).replace(/^#/, "") : String(o[n]);
  }
  if (o.llms !== false) attrs["data-index"] = llmsFullPath(basePath);
  return attrs;
}

module.exports = { NAME, SCRIPT, DEMO_KEY, SIGNUP, BOX_OPTIONS, resolveKey, noKeyWarning, llmsFullPath, scriptAttributes };
