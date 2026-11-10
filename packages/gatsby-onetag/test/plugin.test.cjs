// Run with: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { testPluginOptionsSchema } = require("gatsby-plugin-utils");
const { scriptTag } = require("static-llms-txt");
const gatsbyNode = require("../gatsby-node.js");
const gatsbySsr = require("../gatsby-ssr.js");
const { DEMO_KEY } = require("../core.js");
const pkg = require("../package.json");

function render(options, env) {
  const saved = process.env.ONETAG_KEY;
  if (env === undefined) delete process.env.ONETAG_KEY; else process.env.ONETAG_KEY = env;
  let out = null;
  try {
    gatsbySsr.onRenderBody({ setPostBodyComponents: (c) => { out = c; } }, options);
  } finally {
    if (saved === undefined) delete process.env.ONETAG_KEY; else process.env.ONETAG_KEY = saved;
  }
  return out && renderToStaticMarkup(React.createElement(React.Fragment, null, out));
}

function reporter() {
  const r = { warns: [], infos: [] };
  r.warn = (m) => r.warns.push(m);
  r.info = (m) => r.infos.push(m);
  return r;
}

test("the package has what Gatsby needs to find and load it", () => {
  for (const f of ["index.js", "gatsby-node.js", "gatsby-ssr.js"]) assert.ok(pkg.files.includes(f), f);
  for (const f of pkg.files) assert.ok(fs.existsSync(path.join(__dirname, "..", f)), f);
  for (const k of ["gatsby", "gatsby-plugin", "llms.txt", "ai", "ask-ai", "chatbot", "onetag"]) assert.ok(pkg.keywords.includes(k), k);
  assert.equal(pkg.homepage, "https://onetagai.com/?ref=gatsby-onetag");
  assert.equal(pkg.dependencies["static-llms-txt"], "^0.1.0");
});

test("pluginOptionsSchema accepts good options and rejects bad ones", async () => {
  const good = await testPluginOptionsSchema(gatsbyNode.pluginOptionsSchema, { key: "ot_x", site: "https://acme.dev", position: "left", color: "0b5fff", exclude: "drafts/**" });
  assert.equal(good.isValid, true, String(good.errors));
  for (const [opts, word] of [[{ position: "top" }, "position"], [{ color: "blue" }, "color"], [{ theme: "sepia" }, "theme"], [{ site: "acme" }, "site"], [{ llms: "no" }, "llms"]]) {
    const bad = await testPluginOptionsSchema(gatsbyNode.pluginOptionsSchema, opts);
    assert.equal(bad.isValid, false, word);
    assert.match(bad.errors.join(" "), new RegExp(word));
  }
});

test("the rendered tag matches static-llms-txt's tag", () => {
  const html = render({ key: "ot_x", label: "Ask", color: "#0b5fff" });
  const expected = scriptTag({ key: "ot_x", ref: "gatsby-onetag", label: "Ask", color: "0b5fff", index: "/llms-full.txt" });
  assert.equal(html.replace('async=""', "async"), expected);
});

test("key comes from the option, then ONETAG_KEY, then the demo key", () => {
  assert.match(render({ key: "ot_option" }, "ot_env"), /data-key="ot_option"/);
  assert.match(render({}, "ot_env"), /data-key="ot_env"/);
  assert.match(render({}), new RegExp(`data-key="${DEMO_KEY}"`));
  assert.match(render({}), /data-ref="gatsby-onetag"/);
});

test("askAi: false renders nothing; llms: false drops data-index", () => {
  assert.equal(render({ askAi: false }), null);
  assert.doesNotMatch(render({ key: "ot_x", llms: false }), /data-index/);
});

test("the no-key warning comes from onPreBootstrap, once, with the signup command", () => {
  const saved = process.env.ONETAG_KEY;
  delete process.env.ONETAG_KEY;
  try {
    const r = reporter();
    gatsbyNode.onPreBootstrap({ reporter: r }, {});
    assert.equal(r.warns.length, 1);
    assert.match(r.warns[0], /localhost only/);
    assert.match(r.warns[0], /curl -X POST https:\/\/onetagai\.com\/api\/signup/);
    const quiet = reporter();
    gatsbyNode.onPreBootstrap({ reporter: quiet }, { key: "ot_x" });
    gatsbyNode.onPreBootstrap({ reporter: quiet }, { askAi: false });
    assert.equal(quiet.warns.length, 0);
  } finally {
    if (saved !== undefined) process.env.ONETAG_KEY = saved;
  }
});

