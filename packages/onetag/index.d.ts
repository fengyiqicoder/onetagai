/** A piece of input: text, a DOM element (its text), a form (its fields), an image or File, any JSON value, or a list of those. */
export type AskInput = string | Blob | Element | Iterable<unknown> | object | null | undefined;

export interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskOptions {
  /** Instructions for the model: a persona, limits, a format. */
  system?: string;
  /** Called with each piece of the answer as it arrives. The promise still resolves with the whole answer. */
  stream?: (delta: string) => void;
  /** Parse the answer as JSON and return the value. */
  json?: boolean;
  /** Cap on the answer length in tokens (default 500, at most 10000). */
  maxTokens?: number;
  /** Earlier turns of the conversation, oldest first. */
  history?: AskMessage[];
  /** Abort the call. */
  signal?: AbortSignal;
  /** Pro keys only: the model that answers, by name, e.g. "deepseek-v4-pro". See https://onetagai.com/docs#models */
  model?: string | null;
  /** Use this key for this call instead of the configured one. */
  key?: string;
  /** A short slug naming the integration that sends the call. For packages built on this one. */
  via?: string;
}

export interface ConfigureOptions {
  /** Your OneTag AI key. It is designed to be public, like an analytics ID. */
  key?: string;
  /** The API endpoint. Default https://onetagai.com/v1/ask */
  endpoint?: string;
  /** A short slug naming the integration that sends the calls. */
  via?: string;
  /** Pro keys only: the model that answers every call, by name. */
  model?: string;
}

export type OneTagErrorCode =
  | "no_key"
  | "bad_input"
  | "bad_json"
  | "network"
  | "aborted"
  | "bad_request"
  | "bad_key"
  | "domain_not_allowed"
  | "pro_required"
  | "too_large"
  | "quota_exceeded"
  | "rate_limited"
  | "upstream"
  | "paused"
  | (string & {});

export class OneTagError extends Error {
  code: OneTagErrorCode;
  /** HTTP status, or 0 when the call never reached the server. */
  status: number;
  constructor(code: OneTagErrorCode, message: string, status?: number);
}

/** Set the key once, before the first call. */
export function configure(options?: ConfigureOptions): void;

/** Ask the model. `input` is what the prompt is about: text, an element, a form, an image, JSON, or a list of those. */
export function ask<T = unknown>(prompt: string, input: AskInput, options: AskOptions & { json: true }): Promise<T>;
export function ask(prompt: string, input?: AskInput, options?: AskOptions): Promise<string>;

export const version: string;
/** The shared demo key this package falls back to on localhost when no key is set. */
export const DEMO_KEY: string;

declare const onetag: {
  ask: typeof ask;
  configure: typeof configure;
  OneTagError: typeof OneTagError;
  version: string;
  DEMO_KEY: string;
};
export default onetag;
