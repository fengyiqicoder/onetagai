import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../ask-docs.js", import.meta.url), "utf8");

// A document that never becomes ready: the pure parts load, nothing is mounted.
function load(dataset, scriptSrc, lang, hostname) {
  const ctx = {
    document: { currentScript: { dataset, src: scriptSrc }, body: null, documentElement: { lang: lang || "en" }, addEventListener() {} },
    location: { hostname: hostname || "docs.example.com", href: "https://docs.example.com/guide/" },
    console: { warn() {} }, URL, TextDecoder,
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.onetagAskDocs;
}
const api = load({ key: "ot_test" }, "https://onetagai.com/ask-docs.js");
const { readConfig, pickLang, isLocal, cut, stripHtml, stem, queryTerms, count, makeIndex, focus, mkdocsEntries, llmsEntries, ancestors, toPages, sourcesOf, buildBody, parseSSE, parseAnswer, withIntros, readSaved, STRINGS, RULES } = api._internal;
const local = (v) => JSON.parse(JSON.stringify(v));
const words = (q) => local(queryTerms(q)).map((t) => t.t);

test("readConfig: the script URL alone is enough (MkDocs extra_javascript takes only a URL)", () => {
  const c = readConfig({}, "https://onetagai.com/ask-docs.js?key=ot_url&ref=mkdocs&position=left&color=ff6600&index=/search/search_index.json");
  assert.equal(c.key, "ot_url");
  assert.equal(c.ref, "mkdocs");
  assert.equal(c.position, "left");
  assert.equal(c.color, "#ff6600");
  assert.equal(c.index, "/search/search_index.json");
  assert.equal(c.endpoint, "https://onetagai.com/v1/ask");
  assert.equal(readConfig({ key: "ot_attr" }, "https://onetagai.com/ask-docs.js?key=ot_url").key, "ot_attr");
});

test("readConfig: bad values are dropped and a placeholder key is no key", () => {
  const c = readConfig({ key: "YOUR_ONETAG_KEY", ref: "Not a slug!", color: "red; x", theme: "neon", position: "top" }, "");
  assert.equal(c.key, "");
  assert.equal(c.ref, "");
  assert.equal(c.color, "");
  assert.equal(c.theme, "auto");
  assert.equal(c.position, "auto");
  assert.equal(readConfig({ key: "k" }, "http://localhost:8000/ask-docs.js").endpoint, "http://localhost:8000/v1/ask");
});

test("pickLang and isLocal", () => {
  assert.equal(pickLang("zh-CN"), "zh-Hans");
  assert.equal(pickLang("zh-TW"), "zh-Hant");
  assert.equal(pickLang("fr"), "en");
  assert.ok(isLocal("localhost") && isLocal("127.0.0.1") && isLocal("docs.localhost") && isLocal(""));
  assert.ok(!isLocal("docs.example.com"));
});

test("every language has every string", () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const lang of Object.keys(STRINGS)) assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, lang);
});

test("stripHtml keeps the text, the line breaks and the entities", () => {
  assert.equal(stripHtml("<p>Run <code>mkdocs build</code> &amp; deploy.</p><pre><code>a &lt; b\nc</code></pre><p>Done&nbsp;now &#8212; ok &#x4e2d;</p>"),
    "Run mkdocs build & deploy.\n\na < b\nc\nDone now — ok 中");
  assert.equal(stripHtml("<style>p{}</style><script>x()</script>Hi"), "Hi");
  assert.equal(stripHtml(null), "");
  assert.equal(stripHtml("<p>In  mkdocs.yml:</p> <pre><code>extra_javascript:\n  - a.js\n\n\n\tb: 1\n</code></pre> <p>Then build.</p>"),
    "In mkdocs.yml:\n\nextra_javascript:\n  - a.js\n\n\n\tb: 1\nThen build.");
});

test("stem: only a common beginning is needed", () => {
  assert.equal(stem("installing"), "install");
  assert.equal(stem("configured"), "configur");
  assert.equal(stem("plugins"), "plugin");
  assert.equal(stem("dependencies"), "dependenc");
  for (const same of ["pages2", "class", "status", "embed", "nested", "this", "css"]) assert.equal(stem(same), same);
});

