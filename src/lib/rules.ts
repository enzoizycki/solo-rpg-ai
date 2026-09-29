export type RulePage = { file: string; page: number; text: string };

const STOP = new Set([
  "de", "da", "do", "das", "dos", "que", "para", "com", "uma", "um", "por",
  "como", "the", "and", "for", "nas", "nos", "sobre", "qual", "quais", "regra",
  "regras", "funciona", "the", "são", "sao", "tem",
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Keyword search across the rulebook pages. Returns the most relevant
 * excerpts (with file/page references) for the Master to consult.
 */
export function searchRules(
  pages: RulePage[],
  query: string,
  maxResults = 4,
  excerptChars = 3500,
): { file: string; page: number; excerpt: string }[] {
  const terms = norm(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
  if (terms.length === 0 || pages.length === 0) return [];

  const scored = pages
    .map((p) => {
      const t = norm(p.text);
      let score = 0;
      let firstHit = -1;
      for (const term of terms) {
        let idx = t.indexOf(term);
        let count = 0;
        while (idx !== -1 && count < 50) {
          if (firstHit === -1 || idx < firstHit) firstHit = idx;
          count++;
          idx = t.indexOf(term, idx + term.length);
        }
        // Reward pages that contain many distinct terms.
        if (count > 0) score += 3 + Math.log2(1 + count);
      }
      return { p, score, firstHit };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map(({ p, firstHit }) => {
    let excerpt = p.text;
    if (excerpt.length > excerptChars) {
      const start = Math.max(0, firstHit - 600);
      excerpt = excerpt.slice(start, start + excerptChars);
    }
    return { file: p.file, page: p.page, excerpt };
  });
}