const PAGE = (title, body) => `<!DOCTYPE html><html><head><title>${title} | Anvil Co.</title><meta name="description" content="About ${title}."/></head><body><div id="___gatsby"><div id="gatsby-focus-wrapper"><nav>Menu words</nav><main><h1>${title}</h1>${body}</main><footer>Copyright</footer></div><div id="gatsby-announcer" aria-live="assertive">Announcer words</div></div></body></html>`;

function site(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gpo-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, "public", rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, "public", rel), text);
  }
  return dir;
}
const store = (dir, siteMetadata, extra) => ({ getState: () => ({ program: { directory: dir }, config: Object.assign({ siteMetadata }, extra) }) });
const read = (dir, f) => fs.readFileSync(path.join(dir, "public", f), "utf8");

test("onPostBuild writes both files from siteMetadata and the path prefix", () => {
  const dir = site({
    "index.html": PAGE("Home", "<p>Anvil Co. makes anvils that last for a hundred years.</p>"),
    "about/index.html": PAGE("About", '<h2 id="team">Team</h2><p>Twelve people cast and test every anvil by hand.</p>'),
    "404.html": PAGE("Not found", "<p>Nothing here at all, sorry about that one.</p>"),
  });
  gatsbyNode.onPostBuild({ store: store(dir, { title: "Anvil Co.", description: "Anvils for smiths.", siteUrl: "https://acme.dev/" }), basePath: "/shop", reporter: reporter() }, {});
  const llms = read(dir, "llms.txt"), full = read(dir, "llms-full.txt");
  assert.match(llms, /^# Anvil Co\.\n\n> Anvils for smiths\./);
  assert.match(llms, /- \[About\]\(https:\/\/acme\.dev\/shop\/about\/\): About About\./);
  assert.match(llms, /\(https:\/\/acme\.dev\/shop\/llms-full\.txt\)/);
  assert.doesNotMatch(llms, /Not found/);
  assert.match(full, /## Team\n\nSource: https:\/\/acme\.dev\/shop\/about\/#team/);
  assert.doesNotMatch(full, /Menu words|Copyright|Announcer words/);
});

test("onPostBuild without siteUrl writes prefixed paths; site option wins over siteMetadata", () => {
  const files = { "about/index.html": PAGE("About", "<p>Twelve people cast and test every anvil by hand.</p>") };
  const a = site(files);
  gatsbyNode.onPostBuild({ store: store(a, { title: "Anvil Co." }), basePath: "/shop", reporter: reporter() }, {});
  assert.match(read(a, "llms.txt"), /\(\/shop\/about\/\)/);
  assert.match(read(a, "llms.txt"), /\(\/shop\/llms-full\.txt\)/);
  const b = site(files);
  gatsbyNode.onPostBuild({ store: store(b, { siteUrl: "https://old.dev" }), basePath: "", reporter: reporter() }, { site: "https://new.dev" });
  assert.match(read(b, "llms.txt"), /https:\/\/new\.dev\/about\//);
});

test("onPostBuild honours llms: false, exclude, and a foreign llms.txt", () => {
  const files = { "about/index.html": PAGE("About", "<p>Twelve people cast and test every anvil by hand.</p>"), "drafts/x/index.html": PAGE("Draft", "<p>Not ready yet, this draft text should stay out.</p>") };
  const off = site(files);
  gatsbyNode.onPostBuild({ store: store(off, {}), basePath: "", reporter: reporter() }, { llms: false });
  assert.ok(!fs.existsSync(path.join(off, "public", "llms.txt")));

  const ex = site(files);
  gatsbyNode.onPostBuild({ store: store(ex, {}), basePath: "", reporter: reporter() }, { exclude: ["drafts/**"] });
  assert.doesNotMatch(read(ex, "llms-full.txt"), /Draft/);

  const mine = site(Object.assign({ "llms.txt": "# Mine\n" }, files));
  const r = reporter();
  gatsbyNode.onPostBuild({ store: store(mine, {}), basePath: "", reporter: r }, {});
  assert.equal(read(mine, "llms.txt"), "# Mine\n");
  assert.match(r.warns.join(" "), /left alone/);
});
