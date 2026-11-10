// Loads OneTag AI's ask-docs.js once and talks to it. No Svelte in here, so it can be tested on its own.

export const NAME = "svelte-onetag";
export const SCRIPT = "https://onetagai.com/ask-docs.js";
export const DEMO_KEY = "ot_demo000000000000000000000";
export const SIGNUP = `curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;

/** Widget options passed as data-* attributes, in this order. */
export const OPTIONS = /** @type {const} */ (["label", "placeholder", "position", "button", "color", "theme", "lang", "rules", "index"]);

/**
 * @typedef {object} AskAIOptions
 * @property {string} [key] OneTag AI site key. Public by design. Default: the demo key, which answers on localhost only.
 * @property {string} [label] Text of the Ask AI button.
 * @property {string} [placeholder] Placeholder of the question input.
 * @property {"auto" | "float" | "left" | "none"} [position] Where the button goes. Default "auto" (floating).
 * @property {string} [button] CSS selector of your own element that opens the box.
 * @property {string} [color] Accent color as hex, with or without "#".
 * @property {"light" | "dark"} [theme] Default: follows the page.
 * @property {string} [lang] "en", "zh-CN" or "zh-TW". Default: the page language.
 * @property {string} [rules] Instructions for the model.
 * @property {string} [index] Address of the index when it is not found on its own.
 * @property {string} [src] Address of ask-docs.js. Default https://onetagai.com/ask-docs.js.
 */

/**
 * @typedef {object} AskDocs
 * @property {() => void} open
 * @property {() => void} close
 * @property {(question: string) => void} ask
 */

let warned = false;

/**
 * The attributes of the script tag, ref fixed to svelte-onetag.
 * @param {AskAIOptions} [options]
 * @returns {Record<string, string>}
 */
export function scriptAttributes(options = {}) {
  const key = String(options.key || "").trim() || DEMO_KEY;
  /** @type {Record<string, string>} */
  const attrs = { src: options.src || SCRIPT, "data-key": key, "data-ref": NAME };
  for (const name of OPTIONS) {
    const value = options[name];
    if (value === undefined || value === null || value === "") continue;
    attrs["data-" + name] = name === "color" ? String(value).replace(/^#/, "") : String(value);
  }
  return attrs;
}

/** @param {Document} doc */
function findScript(doc) {
  return doc.querySelector('script[src*="/ask-docs.js"]');
}

/**
 * Add the ask-docs.js script tag to the page once. A second call, a second component, or a tag
 * already in app.html changes nothing. Returns the script element, or null on the server.
 * @param {AskAIOptions} [options]
 * @param {Document} [doc]
 * @returns {HTMLScriptElement | null}
 */
export function load(options = {}, doc = typeof document === "undefined" ? undefined : document) {
  if (!doc) return null;
  const found = /** @type {HTMLScriptElement | null} */ (findScript(doc));
  if (found) return found;
  const attrs = scriptAttributes(options);
  if (attrs["data-key"] === DEMO_KEY && !warned) {
    warned = true;
    console.warn("[svelte-onetag] No key: the Ask AI box uses the demo key, which answers on localhost only. Get a free key before you deploy:\n  " + SIGNUP);
  }
  const script = doc.createElement("script");
  script.async = true;
  for (const [name, value] of Object.entries(attrs)) script.setAttribute(name, value);
  (doc.head || doc.body).appendChild(script);
  return script;
}

/**
 * Run fn with the box, now when it is loaded, else once the script has loaded.
 * @param {(box: AskDocs) => void} fn
 */
function withBox(fn) {
  if (typeof window === "undefined") return;
  const w = /** @type {Window & { onetagAskDocs?: AskDocs }} */ (window);
  if (w.onetagAskDocs) return fn(w.onetagAskDocs);
  const script = typeof document === "undefined" ? null : findScript(document);
  if (script) script.addEventListener("load", () => { if (w.onetagAskDocs) fn(w.onetagAskDocs); }, { once: true });
}

/** Open the Ask AI box. Does nothing on the server. */
export function open() { withBox((box) => box.open()); }

/** Close the Ask AI box. */
export function close() { withBox((box) => box.close()); }

/**
 * Open the box and answer a question.
 * @param {string} question
 */
export function ask(question) { withBox((box) => box.ask(question)); }

/** For tests: forget that the warning was shown. */
export function _reset() { warned = false; }
