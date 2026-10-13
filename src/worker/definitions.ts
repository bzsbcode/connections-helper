/**
 * Every meaning of a word, merged from the Free Dictionary API and Wiktionary.
 * Connections hinges on the odd senses, so nothing is ever truncated: all entries,
 * all parts of speech, all definitions. Only near-identical senses are folded together.
 */
import type { Sense, SenseGroup, Source, WordDefinitions } from "../types";
import { kvGet, kvPut, type Kv } from "./kv";
import { USER_AGENT } from "./puzzle";

const DAY = 24 * 60 * 60;
const DEFINITIONS_TTL = 30 * DAY;
/** A partial answer (a source was down or rate limited) is retried sooner. */
const PARTIAL_TTL = 60 * 60;

/** One sense as a source gave it, before merging. */
export interface RawSense {
	source: Source;
	term: string;
	partOfSpeech: string;
	text: string;
	example?: string;
	/** "Plural of cup", "Clipping of hitchhike": a pointer to another headword. */
	formOf?: boolean;
}

export type SourceResult = { kind: "found"; senses: RawSense[]; bases: string[] } | { kind: "none" } | { kind: "error" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" };

/**
 * Wiktionary definitions are Parsoid HTML. They become plain text here, and the page
 * renders them with textContent, so no markup from upstream ever reaches the DOM.
 */
export function stripHtml(html: string): string {
	return (
		html
			// Inline TemplateStyles and the like carry CSS text, not words.
			.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
			// Nested sub-sense lists are listed again as senses of their own, and the API often cuts them off unclosed.
			.replace(/<(ol|ul|dl)\b[\s\S]*$/i, " ")
			.replace(/<[^>]*>/g, "")
			.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
				if (e[0] === "#") {
					const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
					return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
				}
				return ENTITIES[e.toLowerCase()] ?? m;
			})
			.replace(/\s+/g, " ")
			// Removed labels and links leave gaps before punctuation: "coat ." → "coat."
			.replace(/\s+([.,;:!?)])/g, "$1")
			.replace(/\(\s+/g, "(")
			.trim()
	);
}

export function parseFreeDictionary(raw: unknown, term: string): RawSense[] {
	if (!Array.isArray(raw)) return [];
	const out: RawSense[] = [];
	for (const entry of raw) {
		if (!isRecord(entry) || !Array.isArray(entry.meanings)) continue;
		for (const meaning of entry.meanings) {
			if (!isRecord(meaning) || !Array.isArray(meaning.definitions)) continue;
			const partOfSpeech = str(meaning.partOfSpeech).trim().toLowerCase() || "other";
			for (const d of meaning.definitions) {
				if (!isRecord(d)) continue;
				const text = stripHtml(str(d.definition));
				if (!text) continue;
				const example = stripHtml(str(d.example));
				out.push({ source: "Free Dictionary", term, partOfSpeech, text, ...(example && { example }) });
			}
		}
	}
	return out;
}

const FORM_OF_LINK = /form-of-definition-link[\s\S]*?href="(?:\.\/|\/wiki\/)([^"#?]+)/g;

/** English senses only; the other languages on the page are noise for an English puzzle. */
export function parseWiktionary(raw: unknown, term: string): { senses: RawSense[]; bases: string[] } {
	const senses: RawSense[] = [];
	const bases: string[] = [];
	if (!isRecord(raw) || !Array.isArray(raw.en)) return { senses, bases };
	for (const entry of raw.en) {
		if (!isRecord(entry) || !Array.isArray(entry.definitions)) continue;
		const partOfSpeech = str(entry.partOfSpeech).trim().toLowerCase() || "other";
		for (const d of entry.definitions) {
			if (!isRecord(d)) continue;
			const html = str(d.definition);
			const text = stripHtml(html);
			if (!text) continue;
			const formOf = html.includes("form-of-definition");
			for (const m of html.matchAll(FORM_OF_LINK)) {
				try {
					bases.push(decodeURIComponent(m[1]).replace(/_/g, " "));
				} catch {}
			}
			// A sense with sub-senses carries their examples, which would read as its own.
			const example = Array.isArray(d.examples) && !/<(ol|ul|dl)\b/i.test(html) ? stripHtml(str(d.examples[0])) : "";
			senses.push({ source: "Wiktionary", term, partOfSpeech, text, ...(example && { example }), ...(formOf && { formOf }) });
		}
	}
	return { senses, bases: [...new Set(bases)] };
}

const tokens = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter(Boolean);

/** Same sense worded almost the same way: equal after normalising, or 80% of the words shared. */
export function nearDuplicate(a: string, b: string): boolean {
	const ta = tokens(a);
	const tb = tokens(b);
	if (ta.join(" ") === tb.join(" ")) return true;
	const sa = new Set(ta);
	const sb = new Set(tb);
	if (sa.size < 3 || sb.size < 3) return false;
	let shared = 0;
	for (const t of sa) if (sb.has(t)) shared++;
	return shared / (sa.size + sb.size - shared) >= 0.8;
}

/**
 * Groups senses by part of speech and headword, keeping the order the sources gave them,
 * and folds near-duplicates within a part of speech into one sense listing both sources.
 */
export function mergeSenses(raw: RawSense[]): SenseGroup[] {
	const groups = new Map<string, SenseGroup>();
	const byPos = new Map<string, Sense[]>();
	for (const r of raw) {
		const kept = byPos.get(r.partOfSpeech) ?? [];
		const dup = kept.find((s) => nearDuplicate(s.text, r.text));
		if (dup) {
			if (!dup.sources.includes(r.source)) dup.sources.push(r.source);
			if (!dup.example && r.example) dup.example = r.example;
			continue;
		}
		const sense: Sense = { text: r.text, ...(r.example && { example: r.example }), sources: [r.source] };
		kept.push(sense);
		byPos.set(r.partOfSpeech, kept);
		const key = `${r.partOfSpeech}\u0000${r.term}`;
		const group = groups.get(key) ?? { partOfSpeech: r.partOfSpeech, term: r.term, senses: [] };
		group.senses.push(sense);
		groups.set(key, group);
	}
	return [...groups.values()];
}

