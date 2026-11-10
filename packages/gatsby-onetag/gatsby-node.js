// Validates the options, prints the no-key warning once, and writes llms.txt and llms-full.txt after the build.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { scan, generate } = require("static-llms-txt");
const { NAME, resolveKey, noKeyWarning } = require("./core");

// Files that are not content: slice fragments, the development 404 page and the gatsby-plugin-offline app shell.
const EXCLUDE = ["_gatsby/**", "dev-404-page/**", "offline-plugin-app-shell-fallback/**"];
// Gatsby's route announcer ("Navigated to ...") sits outside the page content.
const REMOVE = ["#gatsby-announcer"];

exports.pluginOptionsSchema = ({ Joi }) => {
  const text = Joi.string().allow("");
  return Joi.object({
    key: text.description("OneTag AI site key. Public by design. Default: the ONETAG_KEY environment variable."),
    site: Joi.string().uri({ scheme: ["http", "https"] }).description("Public address of the site. Default: siteMetadata.siteUrl."),
    askAi: Joi.boolean().default(true).description("false: only write llms.txt and llms-full.txt."),
    llms: Joi.boolean().default(true).description("false: only add the Ask AI box."),
    label: text,
    placeholder: text,
    position: Joi.string().valid("auto", "float", "left", "none"),
    button: text,
    color: Joi.string().pattern(/^#?[0-9a-fA-F]{3,8}$/).message('"color" must be a hex color such as "0b5fff"'),
    theme: Joi.string().valid("light", "dark"),
    lang: Joi.string(),
    rules: text,
    exclude: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).default([]),
  });
};

exports.onPreBootstrap = ({ reporter }, pluginOptions) => {
  const o = pluginOptions || {};
  if (o.askAi === false || resolveKey(o.key, process.env.ONETAG_KEY)) return;
  reporter.warn(noKeyWarning());
};

exports.onPostBuild = ({ store, basePath, reporter }, pluginOptions) => {
  const o = pluginOptions || {};
  if (o.llms === false) return;
  const state = store.getState();
  const config = state.config || {};
  const meta = config.siteMetadata || {};
  const outDir = path.join((state.program && state.program.directory) || process.cwd(), "public");
  const origin = String(o.site || meta.siteUrl || "").replace(/\/+$/, "");
  const site = origin ? origin + String(basePath || "").replace(/\/+$/, "") : "";
  const pages = scan(outDir, { site, remove: REMOVE, exclude: EXCLUDE.concat(o.exclude || []), cleanUrls: true });
  // Without a site address the links are paths, which still need the prefix.
  for (const p of pages) {
    if (config.trailingSlash === "never" && p.path !== "/" && p.path.endsWith("/")) p.path = p.path.replace(/\/+$/, "");
    p.url = site ? site + p.path : "";
    if (!site && basePath) p.path = String(basePath).replace(/\/+$/, "") + p.path;
  }
  const result = generate(outDir, { pages, site, title: meta.title, description: meta.description });
  // static-llms-txt links "/llms-full.txt" when it has no site address; add the prefix.
  if (!site && basePath && result.written.includes("llms.txt")) {
    const prefixed = result.llms.replace("](/llms-full.txt)", "](" + String(basePath).replace(/\/+$/, "") + "/llms-full.txt)");
    fs.writeFileSync(path.join(outDir, "llms.txt"), prefixed);
  }
  if (result.skipped.length) {
    reporter.warn(`[${NAME}] ${result.skipped.join(" and ")} already exist and were not written by this plugin, so they were left alone. Set llms: false if another plugin writes them.`);
  }
  reporter.info(`[${NAME}] wrote ${result.written.join(" and ") || "nothing"} (${result.pages.length} pages)`);
};
