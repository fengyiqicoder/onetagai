import { defineNuxtModule, addImports, createResolver, useLogger } from '@nuxt/kit'
import { headScript, missingKeyWarning, resolveKey, resolveSite, writeLlms, NAME } from './core.js'

export interface ModuleOptions {
  /** OneTag AI site key. Public by design. Default: the ONETAG_KEY env variable, else the demo key (localhost only). */
  key?: string
  /** Public address of the site, used for the links in llms.txt. Default: site.url or runtimeConfig.public.siteUrl. */
  site?: string
  /** false: do not add the Ask AI box, only write the llms files. Default true. */
  askAi?: boolean
  /** false: do not write llms.txt and llms-full.txt, only add the box. Default true. */
  llms?: boolean
  /** Text of the Ask AI button. */
  label?: string
  /** Placeholder of the question input. */
  placeholder?: string
  /** Where the button goes. Default "auto". */
  position?: 'auto' | 'float' | 'left' | 'none'
  /** CSS selector of your own button that opens the box. */
  button?: string
  /** Accent color as hex, with or without "#". */
  color?: string
  /** Default: follows the page. */
  theme?: 'light' | 'dark'
  /** Interface language: "en", "zh-CN" or "zh-TW". Default: the page language. */
  lang?: string
  /** Instructions for the model. */
  rules?: string
  /** Globs of output files to leave out of the llms files, e.g. "tags/**". */
  exclude?: string | string[]
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: NAME,
    configKey: 'onetag',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    askAi: true,
    llms: true,
  },
  setup(options, nuxt) {
    const logger = useLogger(NAME)
    const resolver = createResolver(import.meta.url)

    addImports({ name: 'useAskAI', from: resolver.resolve('./runtime/composables/useAskAI') })

    const script = headScript(options, process.env)
    if (script) {
      nuxt.options.app.head.script ||= []
      nuxt.options.app.head.script.push(script as never)
      if (resolveKey(options, process.env).demo && !nuxt.options._prepare) logger.warn(missingKeyWarning())
    }

    if (options.llms === false || nuxt.options.dev || nuxt.options._prepare) return

    nuxt.hook('nitro:init', (nitro) => {
      let done = false
      const run = () => {
        if (done) return
        done = true
        const site = resolveSite({
          site: options.site,
          siteConfig: (nuxt.options as { site?: { url?: string } }).site,
          runtimeConfig: nuxt.options.runtimeConfig,
          baseURL: nuxt.options.app.baseURL,
        })
        try {
          writeLlms(nitro.options.output.publicDir, options, { site, logger })
        }
        catch (error) {
          logger.warn(`Could not write llms.txt: ${(error as Error).message}`)
        }
      }
      // Runs once every route is prerendered and its HTML is in the public folder.
      nitro.hooks.hook('prerender:done', run)
      // A build with nothing to prerender never calls prerender:done; say so once.
      nitro.hooks.hook('close', run)
    })
  },
})
