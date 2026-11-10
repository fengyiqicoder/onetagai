# onetagai

AI for static sites without a backend. Call a model from the browser with a public key: no server, no secret in your code.

```sh
npm install onetagai
```

```js
import { ask } from "onetagai";

const summary = await ask("Summarize this page in two sentences", document.querySelector("article"));
```

It works on localhost right away, on a shared demo key. Before you deploy, get your own free key (email only, 1,000,000 tokens a month):

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

```js
import { configure } from "onetagai";

configure({ key: "ot_..." });
```

The key is meant to be public, like an analytics ID: it goes in your page source.

## ask(prompt, input?, options?)

Returns a promise of the answer as text.

`input` is what the prompt is about: a string, a DOM element (its text), a form (its fields), an image or `File`, any JSON value, or an array of those.

| Option | What it does |
| --- | --- |
| `stream` | A function called with each piece of the answer as it arrives |
| `json` | `true` parses the answer and returns the value |
| `system` | Instructions for the model: a persona, limits, a format |
| `history` | Earlier turns, `[{ role: "user" \| "assistant", content }]` |
| `maxTokens` | Cap on the answer length (default 500) |
| `signal` | An `AbortSignal` to cancel the call |

```js
// Stream into the page
await ask("Explain this error", log, { stream: (delta) => (output.textContent += delta) });

// Structured output
const { tags } = await ask("Return {\"tags\": string[]} for this post", post, { json: true });

// An image
const alt = await ask("Write alt text for this image", fileInput.files[0]);
```

A failed call rejects with a `OneTagError`. Its `code` is one of `no_key`, `bad_key`, `rate_limited`, `quota_exceeded`, `too_large`, `network`, `aborted` and a few more; its `message` says what to do.

## Without a bundler

The same SDK as one script tag:

```html
<script src="https://onetagai.com/v1.js" data-key="ot_..."></script>
<script>
  onetag.ask("Summarize this page", document.body).then(console.log);
</script>
```

## Links

- Docs: https://onetagai.com/docs
- For AI coding agents: https://onetagai.com/llms.txt
- Copy-paste blocks built on it: https://aiblock.onetagai.com

MIT
