<script>
  // Written in the syntax shared by Svelte 4 and Svelte 5, so it works in both.
  import { onMount } from "svelte";
  import { load, open } from "./loader.js";

  /** OneTag AI site key. Public by design. Without one, the demo key answers on localhost only. */
  export let key = "";
  /** @type {string | undefined} Text of the Ask AI button. */
  export let label = undefined;
  /** @type {string | undefined} Placeholder of the question input. */
  export let placeholder = undefined;
  /** @type {"auto" | "float" | "left" | "none" | undefined} Where the widget's own button goes. Default "auto", or "none" when you pass button content. */
  export let position = undefined;
  /** @type {string | undefined} CSS selector of your own element that opens the box. */
  export let button = undefined;
  /** @type {string | undefined} Accent color as hex. */
  export let color = undefined;
  /** @type {"light" | "dark" | undefined} */
  export let theme = undefined;
  /** @type {string | undefined} "en", "zh-CN" or "zh-TW". */
  export let lang = undefined;
  /** @type {string | undefined} Instructions for the model. */
  export let rules = undefined;
  /** @type {string | undefined} Address of the index when it is not found on its own. */
  export let index = undefined;
  /** @type {string | undefined} Address of ask-docs.js. */
  export let src = undefined;
  /** @type {string | undefined} Class of the button rendered around your content. */
  let className = undefined;
  export { className as class };

  const custom = !!$$slots.default;

  onMount(() => {
    load({ key, label, placeholder, position: position || (custom ? "none" : undefined), button, color, theme, lang, rules, index, src });
  });
</script>

{#if custom}
  <button type="button" class={className} on:click={open}><slot /></button>
{/if}
