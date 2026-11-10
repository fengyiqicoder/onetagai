# astro-onetag

An Ask AI box for Astro sites. Visitors type a question; the answer is written from your page, or from your whole site. The output stays static: no backend, no API key in your code.

```sh
npm install astro-onetag
```

```astro
---
import { AskAI } from "astro-onetag";
---

<AskAI />
```

It answers on localhost right away, on a shared demo key. Before you deploy, get your own free key (email only, 1,000,000 tokens a month):

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

```astro
<AskAI key="ot_..." />
```

Or set `PUBLIC_ONETAG_KEY` in `.env`. The key is meant to be public, like an analytics ID. Without one, a deployed site shows a line saying the box is not set up, and the build prints a warning.

## Answer from the whole site

```astro
<AskAI scope="site" />
```

This searches your [Pagefind](https://pagefind.app) index for the pages that match the question and answers from them, with links to the pages used. Build the index with [astro-pagefind](https://github.com/shishkin/astro-pagefind) or `npx pagefind --site dist`. In `astro dev` there is no index, so the current page is used.

## Props

| Prop | Default | What it does |
| --- | --- | --- |
| `key` | `PUBLIC_ONETAG_KEY` | Your OneTag AI key |
| `scope` | `"page"` | `"page"` answers from this page, `"site"` from the Pagefind index |
| `about` | `main`, else the body | CSS selector of the content to answer from |
| `title` | `"Ask this page"` | Text above the box; `""` leaves it out |
| `placeholder` | `"Type a question"` | Input placeholder |
| `label` | `"Ask"` | Button text |
| `rules` | see `AskAI.astro` | Instructions for the model: a persona, limits, a format |
| `maxTokens` | `400` | Cap on the answer length |
| `credit` | `true` | Show the "Powered by OneTag AI" line |

## Styling

The box takes the font and text color of the page around it. Three custom properties change the rest:

```css
.ask-ai {
  --ask-ai-accent: #0b5fff;
  --ask-ai-accent-text: #fff;
  --ask-ai-radius: 0;
}
```

## How it works

The question and the page text go from the browser to [OneTag AI](https://onetagai.com/?ref=astro-onetag) through the [`onetagai`](https://www.npmjs.com/package/onetagai) package, and the answer streams back into the box. The package is a separate chunk, fetched when a visitor focuses the input. Follow-up questions keep the last four exchanges. OneTag AI stores token counts and timestamps, not questions or page text.

For Starlight docs, use [starlight-onetag](https://github.com/fengyiqicoder/starlight-onetag): the same thing as a dialog next to the search box.

MIT
