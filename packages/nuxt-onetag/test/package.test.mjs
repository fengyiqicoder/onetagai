// Checks on package.json and the module source. The built module is checked by the real build test (see README).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
const mod = read("../src/module.ts");

test("keywords list the package on nuxt.com/modules", () => {
  for (const k of ["nuxt", "nuxt-module", "llms.txt", "ai", "ask-ai", "chatbot", "onetag"]) assert.ok(pkg.keywords.includes(k), k);
});

test("module meta: configKey onetag and a Nuxt compatibility range", () => {
  assert.match(mod, /configKey: 'onetag'/);
  assert.match(mod, /compatibility: \{ nuxt: '>=3/);
  assert.match(mod, /name: NAME/);
});

test("published entry points live in dist and prepack builds them", () => {
  assert.equal(pkg.exports["."].import, "./dist/module.mjs");
  assert.ok(pkg.files.includes("dist"));
  assert.match(pkg.scripts.prepack, /nuxt-module-build build/);
});

test("static-llms-txt is a dependency, nuxt a peer", () => {
  assert.equal(pkg.dependencies["static-llms-txt"], "^0.1.0");
  assert.ok(pkg.peerDependencies.nuxt);
});

test("built module, when present, exports a Nuxt module with the right meta", async (t) => {
  if (!fs.existsSync(new URL("../dist/module.mjs", import.meta.url))) return t.skip("run npm run build first");
  const { default: mod } = await import("../dist/module.mjs");
  const meta = await mod.getMeta();
  assert.equal(meta.name, "nuxt-onetag");
  assert.equal(meta.configKey, "onetag");
});