test("queryTerms: filler dropped, names kept whole and split, CJK as character pairs", () => {
  assert.deepEqual(words("How do I deploy the site to GitHub Pages?"), ["deploy", "github", "page"]);
  assert.deepEqual(words("Where is mkdocs.yml and data-key?"), ["mkdocs.yml", "mkdoc", "yml", "data-key", "data", "key"]);
  assert.deepEqual(words("怎么部署到 GitHub"), ["怎么", "么部", "部署", "署到", "github"]);
  assert.deepEqual(words("?? !!"), []);
  const t = local(queryTerms("Installing 部署"));
  assert.deepEqual(t[0], { t: "install", raw: "installing", word: true });
  assert.deepEqual(t[1], { t: "部署", raw: "部署", word: false });
});

test("count: words match at a word start only; CJK anywhere", () => {
  assert.deepEqual(local(count("redeploy and deploy, deployment", { t: "deploy", word: true })), { n: 2, first: 13 });
  assert.deepEqual(local(count("如何部署网站，部署很简单", { t: "部署", word: false })), { n: 2, first: 2 });
  assert.equal(count("nothing here", { t: "deploy", word: true }).n, 0);
});

const ENTRIES = [
  { url: "https://d.test/deploy/", title: "Deploying", text: "Publish the site to GitHub Pages with mkdocs gh-deploy. GitHub Pages serves the gh-pages branch." },
  { url: "https://d.test/install/", title: "Installation", text: "Install MkDocs with pip install mkdocs. Requires Python." },
  { url: "https://d.test/theme/", title: "Themes", text: "Pick a theme in mkdocs.yml. The site colours can be changed." },
  { url: "https://d.test/zh/", title: "部署", text: "用 mkdocs gh-deploy 把网站部署到 GitHub Pages。" },
];

test("makeIndex ranks the page that covers the question first", () => {
  const index = makeIndex(ENTRIES);
  assert.equal(index.size, 4);
  assert.equal(index.search(queryTerms("How do I deploy to GitHub Pages?"))[0].url, "https://d.test/deploy/");
  assert.equal(index.search(queryTerms("installing with pip"))[0].url, "https://d.test/install/");
  assert.equal(index.search(queryTerms("change the theme colours"))[0].url, "https://d.test/theme/");
  assert.equal(index.search(queryTerms("怎么部署网站"))[0].url, "https://d.test/zh/");
  assert.equal(index.search(queryTerms("kubernetes operators")).length, 0);
  assert.equal(index.search(queryTerms("mkdocs"), 2).length, 2);
  assert.equal(index.cjk, 0.25);
  assert.equal(index.sample, "Deploying / Installation / Themes / 部署");
});

test("focus: a long text is cut to the part around the first match", () => {
  const text = "intro ".repeat(400) + "\nThe deploy command publishes the site.\n" + "outro ".repeat(400);
  const part = focus(text, queryTerms("deploy"), 600);
  assert.ok(part.length <= 600);
  assert.ok(part.startsWith("…"));
  assert.ok(part.includes("The deploy command"));
  assert.equal(focus("short text", queryTerms("deploy"), 600), "short text");
  assert.ok(focus(text, queryTerms("nomatch"), 600).startsWith("intro"));
});

test("mkdocsEntries: section titles carry the page title, links are absolute", () => {
  const docs = [
    { location: "guide/", title: "Guide", text: "<p>Intro.</p>" },
    { location: "guide/#install", title: "Install", text: "<p>Run <code>pip install x</code>.</p>" },
    { location: "guide/#guide", title: "Guide", text: "<p>Same title as the page.</p>" },
    { location: "guide/#plain", title: "Plain", text: "Plain ¶ Text of the built-in plugin." },
    { location: 5 }, null,
  ];
  const entries = local(mkdocsEntries(docs, "https://d.test/project/"));
  assert.deepEqual(entries, [
    { url: "https://d.test/project/guide/", title: "Guide", text: "Intro." },
    { url: "https://d.test/project/guide/#install", title: "Guide › Install", text: "Run pip install x." },
    { url: "https://d.test/project/guide/#guide", title: "Guide", text: "Same title as the page." },
    { url: "https://d.test/project/guide/#plain", title: "Guide › Plain", text: "Plain Text of the built-in plugin." },
  ]);
});

