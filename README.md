# OneTag AI

Add AI to any static site with one script tag. No backend, no API key in your code.

```html
<script src="https://onetagai.com/v1.js" data-key="YOUR_ONETAG_KEY"></script>
<script type="module">
  const summary = await onetag.ask("Summarize in 3 bullets", document.body);
</script>
```

[Get a free key](https://onetagai.com/#get-key) (email only, 1,000,000 tokens, works on any number of sites) · [Docs](https://onetagai.com/docs) · [llms.txt](https://onetagai.com/llms.txt)

This repository holds the parts of OneTag AI you can link to or copy: the browser SDK and the components built on it. The hosted API (`https://onetagai.com/v1/ask`) is not in here.

## What is in the repo

| Path | What it is | How to use it |
| --- | --- | --- |
| `sdk/v1.js` | The browser SDK: `onetag.ask(prompt, input?, options?)`. Dependency-free, 3.8 KB gzipped. | `<script src="https://onetagai.com/v1.js" data-key="…">`, or from jsDelivr: `https://cdn.jsdelivr.net/gh/fengyiqicoder/onetagai@main/sdk/v1.js`, or copy the file into your site. It talks to `https://onetagai.com/v1/ask` wherever it is loaded from. |
| `sdk/widget.js` | The page widget: a floating "ask this page" button and chat, no code. Independent of `v1.js`, shadow DOM, 7 KB gzipped. | `<script async src="https://onetagai.com/widget.js" data-key="…">`. Options: [docs](https://onetagai.com/docs#widget). |
| `sdk/ask-docs.js` | Ask Docs: an Ask AI box for documentation sites that answers from the whole site, reading the index the site already publishes (MkDocs search index, Pagefind, `llms-full.txt`). Independent of `v1.js`, shadow DOM, 19 KB gzipped. | `<script async src="https://onetagai.com/ask-docs.js" data-key="…">`, or one line in `mkdocs.yml`. Options: [docs](https://onetagai.com/docs#ask-docs). |
| `sdk/docs-ai.js` | Docs AI: three reader tools for documentation sites: an "Explain this code" button under code blocks, a "Summarize this page" button, and "Ask AI" on selected text. Each one is off until it is named in `features`. Finds the content and code blocks in Material for MkDocs, Zensical, VitePress, Docusaurus and Starlight. Independent of `v1.js`, shadow DOM, 15 KB gzipped. | `<script async src="https://onetagai.com/docs-ai.js" data-key="…" data-features="explain,summary,selection">`. Options: the comment at the top of the file. |
| `sdk/test/` | The SDK's tests (`node --test sdk/test/*.test.mjs`) and a smoke page. | |
| `docs/llms.txt` | The whole API on one page, written for people and AI coding tools. | Paste it into your AI tool's context. |
| `packages/onetag` | The same SDK as an npm package, with types: `import { ask } from "onetagai"`. | `npm install onetagai`. [README](packages/onetag/README.md). |
| `packages/astro-onetag` | An Ask AI box for Astro sites: answers from the page, or from the whole site through Pagefind. | `npm install astro-onetag`, then `<AskAI />`. [README](packages/astro-onetag/README.md). |

For Starlight docs there is [starlight-onetag](https://github.com/fengyiqicoder/starlight-onetag), a plugin that adds Ask AI next to the search box. The npm packages answer on localhost without a key, on a shared demo key; a deployed site needs its own.

## onetag.ask in one minute

```js
// Text in, text out. input can be a string, an element, a <form>, an <img>, a File, an object, or an array of those.
const text = await onetag.ask("Translate to French", document.querySelector("#article"));

// Stream into the page.
await onetag.ask("Write a welcome line for this page", document.body, {
  stream: (delta) => { out.textContent += delta; },
});

// Get JSON back.
const product = await onetag.ask('Extract {"name": string, "price": number}', document.querySelector(".product"), { json: true });

// Errors throw onetag.OneTagError with .code (quota_exceeded, rate_limited, …), .message and .status.
```

Options: `stream`, `json`, `system`, `maxTokens` (≤ 10000), `history`, `signal`. Full reference in [docs/llms.txt](docs/llms.txt).

## Plans

- Free: $0, 1,000,000 tokens in total per account, no monthly reset, any domain, curl included.
- Pro: $9.9/month, 100,000,000 tokens a month, lock the key to your domain. [Upgrade](https://onetagai.com/#pro).

## 中文

OneTag AI 让任何静态网页贴一行 `<script>` 就能调用 AI，不用后端，页面里不放 API key。

```html
<script src="https://onetagai.com/v1.js" data-key="你的 key"></script>
<script type="module">
  const answer = await onetag.ask("用三句话总结这页", document.body);
</script>
```

免费：填邮箱领 key，每月 100 万 token（1 号重置），贴到任意数量的网站都能用。Pro：$9.9/月，每月 1 亿 token，可把 key 锁定到自己的域名。[领 key](https://onetagai.com/#get-key) · [文档](https://onetagai.com/docs)。

这个仓库放的是能直接链接或复制的部分：浏览器 SDK（`sdk/v1.js`，也可从 jsDelivr 加载）和基于它的组件。托管接口本身不在这里。

## License

MIT. See [LICENSE](LICENSE).