/** The word as looked up and cached: lowercase, single spaces, curly apostrophes made straight. */
export const normalizeWord = (word: string) => word.trim().replace(/\s+/g, " ").replace(/[‘’]/g, "'").toLowerCase();

/** Other spellings to try when the word itself has no entry: hyphen and space swaps, and singulars. */
export function variants(word: string): string[] {
	const w = normalizeWord(word);
	const out: string[] = [];
	if (w.includes(" ")) out.push(w.replace(/ /g, "-"), w.replace(/ /g, ""));
	if (w.includes("-")) out.push(w.replace(/-/g, " "), w.replace(/-/g, ""));
	// Singular of the last word, so "LOOSE ENDS" also tries "loose end".
	const m = /^(.*?)(\p{L}+)$/u.exec(w);
	if (m) {
		const [, head, last] = m;
		if (last.length > 4 && last.endsWith("ies")) out.push(`${head}${last.slice(0, -3)}y`);
		if (/(ches|shes|sses|xes|zes)$/.test(last)) out.push(`${head}${last.slice(0, -2)}`);
		if (last.length > 3 && last.endsWith("s") && !last.endsWith("ss")) out.push(`${head}${last.slice(0, -1)}`);
	}
	return [...new Set(out)].filter((v) => v !== w);
}

async function getJson(url: string, fetcher: typeof fetch): Promise<{ status: number; body: unknown }> {
	const res = await fetcher(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
	return { status: res.status, body: res.ok ? await res.json() : null };
}

async function freeDictionary(term: string, fetcher: typeof fetch): Promise<SourceResult> {
	try {
		const { status, body } = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, fetcher);
		if (status === 404) return { kind: "none" };
		if (status !== 200) return { kind: "error" };
		const senses = parseFreeDictionary(body, term);
		return senses.length ? { kind: "found", senses, bases: [] } : { kind: "none" };
	} catch {
		return { kind: "error" };
	}
}

async function wiktionary(term: string, fetcher: typeof fetch): Promise<SourceResult> {
	try {
		const title = encodeURIComponent(term.replace(/ /g, "_"));
		const { status, body } = await getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${title}`, fetcher);
		if (status === 404) return { kind: "none" };
		if (status !== 200) return { kind: "error" };
		const { senses, bases } = parseWiktionary(body, term);
		return senses.length ? { kind: "found", senses, bases } : { kind: "none" };
	} catch {
		return { kind: "error" };
	}
}

const capitalise = (w: string) => w.replace(/^\p{L}/u, (c) => c.toUpperCase());

/**
 * Looks a word up everywhere it could hide. First the word itself in both sources, plus
 * Wiktionary's capitalised page (proper nouns: MARS, JACKSON) and, for short words, the
 * all-caps page (acronyms: NASA, ICE). Only if that finds nothing but "plural of …"-style
 * pointers does it try base forms and other spellings. At most 10 upstream requests.
 */
export async function lookUp(word: string, fetcher: typeof fetch = fetch): Promise<WordDefinitions> {
	const w = normalizeWord(word);
	const results: SourceResult[] = [];

	const wikiTerms = [w, capitalise(w)];
	if (/^\p{L}{2,5}$/u.test(w)) wikiTerms.push(w.toUpperCase());
	// Wiktionary is asked one page at a time, to stay well inside Wikimedia's rate limits.
	const wiki = (async () => {
		const out: SourceResult[] = [];
		for (const t of new Set(wikiTerms)) out.push(await wiktionary(t, fetcher));
		return out;
	})();
	results.push(await freeDictionary(w, fetcher), ...(await wiki));

	const found = () => results.flatMap((r) => (r.kind === "found" ? r.senses : []));
	if (!found().some((s) => !s.formOf)) {
		const bases = results.flatMap((r) => (r.kind === "found" ? r.bases : []));
		const tried = new Set([...wikiTerms]);
		const candidates = [...new Set([...bases.map(normalizeWord), ...variants(w)])].filter((c) => c && !tried.has(c)).slice(0, 3);
		for (const c of candidates) {
			const [fd, wk] = await Promise.all([freeDictionary(c, fetcher), wiktionary(c, fetcher)]);
			results.push(fd, wk);
			if (fd.kind === "found" || wk.kind === "found") break;
		}
	}

	return { word: w, groups: mergeSenses(found()), complete: !results.some((r) => r.kind === "error") };
}

/** A cached value is trusted only if it still has the shape the page expects. */
function asDefinitions(v: unknown): WordDefinitions | null {
	if (!isRecord(v) || typeof v.word !== "string" || !Array.isArray(v.groups) || typeof v.complete !== "boolean") return null;
	const ok = v.groups.every((g) => isRecord(g) && typeof g.partOfSpeech === "string" && typeof g.term === "string" && Array.isArray(g.senses));
	return ok ? (v as unknown as WordDefinitions) : null;
}

export async function getDefinitions(kv: Kv, word: string, fetcher: typeof fetch = fetch): Promise<WordDefinitions> {
	const key = `def:${normalizeWord(word)}`;
	const cached = asDefinitions(await kvGet(kv, key));
	if (cached) return cached;
	const result = await lookUp(word, fetcher);
	await kvPut(kv, key, result, result.complete ? DEFINITIONS_TTL : PARTIAL_TTL);
	return result;
}
