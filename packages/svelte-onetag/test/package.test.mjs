import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("keywords list the package for Svelte Society", () => {
  for (const k of ["svelte", "sveltekit", "svelte-component", "llms.txt", "ai", "ask-ai", "chatbot", "onetag"]) assert.ok(pkg.keywords.includes(k), k);
});

test("svelte field and the svelte export condition point at dist", () => {
  assert.equal(pkg.svelte, "./dist/index.js");
  assert.equal(pkg.exports["."].svelte, "./dist/index.js");
  assert.equal(pkg.exports["."].types, "./dist/index.d.ts");
  assert.ok(pkg.files.includes("dist"));
  assert.match(pkg.scripts.prepack, /package/);
});

test("svelte is a peer dependency for 4 and 5", () => {
  assert.match(pkg.peerDependencies.svelte, /\^4/);
  assert.match(pkg.peerDependencies.svelte, /\^5/);
});
