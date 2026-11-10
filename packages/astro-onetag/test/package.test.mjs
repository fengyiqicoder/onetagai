// Run with: node --test packages/astro-onetag/test/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
const sdk = JSON.parse(read("../../onetag/package.json"));
const component = read("../AskAI.astro");

test("every published file exists", () => {
  for (const file of pkg.files) assert.ok(fs.existsSync(new URL("../" + file, import.meta.url)), file);
});

test("the onetagai dependency range admits the onetagai package in this repo", () => {
  const [major, minor] = pkg.dependencies.onetagai.replace("^", "").split(".").map(Number);
  const [haveMajor, haveMinor] = sdk.version.split(".").map(Number);
  assert.equal(haveMajor, major);
  assert.ok(haveMinor >= minor);
});

test("calls are counted under the package name", () => {
  assert.match(component, new RegExp(`via: '${pkg.name}'`));
});

test("the keywords that list the package on astro.build are present", () => {
  assert.ok(pkg.keywords.includes("astro-component"));
  assert.ok(pkg.keywords.includes("withastro"));
});
