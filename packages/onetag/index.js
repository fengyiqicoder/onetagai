/*! onetag | https://onetagai.com | MIT */
import { ask as send, configure as set, OneTagError, version } from "./core.js";

// The shared demo key. It answers while you develop on localhost, so a fresh install works
// before you have a key. Its small daily budget is shared by everyone, so a deployed site
// needs its own free key.
const DEMO_KEY = "ot_demo000000000000000000000";
const GET_KEY =
  "Get your own free key (email only): curl -X POST https://onetagai.com/api/signup " +
  `-H "Content-Type: application/json" -d '{"email":"you@example.com"}'`;

let key = "";
let via = "npm";
let told = false;

const missing = (value) => !value || /^YOUR_/i.test(value);

// A page on localhost or opened from a file; outside a browser, anything but a production build.
function isLocal() {
  const location = globalThis.location;
  if (location && typeof location.hostname === "string") {
    return /^(|localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(location.hostname);
  }
  const env = globalThis.process && globalThis.process.env;
  return !!env && env.NODE_ENV !== "production";
}

function configure(options = {}) {
  if (options.key !== undefined) key = options.key;
  if (options.via !== undefined) via = options.via;
  if (options.endpoint !== undefined) set({ endpoint: options.endpoint });
}

async function ask(prompt, input, options) {
  const o = options || {};
  let use = o.key || key;
  if (missing(use)) {
    if (!isLocal()) {
      throw new OneTagError("no_key", "No OneTag AI key: the demo key only answers on localhost. " + GET_KEY + " Then call configure({ key }).", 0);
    }
    if (!told) {
      told = true;
      console.info("[onetag] No key set: using the shared demo key, which works on localhost only. " + GET_KEY);
    }
    use = DEMO_KEY;
  }
  return send(prompt, input, { ...o, key: use, via: o.via || via });
}

const onetag = { ask, configure, OneTagError, version, DEMO_KEY };

export { ask, configure, OneTagError, version, DEMO_KEY };
export default onetag;
