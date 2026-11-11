# hexo-onetag

A Hexo plugin that writes `llms.txt` and `llms-full.txt` for your site, and adds an Ask AI box to every page. The two files are made from your posts and pages at build time and need no key. The box lets readers ask a question and get an answer written from your own posts, with links to the posts it used. There is no backend to run.

## Features

- **`llms.txt`**: an index of your posts and pages in the [llmstxt.org](https://llmstxt.org) shape. Site title, description, one link per page with a one-line summary.
- **`llms-full.txt`**: the text of every post and page in one file, as Markdown, each under its own heading with a `Source:` link.
- Both files are part of `hexo generate` and `hexo server`. No key, no network.
- Archive, category, tag and index pages are left out: they only repeat your posts.
- Code blocks come out as fenced code, not as Hexo's line-number tables.
- **Ask AI box**: one script tag before `</body>` on every page, with any theme. It reads `llms-full.txt` in the reader's browser and answers from it.

## Install

```sh
npm install hexo-onetag
```

Hexo loads it on its own. Run `hexo generate` (or `hexo server`) and look at `public/llms.txt`.

Set `url` in `_config.yml` to your site's public address (for a subfolder site, `url: https://example.com/blog` and `root: /blog/`). The links in both files are built from it.

## Before you deploy: get a free key

Without a key the box uses a demo key that answers on localhost only. Get your own key with one request. Use your email; the key arrives in that inbox:

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

Then add it to `_config.yml`:

```yaml
onetag:
  key: ot_...
```

Or set the `ONETAG_KEY` environment variable in your build. The key is public by design: it ends up in the built HTML, like an analytics ID. The free plan has 1,000,000 tokens, one time, with a hard cap, so no bill can appear.

## Options

All options go under `onetag:` in the site's `_config.yml`. `snake_case` and `camelCase` names both work.

```yaml
onetag:
  key: ot_...
  label: Ask the blog
  position: left
  exclude:
    - "drafts/**"
```

| Option | Default | What it does |
| --- | --- | --- |
| `key` | `ONETAG_KEY`, else the demo key | Your OneTag AI site key |
| `ask_ai` | `true` | `false` writes the llms files only, with no box |
| `llms` | `true` | `false` adds the box only. Use it when another plugin already writes `llms.txt` |
| `label` | `Ask AI` | Text on the button and at the top of the box |
| `placeholder` | `Ask a question about these docs` | Text in the empty question field |
| `position` | `auto` | `auto`, `float`, `left` or `none` |
| `button` | none | CSS selector of your own element that opens the box |
| `color` | the theme's accent | Accent color as hex, for example `ff6600` |
| `theme` | follows the page | `light` or `dark` |
| `lang` | the page's language | Language of the box's own text: `en`, `zh-CN`, `zh-TW` |
| `rules` | built in | Replaces the instructions the AI gets |
| `exclude` | none | Globs of post and page paths to leave out of the llms files, for example `"2019/**"` |
| `site` | `url` and `root` | Public address used for the links, when it differs from `url` |

A post or page with `llms: false` or `sitemap: false` in its front matter is left out of the llms files.

From JavaScript on your pages: `onetagAskDocs.open()`, `onetagAskDocs.close()`, `onetagAskDocs.ask("How do I deploy?")`.

## How it works

- A Hexo generator builds `llms.txt` and `llms-full.txt` from `site.posts` and `site.pages`. It uses the body Hexo already rendered for each post, so menus, sidebars and widgets of the theme are not in the text. Posts come newest first, after the pages. The text is made by [static-llms-txt](https://www.npmjs.com/package/static-llms-txt).
- If you keep your own `source/llms.txt` or `source/llms-full.txt`, Hexo copies it as it is and this plugin does not write that file.
- A Hexo injector (`body_end`) adds this tag to every page:

```html
<script async src="https://onetagai.com/ask-docs.js" data-key="ot_..." data-ref="hexo-onetag"></script>
```

- When a reader asks, the script fetches `llms-full.txt`, picks the parts that match the question, and sends them with it to [OneTag AI](https://onetagai.com/?ref=hexo-onetag). The answer streams back with links to the posts used. Nothing is sent before a reader asks.

## Works without a key

With no key you still get both llms files, in every build. The box is on every page and answers on `localhost`, so you can try it with `hexo server`. The build prints one warning with the signup command and never fails for a missing key.

## License

MIT
