import type { Channel, SearchResult } from "./contracts.js";

// Shared with SQLite FTS; Chinese characters/bigrams and literal English prefixes.
export function searchTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text
    .normalize("NFKC")
    .toLowerCase()
    .matchAll(/[\p{Script=Han}]+|[\p{L}\p{N}_-]+/gu)) {
    const word = match[0];
    if (/\p{Script=Han}/u.test(word)) {
      const chars = [...word];
      tokens.push(...chars);
      for (let i = 0; i < chars.length - 1; i++)
        tokens.push(chars.slice(i, i + 2).join(""));
    } else tokens.push(word);
  }
  return [...new Set(tokens)];
}
export interface SearchDocument extends SearchResult {
  tokens: string[];
  text: string;
}
// SQLite unicode61 splits hyphens/underscores and removes Latin diacritics.
export function ftsWords(text: string): string[] {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}
export function searchDocuments(
  documents: SearchDocument[],
  query: string,
  limit = 50,
): SearchResult[] {
  const tokens = searchTokens(query.slice(0, 200)).slice(0, 32);
  if (!tokens.length) return [];
  return documents
    .filter((d) =>
      tokens.every((t) => {
        const phrase = ftsWords(t);
        return (
          phrase.length > 0 &&
          d.tokens.some((_, start) =>
            phrase.every((word, i) => {
              const candidate = d.tokens[start + i];
              return (
                candidate !== undefined &&
                (i === phrase.length - 1 && /[a-z]/i.test(t)
                  ? candidate.startsWith(word)
                  : candidate === word)
              );
            }),
          )
        );
      }),
    )
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.href.localeCompare(b.href),
    )
    .slice(0, limit)
    .map(({ tokens: _, text, ...result }) => {
      const pos = Math.max(0, text.toLowerCase().indexOf(query.toLowerCase()));
      const start = Math.max(0, pos - 40);
      return {
        ...result,
        snippet: `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}`,
      };
    });
}
export type SearchShard = { channel: Channel; file: string; count: number };
