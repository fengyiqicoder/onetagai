import type { LoadContext, Plugin, OptionValidationContext } from "@docusaurus/types";

export interface Options {
  /** OneTag AI site key. Public by design. Default: the ONETAG_KEY environment variable, else the demo key (localhost only). */
  key?: string;
  /** false: only write llms.txt and llms-full.txt, no Ask AI box. Default true. */
  askAi?: boolean;
  /** false: only add the Ask AI box, for sites that already use another llms.txt plugin. Default true. */
  llms?: boolean;
  /** Text on the button and at the top of the box. Default "Ask AI". */
  label?: string;
  /** Text in the empty question field. */
  placeholder?: string;
  /** Where the button goes. Default "auto". */
  position?: "auto" | "float" | "left" | "none";
  /** CSS selector of your own element that opens the box. */
  button?: string;
  /** Accent color as hex, for example "0b5fff". */
  color?: string;
  theme?: "light" | "dark";
  /** Language of the box's own text: "en", "zh-CN" or "zh-TW". Default: the page's language. */
  lang?: string;
  /** Replaces the instructions the AI gets. */
  rules?: string;
  /**
   * Tools on the page itself, each off until named: "explain" (a button under every code block),
   * "summary" (a button under the title of long pages), "selection" (select text, then Ask AI)
   * and "search" (an Ask AI row above the DocSearch results; needs the Ask AI box). Default: none.
   */
  features?: Array<"explain" | "summary" | "selection" | "search">;
  /** Globs of built files to leave out of the llms files, relative to the build folder, e.g. "docs/internal/**". */
  exclude?: string | string[];
}

export type PluginOptions = Required<Pick<Options, "askAi" | "llms">> & Omit<Options, "askAi" | "llms" | "exclude" | "features"> & { id?: string; exclude: string[]; features: NonNullable<Options["features"]> };

export const DEMO_KEY: string;

export function validateOptions(context: OptionValidationContext<Options | undefined, PluginOptions>): PluginOptions;

declare function pluginOnetag(context: LoadContext, options: PluginOptions): Plugin<void>;
export default pluginOnetag;
