// Composer chips: tapping one adds its words to the "I'm free" text. A time chip ("15 min",
// "40 min", "tonight") replaces the time already in the text, so "hungry, 40 min, under $15"
// plus "15 min" reads "hungry, 15 min, under $15" and Muse sees one window, not two.

export const TIME_CHIPS: ReadonlySet<string> = new Set(['15 min', '40 min', 'tonight']);

/** "got like 40 min", "30 mins", "1 hr", "2 hours", "tonight". */
const TIME_PHRASE = /\b(?:got\s+(?:like\s+)?)?\d+(?:\.\d+)?\s*(?:minutes|mins|min|m|hours|hour|hrs|hr|h)\b|\btonight\b/gi;

function tidy(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(', ');
}

export function withChip(prev: string, chip: string): string {
  const base = prev.trim().replace(/,+$/, '');
  if (!base) return chip;
  if (!TIME_CHIPS.has(chip)) return `${base}, ${chip}`;
  const marked = base.replace(TIME_PHRASE, '\u0000');
  if (!marked.includes('\u0000')) return `${base}, ${chip}`;
  // Put the chip where the first time phrase was; drop any later ones.
  let placed = false;
  const replaced = marked.replace(/\u0000/g, () => (placed ? '' : ((placed = true), chip)));
  return tidy(replaced.split(','));
}
