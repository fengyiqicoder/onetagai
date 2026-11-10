interface AskDocs {
  open: () => void
  close: () => void
  ask: (question: string) => void
}

function withBox(run: (box: AskDocs) => void): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { onetagAskDocs?: AskDocs }
  if (w.onetagAskDocs) return run(w.onetagAskDocs)
  // The script is async: wait for it when it is still loading.
  const script = document.querySelector('script[src*="/ask-docs.js"]')
  if (script) script.addEventListener('load', () => w.onetagAskDocs && run(w.onetagAskDocs), { once: true })
}

/** Open, close or ask the OneTag AI box from your own code. Does nothing on the server. */
export function useAskAI() {
  return {
    open: () => withBox(box => box.open()),
    close: () => withBox(box => box.close()),
    ask: (question: string) => withBox(box => box.ask(question)),
  }
}
