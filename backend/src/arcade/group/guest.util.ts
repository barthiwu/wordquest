/**
 * Turns whatever a guest typed into a public handle: lowercase letters, digits
 * and underscores (the same alphabet as every username), 3-14 characters.
 * Names with nothing usable in them (another script, only symbols) become
 * "guest".
 */
export function guestHandleBase(nickname: string): string {
  const cleaned = nickname
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents: "Zoë" -> "zoe"
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 14);
  return cleaned.length >= 3 ? cleaned : 'guest';
}

/** The nth candidate handle: the plain name first, then with a growing number. */
export function guestHandleCandidate(base: string, attempt: number, random: () => number): string {
  if (attempt === 0 && base !== 'guest') return base;
  const digits = attempt < 4 ? 2 : attempt < 8 ? 3 : 5;
  const n = Math.floor(random() * 10 ** digits)
    .toString()
    .padStart(digits, '0');
  return `${base}_${n}`;
}

/**
 * The name a guest is shown under, exactly as they typed it (capitals, spaces,
 * any alphabet), minus anything that could break a screen or a card: control
 * characters, angle brackets, runs of spaces.
 */
export function guestDisplayName(nickname: string, max = 20): string {
  return nickname
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** Makes a name unique within a group by adding " 2", " 3"... when it is already shown there. */
export function uniqueInGroup(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${name} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} ${Math.floor(Math.random() * 1000)}`;
}
