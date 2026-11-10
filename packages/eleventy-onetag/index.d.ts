export interface OnetagOptions {
  /** OneTag AI site key. Public by design. Default: the ONETAG_KEY env variable, else the localhost-only demo key. */
  key?: string;
  /** Public address of the site, e.g. "https://example.com". The Eleventy path prefix is added for you. */
  site?: string;
  /** false: only write the llms files. Default true. */
  askAi?: boolean;
  /** false: only add the Ask AI box. Default true. */
  llms?: boolean;
  label?: string;
  placeholder?: string;
  position?: "auto" | "float" | "left" | "none";
  /** CSS selector of your own button that opens the box. */
  button?: string;
  /** Accent color as hex, with or without "#". */
  color?: string;
  theme?: "light" | "dark";
  lang?: "en" | "zh-CN" | "zh-TW" | string;
  rules?: string;
  index?: string;
  /** Globs of output files to skip for both the box and the llms files, e.g. "tags/**". */
  exclude?: string | string[];
  title?: string;
  description?: string;
  section?: string;
  content?: string | string[];
  remove?: string | string[];
  cleanUrls?: boolean;
  minLength?: number;
  /** false writes llms.txt only. */
  full?: boolean;
  /** Overwrite an llms.txt this plugin did not write. */
  force?: boolean;
}
declare function onetag(eleventyConfig: any, options?: OnetagOptions): void;
export default onetag;
export { onetag };
