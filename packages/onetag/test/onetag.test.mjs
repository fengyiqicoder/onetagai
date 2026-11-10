// Run with: node --test packages/onetag/test/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Each test imports a fresh copy of the package, so the key set in one never reaches another.
let copy = 0;
const load = () => import(`../index.js?copy=${++copy}`);

// Stands in for fetch: records the request bodies and answers every call with "ok".
function fakeFetch() {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push({ url, ...JSON.parse(init.body) });
    return new Response(JSON.stringify({ text: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return bodies;
}

function at(hostname) {
  if (hostname === undefined) delete globalThis.location;
  else globalThis.location = { hostname };
}

test("core.js is the current sdk/v1.js and the versions agree", () => {
  execFileSync(process.execPath, ["build.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("a configured key is sent to onetagai.com with via npm", async () => {
  const bodies = fakeFetch();
  at("example.com");
  const { ask, configure, version } = await load();
  configure({ key: "ot_mine" });
  assert.equal(await ask("Say hi", "some text"), "ok");
  assert.equal(bodies[0].url, "https://onetagai.com/v1/ask");
  assert.equal(bodies[0].key, "ot_mine");
  assert.equal(bodies[0].via, "npm");
  assert.equal(bodies[0].prompt, "Say hi");
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test("without a key, localhost falls back to the demo key and says so once", async () => {
  const bodies = fakeFetch();
  const notes = [];
  const info = console.info;
  console.info = (line) => notes.push(line);
  try {
    for (const host of ["localhost", "127.0.0.1", "docs.localhost", ""]) {
      at(host);
      const { ask, DEMO_KEY } = await load();
      await ask("Say hi");
      await ask("Say hi again");
      assert.equal(bodies.at(-1).key, DEMO_KEY, host);
    }
  } finally {
    console.info = info;
  }
  assert.equal(notes.length, 4);
  assert.match(notes[0], /demo key/);
  assert.match(notes[0], /api\/signup/);
});

test("without a key, a deployed site gets no_key and nothing is sent", async () => {
  const bodies = fakeFetch();
  at("example.com");
  const { ask, configure, OneTagError } = await load();
  await assert.rejects(ask("Say hi"), (e) => e instanceof OneTagError && e.code === "no_key" && /api\/signup/.test(e.message));
  configure({ key: "YOUR_KEY" });
  await assert.rejects(ask("Say hi"), (e) => e.code === "no_key");
  assert.equal(bodies.length, 0);
});

test("outside a browser the demo key answers unless NODE_ENV is production", async () => {
  const bodies = fakeFetch();
  at(undefined);
  const before = process.env.NODE_ENV;
  const info = console.info;
  console.info = () => {};
  try {
    process.env.NODE_ENV = "development";
    const dev = await load();
    await dev.ask("Say hi");
    assert.equal(bodies[0].key, dev.DEMO_KEY);
    process.env.NODE_ENV = "production";
    const prod = await load();
    await assert.rejects(prod.ask("Say hi"), (e) => e.code === "no_key");
  } finally {
    console.info = info;
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});

test("a call can carry its own key and via, and configure() can set via", async () => {
  const bodies = fakeFetch();
  at("example.com");
  const { ask, configure } = await load();
  configure({ key: "ot_mine", via: "astro-onetag" });
  await ask("One");
  await ask("Two", null, { key: "ot_other", via: "starlight-onetag" });
  assert.deepEqual([bodies[0].key, bodies[0].via], ["ot_mine", "astro-onetag"]);
  assert.deepEqual([bodies[1].key, bodies[1].via], ["ot_other", "starlight-onetag"]);
});

test("the module ignores the script tag it happens to run in", async () => {
  const bodies = fakeFetch();
  at("example.com");
  globalThis.document = { currentScript: { src: "http://localhost:8080/bundle.js", dataset: { key: "ot_from_tag", endpoint: "http://localhost:8080/elsewhere" } } };
  try {
    const { ask, configure } = await load();
    configure({ key: "ot_mine" });
    await ask("Say hi");
    assert.equal(bodies[0].url, "https://onetagai.com/v1/ask");
    assert.equal(bodies[0].key, "ot_mine");
  } finally {
    delete globalThis.document;
  }
});

test("streaming and json options pass through", async () => {
  at("example.com");
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.stream) {
      const sse = 'data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\ndata: {"done":true,"text":"Hello"}\n\n';
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({ text: '{"tags":["a","b"]}' }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const { ask, configure } = await load();
  configure({ key: "ot_mine" });
  const parts = [];
  const text = await ask("Say hello", null, { stream: (delta) => parts.push(delta) });
  assert.equal(text, "Hello");
  assert.ok(parts.length >= 1);
  assert.deepEqual(await ask("Tags", "text", { json: true }), { tags: ["a", "b"] });
});