test("mkdocsEntries: the built-in plugin's whole-page copy is not counted twice", () => {
  const docs = [
    { location: "a/", title: "A", text: "First part. Second part." },
    { location: "a/#one", title: "One", text: "First part." },
    { location: "a/#two", title: "Two", text: "Second part." },
  ];
  const entries = local(mkdocsEntries(docs, "https://d.test/"));
  assert.equal(entries[0].text, "");
  assert.equal(entries[1].text, "First part.");
  // Material: a long opening (an options table) that is not a copy of the sections stays.
  const material = local(mkdocsEntries([
    { location: "o/", title: "Options", text: "<p>Every option is a query parameter. key, label, position, color.</p>" },
    { location: "o/#button", title: "Button", text: "<p>position=float</p>" },
  ], "https://d.test/"));
  assert.equal(material[0].text, "Every option is a query parameter. key, label, position, color.");
});

test("llmsEntries: one entry per heading, links from a Source line, fences left alone", () => {
  const text = [
    "# Install", "Source: https://d.test/install/", "", "Run pip.", "", "```", "# not a heading", "```", "",
    "## On Windows", "Use py.", "", "# Deploy", "Push it.",
  ].join("\n");
  assert.deepEqual(local(llmsEntries(text)), [
    { url: "https://d.test/install/", title: "Install", text: "Run pip.\n\n```\n# not a heading\n```" },
    { url: "", title: "Install › On Windows", text: "Use py." },
    { url: "", title: "Deploy", text: "Push it." },
  ]);
  const long = "# Big\n" + ("word ".repeat(100) + "\n\n").repeat(30);
  const parts = llmsEntries(long, 2000);
  assert.ok(parts.length > 1 && parts.every((p) => p.text.length <= 2000 && p.title === "Big"));
});

test("ancestors: nearest folder first, up to the root", () => {
  assert.deepEqual(local(ancestors("https://u.github.io/project/guide/install/")), ["https://u.github.io/project/guide/install/", "https://u.github.io/project/guide/", "https://u.github.io/project/", "https://u.github.io/"]);
  assert.deepEqual(local(ancestors("https://d.test/a/b.html")), ["https://d.test/a/", "https://d.test/"]);
  assert.deepEqual(local(ancestors("https://d.test/")), ["https://d.test/"]);
  assert.deepEqual(local(ancestors("file:///tmp/x.html")), []);
  assert.equal(ancestors("https://d.test/a/b/c/d/e/f/g/h/", 3).length, 3);
});

test("toPages keeps within the budget; sourcesOf lists a page once, three at most", () => {
  const hits = [
    { url: "https://d.test/a/#x", title: "A › X", text: "x".repeat(5000) },
    { url: "https://d.test/a/#y", title: "A › Y", text: "y".repeat(5000) },
    { url: "https://d.test/b/", title: "B", text: "b".repeat(5000) },
    { url: "https://d.test/c/", title: "C", text: "c" },
    { url: "https://d.test/d/", title: "D", text: "d" },
  ];
  const pages = local(toPages(hits, [], 9000));
  assert.ok(pages.reduce((n, p) => n + p.text.length, 0) <= 9000);
  assert.equal(pages[0].text.length, 4000);
  const all = local(toPages(hits, [], 20000));
  assert.deepEqual(local(sourcesOf(all)).map((s) => s.title), ["A › X", "B", "C"]);
});

test("buildBody: passages as input parts, the via label, and the 32,000 limit", () => {
  const config = readConfig({ key: "ot_k" }, "");
  const pages = [{ title: "Deploy", url: "https://d.test/deploy/", text: "Use gh-deploy." }, { title: "No link", url: "", text: "Text." }];
  const body = local(buildBody(config, "ot_k", "How do I deploy?", [], pages, "ask-docs-mkdocs"));
  assert.equal(body.key, "ot_k");
  assert.equal(body.via, "ask-docs-mkdocs");
  assert.equal(body.system, RULES);
  assert.equal(body.stream, true);
  assert.ok(body.prompt.startsWith("How do I deploy?"));
  assert.deepEqual(body.input, [{ type: "text", text: "Page: Deploy (https://d.test/deploy/)\nUse gh-deploy." }, { type: "text", text: "Page: No link\nText." }]);
  assert.equal(body.history, undefined);

  const mine = readConfig({ key: "ot_k", ref: "docusaurus-onetag", rules: "Be brief." }, "");
  const big = Array.from({ length: 8 }, (_, i) => ({ title: "P" + i, url: "", text: "z".repeat(4000) }));
  const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "h".repeat(2500) }));
  const full = local(buildBody(mine, "ot_k", "q".repeat(400), history, big, "ask-docs-page"));
  assert.equal(full.via, "docusaurus-onetag");
  assert.equal(full.system, "Be brief.");
  const size = full.prompt.length + full.system.length + full.input.reduce((n, p) => n + p.text.length, 0) + full.history.reduce((n, m) => n + 20 + m.content.length, 0);
  assert.ok(size <= 32000, "size " + size);
  assert.ok(full.history.length <= 6 && full.history.length % 2 === 0);
  assert.ok(full.input.reduce((n, p) => n + p.text.length, 0) <= 20000);
});

