<script setup lang="ts">
const { open, ask } = useAskAI()
useHead({ title: 'nuxt-onetag playground', meta: [{ name: 'description', content: 'Try the Ask AI box and the llms files.' }] })
</script>

<template>
  <main>
    <h1>nuxt-onetag playground</h1>
    <p>Run <code>npm run dev</code> and the Ask AI box answers on localhost with the demo key. Run <code>npm run dev:generate</code> to write llms.txt and llms-full.txt.</p>
    <button type="button" @click="open()">Open the box</button>
    <button type="button" @click="ask('What is this site?')">Ask a question</button>
  </main>
</template>
