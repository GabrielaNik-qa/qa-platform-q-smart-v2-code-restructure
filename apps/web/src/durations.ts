// How long until a limit resets, as an AI company writes it (Groq: "1h2m3.5s", "7.66s", "120ms").
/** "1h2m3.5s", "7.66s" or "120ms" (how Groq says when a limit resets), in milliseconds. */
export function durationMs(text: string | undefined): number | null {
  if (!text) return null;
  let ms = 0;
  let found = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    found = true;
    const n = Number(m[1]);
    ms += m[2] === 'h' ? n * 3_600_000 : m[2] === 'm' ? n * 60_000 : m[2] === 's' ? n * 1000 : n;
  }
  return found ? Math.round(ms) : null;
}
