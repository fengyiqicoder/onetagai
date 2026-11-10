export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: false },
  compatibilityDate: '2025-07-15',
  onetag: {
    key: process.env.ONETAG_KEY,
    site: 'https://example.com',
  },
})
