# nuxt-onetag

A Nuxt module for Nuxt 3 and Nuxt 4. When you prerender your site with `nuxi generate`, it writes `llms.txt` and `llms-full.txt` from the pages Nuxt built. It also adds an Ask AI box to every page. Visitors type a question, and the answer is written from your own pages, with links to the pages it used. There is no backend to run.

## Features

- **`llms.txt`**: an index of your pages in the [llmstxt.org](https://llmstxt.org) shape. No key and no network needed.
- **`llms-full.txt`**: the main text of every page as Markdown in one file. No key and no network needed.
- **Ask AI box**: one script tag in the head of every page, added through `app.head`. It answers from `llms-full.txt`.
- **`useAskAI()`**: an auto-imported composable to open the box or ask a question from your own code.

## Install

```sh
npm install nuxt-onetag
```

Add it to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-onetag'],
  onetag: {
    key: process.env.ONETAG_KEY,
    site: 'https://example.com',
  },
})
```

Then build a static site:

```sh
npx nuxi generate
```

`.output/public/llms.txt` and `.output/public/llms-full.txt` are written after the pages are prerendered.

## Before you deploy: get a free key

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Put the key in the `key` option or in the `ONETAG_KEY` environment variable. The key is public by design. It ends up in the built HTML, like an analytics ID. The free plan is 1,000,000 tokens, one time, with a hard cap, so no bill can appear.

## Options

All options go under `onetag` in `nuxt.config.ts`.

| Option | Default | What it does |
| --- | --- | --- |
| `key` | `ONETAG_KEY` env variable | Your OneTag AI site key. Without one, the demo key is used. |
| `site` | `site.url`, then `runtimeConfig.public.siteUrl` | Public address of the site. Makes the links in the llms files absolute. `app.baseURL` is added for you. |
| `askAi` | `true` | `false` adds no box and only writes the llms files. |
| `llms` | `true` | `false` writes no llms files and only adds the box. Use it when another module already writes `llms.txt`. |
| `label` | `"Ask AI"` | Text of the button. |
| `placeholder` | | Placeholder of the question input. |
| `position` | `"auto"` | `"float"`, `"left"` or `"none"`. `"none"` shows no button: open the box with `button` or `useAskAI()`. |
| `button` | | CSS selector of your own button that opens the box. |
| `color` | follows the page | Accent color as hex, for example `"0b5fff"`. |
| `theme` | follows the page | `"light"` or `"dark"`. |
| `lang` | the page language | `"en"`, `"zh-CN"` or `"zh-TW"`. |
| `rules` | | Instructions for the model: a persona, limits, a format. |
| `exclude` | | Globs of output files to leave out of the llms files, for example `"tags/**"`. |

## Open the box from your code

`useAskAI()` is auto-imported. It does nothing on the server.

```vue
<script setup lang="ts">
const { open, close, ask } = useAskAI()
</script>

<template>
  <button type="button" @click="ask('How do I install it?')">Ask about installing</button>
</template>
```

## How it works

- The module adds `<script async src="https://onetagai.com/ask-docs.js" data-key="..." data-ref="nuxt-onetag">` to `app.head.script`, so Nuxt renders it in the head of every page, in dev, SSR and static builds.
- After Nitro has prerendered every route (the `prerender:done` hook), the module reads the HTML files in the public output folder with [`static-llms-txt`](https://www.npmjs.com/package/static-llms-txt) and writes both llms files next to them. The SPA fallback `200.html` and the error pages are left out.
- An `llms.txt` you wrote yourself in `public/` is kept.
- With `nuxi build` and nothing prerendered, there is no HTML to read. The module prints one info line and writes no llms files. Prerender routes with `routeRules` or `nitro.prerender.routes` to get them.
- In the browser, [OneTag AI](https://onetagai.com/?ref=nuxt-onetag)'s `ask-docs.js` finds the pages that match a question in `llms-full.txt` and sends them with the question to the OneTag AI API. The answer streams into the box.

## Works without a key

With no key you still get both llms files on every `nuxi generate`. The Ask AI box uses a demo key that answers on localhost only, so you can try it with `nuxi dev`. The build prints one warning with the signup command and does not fail.

## Development

```sh
npm install
npm test               # unit tests of the option and llms logic, no Nuxt build needed
npm run build          # builds dist/ with nuxt-module-build
npm run dev:generate   # real build check: nuxi generate on the playground
```

After `npm run dev:generate`, `playground/.output/public` holds `llms.txt`, `llms-full.txt`, and pages with one `ask-docs.js` tag each.

## License

MIT
