// Compiles AskAI.svelte with the installed Svelte and renders it on the server.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compile, VERSION } from "svelte/compiler";

const lib = new URL("../src/lib/", import.meta.url);
const tmp = new URL("./.tmp/", import.meta.url);
const source = fs.readFileSync(new URL("AskAI.svelte", lib), "utf8");

function build(name, code, generate) {
  const out = compile(code, { filename: name + ".svelte", generate });
  for (const w of out.warnings) assert.fail(name + ": " + w.message);
  return out.js.code.replace(/from "\.\/AskAI\.svelte"/g, 'from "./AskAI.js"');
}

test("compiles for the browser and the server without warnings (Svelte " + VERSION + ")", () => {
  build("AskAI", source, "client");
  build("AskAI", source, "server");
});

test("renders nothing by default and a button around slot content", async () => {
  if (!VERSION.startsWith("5")) return;
  fs.mkdirSync(tmp, { recursive: true });
  fs.copyFileSync(new URL("loader.js", lib), new URL("loader.js", tmp));
  fs.writeFileSync(new URL("AskAI.js", tmp), build("AskAI", source, "server"));
  const wrap = `<script>import AskAI from "./AskAI.svelte";</script><AskAI key="ot_k" class="ask">Ask the docs</AskAI>`;
  fs.writeFileSync(new URL("Wrap.js", tmp), build("Wrap", wrap, "server"));
  fs.writeFileSync(new URL("Runes.js", tmp), build("Runes", "<svelte:options runes />" + wrap, "server"));
  const { render } = await import("svelte/server");
  const { default: AskAI } = await import(new URL("AskAI.js", tmp));
  const { default: Wrap } = await import(new URL("Wrap.js", tmp));
  const strip = (html) => html.replace(/<!--[^>]*-->/g, "").trim();
  assert.equal(strip(render(AskAI, { props: { key: "ot_k" } }).body), "");
  const { default: Runes } = await import(new URL("Runes.js", tmp));
  assert.equal(strip(render(Wrap).body), '<button type="button" class="ask">Ask the docs</button>');
  assert.equal(strip(render(Runes).body), '<button type="button" class="ask">Ask the docs</button>');
  assert.doesNotMatch(render(AskAI, { props: { key: "ot_k" } }).body + render(AskAI).head, /ask-docs\.js/);
});

test("index exports the component and the helpers", () => {
  const index = fs.readFileSync(new URL("index.js", lib), "utf8");
  for (const name of ["AskAI", "open", "close", "ask"]) assert.match(index, new RegExp("\\b" + name + "\\b"));
});
