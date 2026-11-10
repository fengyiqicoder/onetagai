// Runs a real Eleventy build when @11ty/eleventy is installed (it is a peer dependency).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import onetag from "../index.mjs";

let Eleventy = null;
try { ({ default: Eleventy } = await import("@11ty/eleventy")); } catch (e) { /* not installed */ }

test("a real Eleventy build gets the tag on every page and both llms files", { skip: !Eleventy && "@11ty/eleventy not installed" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onetag-real-"));
  const input = path.join(root, "src"), output = path.join(root, "_site");
  fs.mkdirSync(path.join(input, "posts"), { recursive: true });
  const layout = "---\n---\n<!doctype html><html><head><title>{{ title }}</title></head><body><main><h1>{{ title }}</h1>{{ content | safe }}</main></body></html>";
  fs.mkdirSync(path.join(input, "_includes"));
  fs.writeFileSync(path.join(input, "_includes", "base.njk"), layout);
  fs.writeFileSync(path.join(input, "index.md"), "---\nlayout: base.njk\ntitle: Home\n---\nThe home page of a test site, with enough text to be listed.\n");
  fs.writeFileSync(path.join(input, "posts", "one.md"), "---\nlayout: base.njk\ntitle: Post one\n---\n## Part\n\nA post with a section and enough text to be listed in the files.\n");
  const elev = new Eleventy(input, output, {
    quietMode: true,
    pathPrefix: "/sub/",
    config(cfg) { cfg.addPlugin(onetag, { key: "ot_test", site: "https://example.com" }); },
  });
  const orig = console.log; console.log = () => {};
  try { await elev.write(); } finally { console.log = orig; }
  for (const f of ["index.html", "posts/one/index.html"]) {
    const html = fs.readFileSync(path.join(output, f), "utf8");
    assert.equal((html.match(/ask-docs\.js/g) || []).length, 1, f);
    assert.match(html, /data-key="ot_test" data-ref="eleventy-onetag"/);
  }
  const llms = fs.readFileSync(path.join(output, "llms.txt"), "utf8");
  assert.match(llms, /https:\/\/example\.com\/sub\/posts\/one\//);
  assert.match(fs.readFileSync(path.join(output, "llms-full.txt"), "utf8"), /## Part/);
});
