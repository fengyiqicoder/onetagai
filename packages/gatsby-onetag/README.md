# gatsby-onetag

A Gatsby plugin that writes `llms.txt` and `llms-full.txt` into `public/` after the build, and adds an Ask AI box to every page. The box answers visitor questions from your own pages and links the pages it used. Your site stays static: there is no backend to run.

- **`llms.txt`**: an index of your pages in the [llmstxt.org](https://llmstxt.org) shape. Needs no key and no network.
- **`llms-full.txt`**: the main content of every page as Markdown in one file. Navigation, footers and scripts are left out, and so are 404 pages.
- **Ask AI box**: [OneTag AI](https://onetagai.com/?ref=gatsby-onetag)'s `ask-docs.js`, added before `</body>` of every page through Gatsby's `onRenderBody`. It answers from `llms-full.txt`, with or without a `pathPrefix`.
- Options are checked by Gatsby when it loads `gatsby-config.js`.

## Install

```sh
npm install gatsby-onetag
```

```js
// gatsby-config.js
module.exports = {
  siteMetadata: {
    title: "Anvil Co.",
    description: "Anvils for blacksmiths.",
    siteUrl: "https://example.com",
  },
  plugins: [
    { resolve: "gatsby-onetag", options: { key: process.env.ONETAG_KEY } },
  ],
};
```

Run `gatsby build`. `public/` now has `llms.txt` and `llms-full.txt`, and every page has the box.

## Before you deploy: get a free key

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Put the key in the `key` option, or in the `ONETAG_KEY` environment variable at build time. The key is public by design: it ends up in the built HTML, like an analytics ID. The free plan is 1,000,000 tokens a month with a hard cap. When it runs out the box says so, and no bill can appear.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `key` | `ONETAG_KEY` | Your OneTag AI site key. |
| `site` | `siteMetadata.siteUrl` | Public address of the site. Makes every link in the llms files absolute. |
| `askAi` | `true` | `false` writes the llms files only, with no box. |
| `llms` | `true` | `false` adds the box only. Use it when another plugin writes `llms.txt`. |
| `label` | `Ask AI` | Text on the button and at the top of the box. |
| `placeholder` | `Ask a question about these docs` | Text in the empty question field. |
| `position` | `auto` | Where the button goes: `auto`, `float`, `left` or `none`. |
| `button` | none | CSS selector of your own element that opens the box. |
| `color` | the page's accent | Accent color as hex, for example `0b5fff`. |
| `theme` | follows the page | `light` or `dark`. |
| `lang` | the page's language | Language of the box's own text: `en`, `zh-CN` or `zh-TW`. |
| `rules` | built in | Replaces the instructions the AI gets. |
| `exclude` | none | Globs of built files to leave out of the llms files, relative to `public/`, for example `"drafts/**"`. |

From your own code: `onetagAskDocs.open()`, `onetagAskDocs.close()` and `onetagAskDocs.ask("How do I order?")`.

## How it works

After `gatsby build`, the plugin reads the HTML of every page in `public/`. It keeps the `<main>` element of each page (the whole body when there is none), turns it into Markdown with [static-llms-txt](https://www.npmjs.com/package/static-llms-txt), and writes both files. The title and summary come from `siteMetadata.title` and `siteMetadata.description`. With `gatsby build --prefix-paths`, links and the script tag include your `pathPrefix`. An `llms.txt` this plugin did not write is left alone.

When a visitor asks a question, the box finds the matching sections in `llms-full.txt`, sends them with the question to the OneTag AI API, and streams the answer back with links to the pages it used. In `gatsby develop` there is no `llms-full.txt`, so the box answers from the current page.

## Works without a key

With no key the build still succeeds. You get both llms files, and the box on localhost, on a demo key. The build prints one warning that says so and shows the signup command. Run `gatsby serve` to try the box on the built site before you sign up.

## License

MIT
