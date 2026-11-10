import type { UserConfig, SiteConfig, HeadConfig } from "vitepress";
import type { GenerateResult, Options as LlmsOptions } from "static-llms-txt";

export interface OnetagOptions {
  /** OneTag AI site key. Public by design. Default: env ONETAG_KEY, else the demo key (localhost only). */
  key?: string;
  /** Public address of the site, e.g. "https://example.com". Default: sitemap.hostname. Makes the llms links absolute. */
  site?: string;
  /** false: only write llms.txt and llms-full.txt, no Ask AI box. Default true. */
  askAi?: boolean;
  /** false: only add the Ask AI box, for sites that use another llms.txt plugin. Default true. */
  llms?: boolean;
  /** Text on the button and at the top of the box. Default "Ask AI". */
  label?: string;
  /** Text in the empty question field. */
  placeholder?: string;
  /** Where the floating button goes. "none" when you use the nav button from vitepress-onetag/theme. */
  position?: "auto" | "float" | "left" | "none";
  /** CSS selector of your own element that opens the box. */
  button?: string;
  /** Accent color as hex, with or without "#". */
  color?: string;
  theme?: "light" | "dark";
  lang?: "en" | "zh-CN" | "zh-TW" | string;
  /** Replaces the instructions the AI gets. */
  rules?: string;
  /** Address of the index. Default in a build: <base>llms-full.txt. */
  index?: string;
  /** Globs of built files to leave out of llms.txt and llms-full.txt, e.g. "drafts/**". */
  exclude?: string | string[];
  /** Extra CSS selectors to drop from every page in llms-full.txt. */
  remove?: string | string[];
  /** Title in llms.txt. Default: the VitePress title. */
  title?: string;
  /** Summary in llms.txt. Default: the VitePress description. */
  description?: string;
  /** Script address. Default https://onetagai.com/ask-docs.js. */
  src?: string;
  /** Treat this as a production build (sets data-index). Default: NODE_ENV === "production". */
  production?: boolean;
  /** Where messages go. Default console. */
  logger?: { info(msg: string): void; warn(msg: string): void };
  /** Environment to read ONETAG_KEY from. Default process.env. */
  env?: Record<string, string | undefined>;
}

/** Add llms.txt, llms-full.txt and the Ask AI box to a VitePress config. Returns the same object. */
export function withOnetag<T extends UserConfig<any>>(config: T, options?: OnetagOptions): T;
export default withOnetag;

export function resolveKey(options?: OnetagOptions, env?: Record<string, string | undefined>): { key: string; demo: boolean };
export function headEntry(options?: OnetagOptions, ctx?: { key?: string; base?: string; production?: boolean; env?: Record<string, string | undefined> }): HeadConfig;
export function llmsOptions(siteConfig: SiteConfig, options?: OnetagOptions): LlmsOptions;
export function writeLlms(siteConfig: SiteConfig, options?: OnetagOptions): GenerateResult;
export function normalizeBase(base?: string): string;
export function warning(): string;
export const REF: "vitepress-onetag";
export const DEMO_KEY: string;
export const SIGNUP: string;
export const CONTENT: string[];
export const REMOVE: string[];
