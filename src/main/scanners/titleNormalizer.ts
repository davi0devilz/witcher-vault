const EDITION_SUFFIXES = [
  "game of the year edition",
  "goty edition",
  "goty",
  "complete edition",
  "definitive edition",
  "deluxe edition",
  "ultimate edition",
  "gold edition",
  "enhanced edition",
  "standard edition",
  "anniversary edition",
  "special edition",
  "remastered",
  "remaster",
  "director's cut",
  "directors cut"
]

/**
 * Normalizes a game title for cross-store deduplication matching only.
 * The original title is always preserved for display — this output is
 * never shown to the user.
 */
export function normalizeTitle(rawTitle: string): string {
  let t = rawTitle.toLowerCase()
  t = t.replace(/[™®©]/g, '')
  t = t.replace(/[‘’ʼ`]/g, "'")
  t = t.replace(/[_\-:]/g, ' ')
  t = t.replace(/[^a-z0-9؀-ۿ\s']/g, ' ')

  for (const suffix of EDITION_SUFFIXES) {
    const escaped = suffix.replace(/'/g, "'?")
    t = t.replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' ')
  }

  t = t.replace(/\s+/g, ' ').trim()
  return t
}
