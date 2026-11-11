# eleventy-onetag

An Eleventy plugin that writes `llms.txt` and `llms-full.txt` from the pages your site already built, and adds an Ask AI box to every page. Visitors type a question and get an answer written from your own pages, with links to them. The site stays static: there is no backend to run. Works with Eleventy 2 and 3.

- **`llms.txt`**: an index of your pages in the [llmstxt.org](https://llmstxt.org) shape. No key, no network.
- **`llms-full.txt`**: the main text of every page as Markdown in one file. No key, no network.
- **Ask AI box**: one script tag on every page. It finds the pages that match the question in `llms-full.txt` and answers from them.
- Leaves an `llms.txt` you wrote by hand alone.
- Follows your Eleventy `pathPrefix`.

## Install

```sh
npm install eleventy-onetag
```

`eleventy.config.js` (Eleventy 3, ESM):

```js
import onetag from "eleventy-onetag";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(onetag, { site: "https://example.com" });
}
```

`.eleventy.js` (Eleventy 2 or 3, CommonJS):

```js
const onetag = require("eleventy-onetag");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(onetag, { site: "https://example.com" });
};
```

Run `npx @11ty/eleventy`. The output folder now has `llms.txt` and `llms-full.txt`, and every page has the Ask AI box.

## Before you deploy: get a free key

Without a key the box uses a demo key that answers on localhost only. Get your own key by email, without opening a browser:

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

The key arrives in that inbox. Set it as the `ONETAG_KEY` environment variable in your build, or pass it as the `key` option. The key is public by design: it ends up in the built HTML, like an analytics ID. The free plan is 1,000,000 tokens, one time, with a hard cap. When it runs out the box says so, and no bill can appear.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `key` | `ONETAG_KEY` env variable | Your OneTag AI site key |
| `site` | none | Public address of the site, for example `https://example.com`. Makes every link in the llms files absolute. The `pathPrefix` is added for you. |
| `askAi` | `true` | `false` writes the llms files only |
| `llms` | `true` | `false` adds the box only, for sites that already use another llms.txt plugin |
| `label` | `"Ask AI"` | Button text |
| `placeholder` | `"Ask a question about these docs"` | Input placeholder |
| `position` | `"auto"` | `auto`, `float`, `left` or `none` |
| `button` | | CSS selector of your own button that opens the box |
| `color` | | Accent color as hex, for example `"0b5fff"` |
| `theme` | follows the page | `light` or `dark` |
| `lang` | page language | `en`, `zh-CN` or `zh-TW` |
| `rules` | | Instructions for the model: a persona, limits, a format |
| `index` | `<pathPrefix>llms-full.txt` | Address of the index the box answers from. Set it to use a Pagefind folder or another file. |
| `exclude` | | Globs of output files to skip, for example `"tags/**"`. Applies to the box and the llms files. |
| `title`, `description` | from the home page | Title and summary at the top of `llms.txt` |
| `content` | `main`, then `article`, then `body` | CSS selector of the main content of each page |
| `remove` | | Extra CSS selectors to drop from every page |
| `full` | `true` | `false` writes `llms.txt` only |
| `force` | `false` | Overwrite an `llms.txt` this plugin did not write |

## How it works

The box is an HTML transform: it adds `<script async src="https://onetagai.com/ask-docs.js" data-key="..." data-ref="eleventy-onetag" data-index="/llms-full.txt">` before `</body>` of every HTML page, once. After each build (the `eleventy.after` event) the plugin reads the built HTML with [static-llms-txt](https://www.npmjs.com/package/static-llms-txt) and writes both llms files into the output folder. In `--serve` it rewrites them only when their text changed, and an error there is logged, never thrown.

The tag also carries `data-index`, the address of your `llms-full.txt` with the path prefix, so the box loads it directly. In the browser, the script fetches that file when a visitor opens the box, picks the parts that match the question, and sends them with the question to [OneTag AI](https://onetagai.com/?ref=eleventy-onetag). The answer streams back into the box. On the page you can call `onetagAskDocs.open()`, `.close()` and `.ask("...")`.

## Works without a key

With no key you still get both llms files, written at every build, with no network call. The Ask AI box works on localhost with the demo key, so you can try it in `npx @11ty/eleventy --serve`. The build prints one warning and never fails over a missing key.

## License

MIT