test("parseSSE keeps the unfinished tail", () => {
  const { events, rest } = parseSSE('data: {"delta":"a"}\n\ndata: {"done":true}\n\ndata: {"del');
  assert.deepEqual(local(events), [{ delta: "a" }, { done: true }]);
  assert.equal(rest, 'data: {"del');
});

test("parseAnswer: paragraphs, fenced code (also while still open), inline code, bold, links", () => {
  const text = "Run `mkdocs build` and **then** see [the guide](/guide/).\n\n```yaml\nsite_name: x\n```\n\nDone.";
  assert.deepEqual(local(parseAnswer(text)), [
    { spans: [{ text: "Run " }, { code: "mkdocs build" }, { text: " and " }, { bold: "then" }, { text: " see " }, { link: "the guide", href: "/guide/" }, { text: "." }] },
    { code: "site_name: x" },
    { spans: [{ text: "Done." }] },
  ]);
  assert.deepEqual(local(parseAnswer("Use:\n\n```\npip install")), [{ spans: [{ text: "Use:" }] }, { code: "pip install" }]);
  assert.deepEqual(local(parseAnswer("")), []);
});

test("parseAnswer: a Markdown table becomes rows of cells, the header first", () => {
  const text = "Every option:\n\n| Option | Default |\n| --- | :-: |\n| `position` | `auto` |\n| `a|b` | x \\| y |\n\nThat is all.";
  assert.deepEqual(local(parseAnswer(text)), [
    { spans: [{ text: "Every option:" }] },
    { table: [
      [[{ text: "Option" }], [{ text: "Default" }]],
      [[{ code: "position" }], [{ code: "auto" }]],
      [[{ code: "a|b" }], [{ text: "x | y" }]],
    ] },
    { spans: [{ text: "That is all." }] },
  ]);
  // no blank line before the table, and the last row still arriving
  assert.deepEqual(local(parseAnswer("Options:\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3")), [
    { spans: [{ text: "Options:" }] },
    { table: [[[{ text: "A" }], [{ text: "B" }]], [[{ text: "1" }], [{ text: "2" }]], [[{ text: "3" }]]] },
  ]);
  // a bar without the rule under it is ordinary text, and so is a table inside a code block
  assert.deepEqual(local(parseAnswer("| not a table |")), [{ spans: [{ text: "| not a table |" }] }]);
  assert.deepEqual(local(parseAnswer("```\n| A |\n| - |\n```")), [{ code: "| A |\n| - |" }]);
});

test("cut does not split a surrogate pair", () => {
  assert.equal(cut("ab😀", 3), "ab");
  assert.equal(cut("abc", 0), "");
});

test("no key: the demo key on localhost only", () => {
  // The module keeps the key private; the wiring is visible through what a deployed page warns about.
  assert.equal(load({}, "https://onetagai.com/ask-docs.js", "en", "localhost").version, api.version);
  assert.equal(api._internal.DEMO_KEY, "ot_demo000000000000000000000");
});

