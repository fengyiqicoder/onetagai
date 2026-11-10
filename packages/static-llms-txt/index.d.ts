export interface Section {
  /** Text of the h2 that opens the section. Empty for the text before the first h2. */
  heading: string;
  /** The heading's id attribute, used for #anchor links. */
  id: string;
  /** Markdown text of the section. */
  text: string;
}

export interface PageInfo {
  title: string;
  docTitle: string;
  siteName: string;
  description: string;
  canonical: string;
  noindex: boolean;
  redirect: boolean;
  lang: string;
  sections: Section[];
  text: string;
}

export interface Page {
  /** Absolute address of the page. */
  url?: string;
  /** Path from the site root, e.g. "/guide/". */
  path?: string;
  /** File path relative to the scanned folder (set by scan). */
  file?: string;
  title: string;
  description?: string;
  /** Markdown text. Give text, sections or html. */
  text?: string;
  sections?: Section[];
  /** Raw HTML of the page; build() reads it with readHtml(). */
  html?: string;
}

export interface ReadOptions {
  /** CSS selector (or list) of the main content. Default: main, [role=main], article, #content, .content, body. */
  content?: string | string[];
  /** Extra CSS selectors to drop from the content. */
  exclude?: string | string[];
}

export interface Options {
  /** Public address of the site, e.g. "https://example.com". Makes every link absolute. */
  site?: string;
  /** Site title. Default: taken from the home page. */
  title?: string;
  /** One-line summary under the title. Default: the home page meta description. */
  description?: string;
  /** Heading of the page list in llms.txt. Default "Pages". */
  section?: string;
  /** CSS selector (or list) of the main content. */
  content?: string | string[];
  /** Extra CSS selectors to drop from every page. */
  remove?: string | string[];
  /** Globs of files to skip, relative to the folder, e.g. "tags/**". */
  exclude?: string | string[];
  /** Link /about instead of /about.html. */
  cleanUrls?: boolean;
  /** Pages with less text than this are skipped. Default 40 characters. */
  minLength?: number;
  /** false writes llms.txt only. */
  full?: boolean;
  /** Overwrite an llms.txt that this tool did not write. */
  force?: boolean;
  /** Write to this folder instead of the scanned one. */
  out?: string;
  /** false returns the text without writing files. */
  write?: boolean;
  /** Use these pages instead of scanning the folder. */
  pages?: Page[];
}

export interface Result {
  title: string;
  description: string;
  pages: Page[];
  /** Text of llms.txt. */
  llms: string;
  /** Text of llms-full.txt. */
  llmsFull: string;
}

export interface GenerateResult extends Result {
  written: string[];
  skipped: string[];
}

export interface ScriptOptions {
  /** OneTag AI site key. Public by design. */
  key?: string;
  /** Short name of the tool that added the tag. */
  ref?: string;
  label?: string;
  placeholder?: string;
  position?: "auto" | "float" | "left" | "none";
  /** CSS selector of your own button that opens the box. */
  button?: string;
  /** Accent color as hex without "#". */
  color?: string;
  theme?: "light" | "dark";
  lang?: string;
  rules?: string;
  index?: string;
  src?: string;
  /** Globs of files to leave alone (inject only). */
  exclude?: string | string[];
}

/** Scan a built site and write llms.txt and llms-full.txt into it. */
export function generate(dir: string, options?: Options): GenerateResult;
/** Read every page of a built site. */
export function scan(dir: string, options?: Options): Page[];
/** Turn a list of pages into the text of both files. */
export function build(pages: Page[], options?: Options): Result;
/** Read one HTML document: title, description and main content as Markdown. */
export function readHtml(html: string, options?: ReadOptions): PageInfo;
/** Add the Ask AI script tag before </body> of every page. Returns the files changed. */
export function inject(dir: string, options?: ScriptOptions): string[];
/** The Ask AI script tag as a string. */
export function scriptTag(options?: ScriptOptions): string;
export function globToRegExp(glob: string): RegExp;
export const MARK: string;
export const SCRIPT: string;
declare const core: { generate: typeof generate; scan: typeof scan; build: typeof build; readHtml: typeof readHtml; inject: typeof inject; scriptTag: typeof scriptTag; globToRegExp: typeof globToRegExp; MARK: string; SCRIPT: string };
export default core;
