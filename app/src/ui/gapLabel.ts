// Pick the gap label that fits the shaded gap: the full sentence, a short "8 days", or nothing.
// Text is 11px; CJK glyphs are about 11px wide, other glyphs about 6.2px (estimate, no layout needed).
export function textWidth11(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const wide = (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef);
    w += wide ? 11 : 6.2;
  }
  return w;
}

export function gapLabel(gapPx: number, full: string, short: string, margin = 12): string | null {
  if (textWidth11(full) + margin <= gapPx) return full;
  if (textWidth11(short) + margin <= gapPx) return short;
  return null;
}