test("withIntros: the opening of the page follows each of the three best sections, once", () => {
  const intro = { url: "https://d.test/options/", title: "Options", text: "Every option is a query parameter." };
  const other = { url: "https://d.test/faq/", title: "FAQ", text: "Questions." };
  const intros = new Map([[intro.url, intro], [other.url, other]]);
  const a = { url: "https://d.test/options/#button", title: "Options › Button", text: "position=float" };
  const b = { url: "https://d.test/options/#colour", title: "Options › Colour", text: "color=ff6600" };
  const c = { url: "https://d.test/install/#key", title: "Install › Key", text: "No opening text on this page." };
  const d = { url: "https://d.test/faq/#safe", title: "FAQ › Safe", text: "Fourth: its page opening is not added." };
  assert.deepEqual(withIntros([a, b, c, d], intros).map((e) => e.title), ["Options › Button", "Options", "Options › Colour", "Install › Key", "FAQ › Safe"]);
  assert.deepEqual(withIntros([intro, a], intros).map((e) => e.title), ["Options", "Options › Button"]);
  assert.deepEqual(withIntros([], intros), []);
});

test("readSaved: the last exchange comes back only on the site it was asked on, and only in a safe shape", () => {
  const state = {
    base: "https://docs.example.com/guide/", question: "How do I install it?", answer: "Run `pip install it`.",
    history: [{ role: "user", content: "How do I install it?" }, { role: "assistant", content: "Run `pip install it`." }, { role: "system", content: "x" }, null],
    sources: [{ title: "Install", url: "https://docs.example.com/guide/install/" }, { title: "Bad", url: "javascript:alert(1)" }, { url: "https://x.test/" }],
  };
  const got = local(readSaved(JSON.stringify(state), "https://docs.example.com/guide/install/#pip"));
  assert.equal(got.question, "How do I install it?");
  assert.equal(got.answer, "Run `pip install it`.");
  assert.deepEqual(got.history.map((m) => m.role), ["user", "assistant"]);
  assert.deepEqual(got.sources, [{ title: "Install", url: "https://docs.example.com/guide/install/" }, { title: "Bad", url: "" }]);
  assert.equal(readSaved(JSON.stringify(state), "https://docs.example.com/other-project/"), null);
  assert.equal(readSaved(JSON.stringify({ ...state, base: "" }), "https://docs.example.com/guide/"), null);
  assert.equal(readSaved("{not json", "https://docs.example.com/guide/"), null);
  assert.equal(readSaved(null, "https://docs.example.com/guide/"), null);
  assert.equal(readSaved(JSON.stringify({ base: "https://docs.example.com/", question: 1, answer: "a" }), "https://docs.example.com/"), null);
});

// A document with only what placementIn looks at.
function fakeDoc({ material, navbar, hydrated, readyState }) {
  const search = { name: "search" };
  const right = navbar ? { querySelector: (sel) => (sel.includes("navbarSearchContainer") ? search : null) } : null;
  const inner = material ? { querySelector: () => null } : null;
  return {
    readyState: readyState || "complete",
    documentElement: { getAttribute: (name) => (name === "data-has-hydrated" && hydrated !== undefined ? hydrated : null) },
    querySelector: (sel) => (sel === ".md-header__inner" ? inner : sel.includes("navbar__items--right") ? right : null),
    search, right,
  };
}

test("placement: Docusaurus gets the button in the navbar, before the search box, once React has hydrated", () => {
  const { placementIn } = api._internal;
  const before = fakeDoc({ navbar: true, hydrated: "false" });
  assert.deepEqual(local(placementIn(before, "auto")), { wait: true });
  const after = fakeDoc({ navbar: true, hydrated: "true" });
  const spot = placementIn(after, "auto");
  assert.equal(spot.parent, after.right);
  assert.equal(spot.before, after.search);
});

test("placement: a Docusaurus without the hydration flag waits for the page to finish loading", () => {
  const { placementIn } = api._internal;
  assert.deepEqual(local(placementIn(fakeDoc({ navbar: true, readyState: "interactive" }), "auto")), { wait: true });
  const done = fakeDoc({ navbar: true, readyState: "complete" });
  assert.equal(placementIn(done, "auto").parent, done.right);
});

test("placement: float and none are respected, and an unknown theme floats", () => {
  const { placementIn } = api._internal;
  assert.deepEqual(local(placementIn(fakeDoc({ navbar: true, hydrated: "true" }), "float")), { float: true });
  assert.equal(placementIn(fakeDoc({ navbar: true, hydrated: "true" }), "none"), null);
  assert.deepEqual(local(placementIn(fakeDoc({}), "auto")), { float: true });
});
