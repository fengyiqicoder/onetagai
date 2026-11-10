import type { DefineComponent } from "vue";
import type { Theme } from "vitepress";

/** A button that opens the Ask AI box. Place it in any slot of your own Layout. */
export const AskAiButton: DefineComponent<{ label?: string }>;

/** Wrap a theme (usually vitepress/theme) so its nav bar gets an Ask AI button. */
export function withAskAiButton(theme: Theme, options?: {
  /** Button text. Default "Ask AI". */
  label?: string;
  /** Layout slot of the default theme. Default "nav-bar-content-after". */
  slot?: string;
}): Theme;
export default withAskAiButton;

/** Open the box, or open it and ask. Returns false when the script has not loaded. */
export function openAskAi(question?: string): boolean;
