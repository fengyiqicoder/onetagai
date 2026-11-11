# vitepress-onetag

Wrap your VitePress config in `withOnetag()` and the build writes `llms.txt` and `llms-full.txt` next to your pages, and every page gets an Ask AI box. Visitors type a question and get an answer written from your docs, with links to the pages it used. The site stays static: there is no backend to run.

## Features

- **`llms.txt`**: an index of every page in the [llmstxt.org](https://llmstxt.org) shape, with titles, descriptions and links. No key and no network needed.
- **`llms-full.txt`**: the text of every page as clean Markdown in one file. Header anchor links, code block labels, line numbers and the theme's navigation are left out.
- Both files respect `base`, `cleanUrls`, the site title and description, and `sitemap.hostname`.
- **An Ask AI box** on every page, in dev and in the build. It answers from `llms-full.txt`.
- A floating button by default. An optional "Ask AI" button in the nav bar, next to search.
- Works next to `vitepress-plugin-llms`: set `llms: false`.

## Install

```sh
npm install vitepress-onetag
```

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress'
import { withOnetag } from 'vitepress-onetag'

export default withOnetag(defineConfig({
  title: 'My Docs',
  // the rest of your config
}), { key: process.env.ONETAG_KEY })
```

Run `vitepress build` and look in `.vitepress/dist` for `llms.txt` and `llms-full.txt`.

### Put the button in the nav bar

The floating button needs no setup. To open the box from the nav bar instead, add a theme file and hide the floating button:

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import { withAskAiButton } from 'vitepress-onetag/theme'

export default withAskAiButton(DefaultTheme)
```

```ts
// .vitepress/config.ts
export default withOnetag(defineConfig({ /* ... */ }), { position: 'none' })
```

The button goes into the default theme's `nav-bar-content-after` slot. Change the text with `withAskAiButton(DefaultTheme, { label: 'Ask the docs' })`, or the slot with `{ slot: 'nav-bar-content-before' }`. If you already have your own `Layout`, import `AskAiButton` from `vitepress-onetag/theme` and place it in any slot yourself. The button calls `onetagAskDocs.open()`.

### With vitepress-plugin-llms

If `vitepress-plugin-llms` already writes your llms files, keep it and add only the box:

```ts
import llmstxt from 'vitepress-plugin-llms'

export default withOnetag(defineConfig({
  vite: { plugins: [llmstxt()] },
}), { llms: false })
```

The box finds the `llms-full.txt` that plugin writes at the site base.

## Before you deploy: get a free key

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Pass it as `key`, or set the `ONETAG_KEY` environment variable in your build. The key is a site key. It is public by design, like an analytics ID, and it ends up in the built HTML. The free plan is 1,000,000 tokens, one time, with a hard cap: when it runs out the box says so, and no bill can appear.

## Options

The second argument of `withOnetag(config, options)`.

| Option | Default | What it does |
| --- | --- | --- |
| `key` | env `ONETAG_KEY` | Your OneTag AI site key. |
| `site` | `sitemap.hostname` | Public address, for example `https://example.com`. Makes the links in the llms files absolute. Without it they are paths that start at `base`. |
| `askAi` | `true` | `false` writes the llms files only, with no box. |
| `llms` | `true` | `false` adds the box only, for sites that use another llms.txt plugin. |
| `label` | `Ask AI` | Text on the button and at the top of the box. |
| `placeholder` | | Text in the empty question field. |
| `position` | `auto` | `auto`, `float`, `left` or `none`. Use `none` with the nav button. |
| `button` | | CSS selector of your own element that opens the box. |
| `color` | theme accent | Accent color as hex, for example `ff6600`. |
| `theme` | follows the page | `light` or `dark`. |
| `lang` | the page language | Language of the box's own text: `en`, `zh-CN`, `zh-TW`. |
| `rules` | | Replaces the instructions the AI gets. |
| `index` | `<base>llms-full.txt` in a build | Address of the index, when it is somewhere else. |
| `exclude` | | Globs of built files to leave out of the llms files, for example `"drafts/**"`. |
| `remove` | | Extra CSS selectors to drop from every page in `llms-full.txt`. |
| `title`, `description` | the VitePress ones | Title and summary at the top of `llms.txt`. |

## How it works

`withOnetag()` changes your config object and returns it:

- It adds one `<script async src="https://onetagai.com/ask-docs.js">` entry to `head`, so the box is on every page in `vitepress dev` and in the build.
- It adds a `buildEnd` hook. Your own `buildEnd` still runs first. The hook reads the built HTML in `outDir` with [`static-llms-txt`](https://www.npmjs.com/package/static-llms-txt), takes the text inside `.vp-doc` (or the home page hero and features), and writes `llms.txt` and `llms-full.txt`. An `llms.txt` it did not write, for example one in `public/`, is left alone.

When a visitor asks, the box picks the passages of `llms-full.txt` that match the question and sends them with the question to [OneTag AI](https://onetagai.com/?ref=vitepress-onetag). The answer streams back with links to the pages used. In `vitepress dev` there is no `llms-full.txt`, so the box answers from the current page.

## Works without a key

With no key the build still succeeds and prints one warning. You get both llms files, which need no key at all, and the box answers on localhost through a demo key. On a deployed site the box needs your own key. To skip the box completely, set `askAi: false`.

## License

MIT
