// reportNarrative.ts — extract the first sentence (or first line) of a narrative
// for use as a short quote/preview.
export function extractFirstSentence(text: string, maxLen = 120): string | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const first = trimmed.match(/^[^.!?\n]+[.!?]/)?.[0]?.trim()
  return first ?? trimmed.split('\n')[0].trim().slice(0, maxLen)
}
