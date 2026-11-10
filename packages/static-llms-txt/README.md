# static-llms-txt

Write `llms.txt` and `llms-full.txt` for any static site, from the HTML it already built.

Most llms.txt generators are tied to one framework and read its Markdown sources. This one reads the output folder, so it works after Eleventy, Hugo, Jekyll, Astro, Gatsby, Docusaurus, MkDocs, a hand-written site, or anything else that ends in `.html` files.

- **`llms.txt`**: an index in the [llmstxt.org](https://llmstxt.org) shape. Title, summary, one link per page with its description.
- **`llms-full.txt`**: the main content of every page as Markdown in one file, each page under its own heading with a `Source:` link.
- **No network, no API key, no config file.** One dependency (`node-html-parser`).
- Skips what should not be there: navigation, footers, scripts, `noindex` pages, redirects, 404 pages.
- Leaves an `llms.txt` you wrote by hand alone.

## Use it from the command line

```sh
npx static-llms-txt ./dist --site https://example.com
```

Put it after your build:

```json
{
  "scripts": {
    "build": "eleventy && static-llms-txt _site --site https://example.com"
  }
}
```

| Option | What it does |
| --- | --- |
| `--site <url>` | Public address of the site. Makes every link absolute. Without it, the page's canonical link is used. |
| `--title <text>` | Site title. Default: taken from the home page. |
| `--description <text>` | One-line summary. Default: the home page meta description. |
| `--content <selector>` | CSS selector of the main content. Default: `main`, then `article`, then `body`. |
| `--exclude <glob>` | Skip matching files, for example `"tags/**"`. Repeatable. |
| `--clean-urls` | Link `/about` instead of `/about.html`. |
| `--no-full` | Write `llms.txt` only. |
| `--force` | Overwrite an `llms.txt` this tool did not write. |
| `--ask-ai` | Also add an Ask AI box to every page. See below. |

## Use it from code

```js
import { generate } from "static-llms-txt";

const result = generate("./dist", {
  site: "https://example.com",
  exclude: ["tags/**", "drafts/**"],
});
console.log(result.pages.length, "pages", result.written);
```

CommonJS works too: `const { generate } = require("static-llms-txt")`.

| Function | What it does |
| --- | --- |
| `generate(dir, options)` | Scan a folder and write both files into it. Returns `{ pages, llms, llmsFull, written, skipped }`. |
| `scan(dir, options)` | Read every page. Returns `[{ url, path, title, description, sections, text }]`. |
| `build(pages, options)` | Turn a list of pages (from `scan`, or your own `{ url, title, html }` objects) into the text of both files, without touching the disk. |
| `readHtml(html, options)` | One HTML document to title, description and Markdown content. |
| `inject(dir, options)` / `scriptTag(options)` | The optional Ask AI part. |

Options for `generate` and `scan`: `site`, `title`, `description`, `content`, `remove` (extra selectors to drop), `exclude` (globs), `cleanUrls`, `minLength` (default 40 characters), `full`, `force`, `out`, `write`. Types are included.

## What the output looks like

`llms.txt`

```md
# Acme Docs

> Acme makes anvils.

## Pages

- [Acme](https://acme.dev/): Acme makes anvils.
- [Guide](https://acme.dev/guide/): How to start.

## Optional

- [Full text of every page](https://acme.dev/llms-full.txt)
```

`llms-full.txt`

```md
# Guide

Source: https://acme.dev/guide/

Start here with the guide.

## Step one

Source: https://acme.dev/guide/#step-one

Unpack the anvil carefully.
```

## Optional: an Ask AI box that answers from llms-full.txt

Once the site has an `llms-full.txt`, a single script tag can answer visitor questions from it. `--ask-ai` adds that tag to every page:

```sh
npx static-llms-txt ./dist --site https://example.com --ask-ai --key YOUR_ONETAG_KEY
```

The box is [OneTag AI](https://onetagai.com/?ref=static-llms-txt)'s open-source `ask-docs.js`. It finds the pages that match the question in `llms-full.txt`, sends them with the question to the OneTag AI API, and shows the answer with links to the pages it used. There is no backend to run.

The key is a site key. It is public by design, like an analytics ID, and it ends up in the built HTML. The free plan is 1,000,000 tokens a month with a hard cap: when it runs out the box says so, and no bill can appear. Get one without opening a browser:

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Without `--key` the tool uses a demo key that answers on localhost only, so you can try it before signing up. Everything above this section works without OneTag AI.

## Framework plugins built on this

- `eleventy-plugin-onetag` for Eleventy
- `docusaurus-plugin-onetag` for Docusaurus
- `gatsby-plugin-onetag` for Gatsby
- `hexo-onetag` for Hexo
- `vitepress-plugin-onetag` for VitePress
- `nuxt-onetag` for Nuxt
- [`astro-onetag`](https://www.npmjs.com/package/astro-onetag) and [`starlight-onetag`](https://www.npmjs.com/package/starlight-onetag) for Astro

## License

MIT
