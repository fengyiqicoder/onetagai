// Writes core.js from sdk/v1.js: the same code as the script-tag SDK, as an ES module.
// `node build.mjs` rewrites it; `node build.mjs --check` fails when it is out of date.
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const src = read("../../sdk/v1.js");
const open = '(() => {\n  "use strict";\n';
const close = "  globalThis.onetag = {";
const start = src.indexOf(open);
const end = src.indexOf(close);
const version = (src.match(/version: "([\d.]+)"/) || [])[1];
if (start < 0 || end < 0 || !version) throw new Error("sdk/v1.js no longer has the shape build.mjs expects");

// A bundle can run as a classic script, where document.currentScript is the bundle's own tag:
// its URL and data attributes say nothing about OneTag AI, so the module never reads them.
const tag = 'const script = typeof document !== "undefined" ? document.currentScript : null;';
const inner = src.slice(start + open.length, end);
if (inner.split(tag).length !== 2) throw new Error("sdk/v1.js no longer reads document.currentScript the way build.mjs expects");
const body = inner
  .replace(tag, "const script = null;")
  .split("\n")
  .map((line) => line.replace(/^ {2}/, ""))
  .join("\n")
  .trim();
const out =
  `/*! OneTag AI SDK v${version} | https://onetagai.com | generated from sdk/v1.js by build.mjs, do not edit */\n` +
  body +
  `\n\nconst version = "${version}";\n\nexport { ask, configure, OneTagError, version };\n`;

const target = new URL("core.js", import.meta.url);
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== out) {
    console.error("core.js is out of date: run `node build.mjs`");
    process.exit(1);
  }
  // Same major.minor as the SDK. The patch number may be ahead of it: a release that
  // changes only the README or package.json has no SDK version of its own.
  const pkg = JSON.parse(read("package.json")).version.split(".").map(Number);
  const sdk = version.split(".").map(Number);
  if (pkg[0] !== sdk[0] || pkg[1] !== sdk[1] || pkg[2] < sdk[2]) {
    console.error(`package.json version does not match the SDK version ${version}`);
    process.exit(1);
  }
} else {
  fs.writeFileSync(target, out);
  console.log(`core.js written (SDK ${version})`);
}
