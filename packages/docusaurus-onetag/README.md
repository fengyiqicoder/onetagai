# docusaurus-onetag

A Docusaurus plugin that writes `llms.txt` and `llms-full.txt` into your build, and adds an Ask AI box to every page. The box answers visitor questions from your own docs and links the pages it used. Your site stays static: there is no backend to run.

- **`llms.txt`**: an index of your docs and blog posts in the [llmstxt.org](https://llmstxt.org) shape. Needs no key and no network.
- **`llms-full.txt`**: the text of every doc and post as Markdown in one file. The sidebar, table of contents, breadcrumbs, pagination, edit links and heading anchors are left out. Search, tag, archive and blog index pages are skipped.
- **Ask AI box**: [OneTag AI](https://onetagai.com/?ref=docusaurus-onetag)'s `ask-docs.js`, added before `</body>` of every page through Docusaurus's own `injectHtmlTags`. It answers from `llms-full.txt`, under any `baseUrl`.
- **Tools on the page**, each off until you name it: explain a code block, summarize a long page, ask about selected text, and an Ask AI row above the search results. See [Tools on the page](#tools-on-the-page).
- Works with i18n: each locale gets its own files and its own box.
- Types are included.

## Install

```sh
npm install docusaurus-onetag
```

```js
// docusaurus.config.js
export default {
  url: "https://example.com",
  baseUrl: "/",
  plugins: [["docusaurus-onetag", { key: process.env.ONETAG_KEY }]],
};
```

Run `npm run build`. The build folder now has `llms.txt` and `llms-full.txt`, and every page has the box.

## Before you deploy: get a free key

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Put the key in the `key` option, or in the `ONETAG_KEY` environment variable. The key is public by design: it ends up in the built HTML, like an analytics ID. The free plan is 1,000,000 tokens, one time, with a hard cap. When it runs out the box says so, and no bill can appear.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `key` | `ONETAG_KEY` | Your OneTag AI site key. |
| `askAi` | `true` | `false` writes the llms files only, with no box. |
| `llms` | `true` | `false` adds the box only. Use it when another plugin writes `llms.txt`. |
| `label` | `Ask AI` | Text on the button and at the top of the box. |
| `placeholder` | `Ask a question about these docs` | Text in the empty question field. |
| `position` | `auto` | Where the button goes: `auto`, `float`, `left` or `none`. |
| `button` | none | CSS selector of your own element that opens the box. |
| `color` | the theme's accent | Accent color as hex, for example `0b5fff`. |
| `theme` | follows the page | `light` or `dark`. |
| `lang` | the page's language | Language of the box's own text: `en`, `zh-CN` or `zh-TW`. |
| `rules` | built in | Replaces the instructions the AI gets. |
| `features` | `[]` | Tools on the page to turn on: `"explain"`, `"summary"`, `"selection"`, `"search"`. |
| `exclude` | none | Globs of built files to leave out of the llms files, relative to the build folder, for example `"docs/internal/**"`. |

Options are checked when Docusaurus loads the config. A wrong value stops the build with a message that names the option.

From your own code: `onetagAskDocs.open()`, `onetagAskDocs.close()` and `onetagAskDocs.ask("How do I deploy?")`.

### Tools on the page

The box answers questions about the whole site. Four smaller tools work on the page the reader is on. None is on until `features` names it:

```js
plugins: [
  ["docusaurus-onetag", {
    key: process.env.ONETAG_KEY,
    features: ["explain", "summary", "selection", "search"],
  }],
],
```

| Feature | What the reader gets |
| --- | --- |
| `explain` | An "Explain this code" button under every code block. |
| `summary` | A "Summarize this page" button under the title of long pages. |
| `selection` | Select any text, click "Ask AI", and get it explained in the context of the page. |
| `search` | An "Ask AI" row above the Algolia DocSearch results, which hands what the reader typed to the box. It needs the box, so it cannot be used with `askAi: false`. |

The tools come from OneTag AI's `docs-ai.js`, added as a second script tag with the same key and color. They use the same free tokens as the box, and only when a reader clicks.

### With docusaurus-plugin-llms

If you already use `docusaurus-plugin-llms` for your llms files, keep it and add only the box:

```js
plugins: [
  "docusaurus-plugin-llms",
  ["docusaurus-onetag", { key: process.env.ONETAG_KEY, llms: false }],
],
```

The box finds the `llms-full.txt` that plugin writes. This plugin never overwrites an `llms.txt` it did not write.

Set `url` in `docusaurus.config` to your real address before you deploy. The links in `llms-full.txt` and the sources the Ask AI box shows are built from it, and the build warns while it is still the template value.

## How it works

After the build, the plugin reads the built HTML of every page. It keeps the article of each doc, blog post and Markdown page, turns it into Markdown with [static-llms-txt](https://www.npmjs.com/package/static-llms-txt), and writes both files into the build folder. Links use your `url` and `baseUrl`. The title and summary come from `title` and `tagline`.

The script tag points the box at `<baseUrl>llms-full.txt`. When a visitor asks a question, the box finds the matching sections in that file, sends them with the question to the OneTag AI API, and streams the answer back with links to the pages it used. In `docusaurus start` there is no `llms-full.txt`, so the box answers from the current page.

## Works without a key

With no key the build still succeeds. You get both llms files, and the box on localhost, on a demo key. The build prints one warning that says so and shows the signup command. Run `npm run serve` to try the box on the built site before you sign up.

## License

MIT
