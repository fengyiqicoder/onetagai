import type { GenerateResult } from 'static-llms-txt'

export const NAME: string
export const SCRIPT: string
export const DEMO_KEY: string
export const SIGNUP: string
export const WIDGET_OPTIONS: string[]
export const DEFAULT_EXCLUDE: string[]
export const DEFAULTS: { askAi: boolean, llms: boolean }
export function resolveKey(options: { key?: string } | undefined, env: Record<string, string | undefined> | undefined): { key: string, demo: boolean }
export function missingKeyWarning(): string
export function headScript(options: Record<string, unknown>, env: Record<string, string | undefined> | undefined): Record<string, string | boolean> | null
export function resolveSite(input?: { site?: string, siteConfig?: { url?: string }, runtimeConfig?: { public?: Record<string, any> }, baseURL?: string }): string | undefined
export function hasPages(dir: string): boolean
export function writeLlms(publicDir: string, options: Record<string, unknown>, extra?: { site?: string, logger?: { info: (msg: string) => void } }): GenerateResult | null
