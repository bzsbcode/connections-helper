/**
 * Single-word anagrams for Strands: every word that uses all the given letters, and
 * every shorter word hidden in them. Runs in the browser over the ENABLE list; a plain
 * scan is a few milliseconds on a phone, so no index is built.
 */

/** Strands never accepts words shorter than four letters. */
export const MIN_LENGTH = 4;
/** Longer input only slows the scan without finding more single words. */
export const MAX_LETTERS = 24;

export interface AnagramResult {
	letters: string;
	/** Words using every letter exactly once. */
	exact: string[];
	/** Words using some of the letters, longest first. */
	shorter: { length: number; words: string[] }[];
}

/** Keeps a–z only, lowercased, so "Slip!" and "s l i p" both mean "slip". */
export const normalizeLetters = (input: string) =>
	input
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z]/g, "")
		.slice(0, MAX_LETTERS);

/** The list as served: one lowercase word per line. */
export const parseWordList = (text: string) => text.split(/\r?\n/).filter((w) => /^[a-z]+$/.test(w));

const A = 97;

export function findAnagrams(words: readonly string[], input: string, minLength = MIN_LENGTH): AnagramResult {
	const letters = normalizeLetters(input);
	const result: AnagramResult = { letters, exact: [], shorter: [] };
	if (letters.length < minLength) return result;

	const available = new Uint8Array(26);
	for (let i = 0; i < letters.length; i++) available[letters.charCodeAt(i) - A]++;

	const used = new Uint8Array(26);
	const byLength = new Map<number, string[]>();
	for (const word of words) {
		if (word.length < minLength || word.length > letters.length) continue;
		used.fill(0);
		let fits = true;
		for (let i = 0; i < word.length; i++) {
			const c = word.charCodeAt(i) - A;
			if (c < 0 || c > 25 || ++used[c] > available[c]) {
				fits = false;
				break;
			}
		}
		if (!fits) continue;
		// The input itself is not an answer, but the other arrangements are.
		if (word.length === letters.length) {
			if (word !== letters) result.exact.push(word);
		} else {
			const list = byLength.get(word.length) ?? [];
			list.push(word);
			byLength.set(word.length, list);
		}
	}
	result.exact.sort();
	result.shorter = [...byLength]
		.sort(([a], [b]) => b - a)
		.map(([length, list]) => ({ length, words: list.sort() }));
	return result;
}
