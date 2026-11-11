# svelte-onetag

A Svelte component that adds an Ask AI box to your site. Visitors type a question, and the answer is written from your own pages, with links to the pages it used. There is no backend to run. For SvelteKit static sites, the `static-llms-txt` command writes `llms.txt` and `llms-full.txt` after `vite build`, and the box answers from them.

Works with Svelte 5 and Svelte 4, in SvelteKit or any Svelte app.

## Features

- **`llms.txt` and `llms-full.txt`** for `adapter-static` sites, from one command after the build. No key and no network needed.
- **Ask AI box**: `<AskAI />` loads OneTag AI's `ask-docs.js` once in the browser. It renders nothing of its own unless you give it button content.
- **`open()`, `close()`, `ask(question)`**: control the box from your own code.

## Install

```sh
npm install svelte-onetag
npm install -D static-llms-txt
```

Put the component in your root layout, `src/routes/+layout.svelte`:

```svelte
<script>
  import { AskAI } from 'svelte-onetag';
  let { children } = $props();
</script>

<AskAI key="ot_..." />
{@render children()}
```

Then write the llms files after the build. For `adapter-static`, the output folder is `build`:

```json
{
  "scripts": {
    "build": "vite build && static-llms-txt build --site https://example.com --clean-urls"
  }
}
```

`--clean-urls` links `/about` instead of `/about.html`, which matches SvelteKit's default `trailingSlash: 'never'`. With `trailingSlash: 'always'`, leave it out.

## Before you deploy: get a free key

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

The key is public by design. It ends up in the built JavaScript, like an analytics ID, so you can write it in the layout. To keep it in `.env` instead, set `PUBLIC_ONETAG_KEY` and pass it in:

```svelte
<script>
  import { AskAI } from 'svelte-onetag';
  import { PUBLIC_ONETAG_KEY } from '$env/static/public';
</script>

<AskAI key={PUBLIC_ONETAG_KEY} />
```

The free plan is 1,000,000 tokens, one time, with a hard cap, so no bill can appear.

## Options

Props of `<AskAI>`. Each one becomes a `data-*` attribute of the script tag.

| Prop | Default | What it does |
| --- | --- | --- |
| `key` | demo key | Your OneTag AI site key. The demo key answers on localhost only. |
| `label` | `"Ask AI"` | Text of the widget's button. |
| `placeholder` | | Placeholder of the question input. |
| `position` | `"auto"`, or `"none"` with button content | `"float"`, `"left"` or `"none"`. `"none"` shows no widget button. |
| `button` | | CSS selector of your own element that opens the box. |
| `color` | follows the page | Accent color as hex, for example `"0b5fff"`. |
| `theme` | follows the page | `"light"` or `"dark"`. |
| `lang` | the page language | `"en"`, `"zh-CN"` or `"zh-TW"`. |
| `rules` | | Instructions for the model: a persona, limits, a format. |
| `index` | found on its own | Address of the index, when it is not at the usual place. |
| `class` | | Class of the button rendered around your content. |

Options of the `static-llms-txt` command: `--site`, `--title`, `--description`, `--content`, `--exclude <glob>` (repeatable), `--clean-urls`, `--no-full`, `--force`. See its [README](https://www.npmjs.com/package/static-llms-txt).

The two parts are separate. For the llms files only, leave out `<AskAI>`. For the box only, leave out the `static-llms-txt` step, for example when another tool already writes `llms.txt`.

## Your own button

Give the component content and it renders a button that opens the box. The widget's floating button is then hidden.

```svelte
<AskAI key="ot_..." class="ask">Ask AI</AskAI>
```

Or call the helpers from anywhere:

```svelte
<script>
  import { ask, open } from 'svelte-onetag';
</script>

<button type="button" onclick={() => ask('How do I install it?')}>Ask about installing</button>
```

`open()`, `close()` and `ask(question)` do nothing on the server. When the script is still loading, they run once it has loaded.

## How it works

- In `onMount`, the component adds `<script async src="https://onetagai.com/ask-docs.js" data-key="..." data-ref="svelte-onetag">` to the head. It does this once: a second `<AskAI>`, a remount after client navigation, or a tag you put in `app.html` adds nothing.
- The script tag is added in the browser, so it is not in the prerendered HTML. The box stays on the page across client navigation.
- `static-llms-txt` reads the prerendered HTML in `build/` and writes `llms.txt` and `llms-full.txt` next to it. Navigation, footers, scripts and the 404 page are left out.
- In the browser, [OneTag AI](https://onetagai.com/?ref=svelte-onetag)'s `ask-docs.js` finds the pages that match a question in `llms-full.txt` and sends them with the question to the OneTag AI API. The answer streams into the box.
- A SvelteKit site with server rendering has no prerendered HTML to read. Prerender the pages you want in the llms files, or run the box without them: it then answers from the page the visitor is on.

## Works without a key

With no key you still get both llms files from `static-llms-txt`. The box uses a demo key that answers on localhost only, so you can try it with `vite dev`. The browser console shows one warning with the signup command.

## Svelte versions

The component is written in the syntax that Svelte 4 and Svelte 5 share, so it compiles in both without warnings. It works in runes and non-runes components. Tested with Svelte 5.57 and SvelteKit 3.2, and compiled with Svelte 4.2.

## License

MIT
