/**
 * Today's board from the NYT's (undocumented) Connections endpoint. The response
 * holds the solution, so it is cut down to the 16 words straight away: categories,
 * titles and group membership never leave parsePuzzle, are never cached and never logged.
 */
import type { Puzzle } from "../types";
import { isIsoDate, puzzleDates } from "./dates";
import { kvGet, kvPut, type Kv } from "./kv";

export const USER_AGENT = "ConnectionsHelper/1.0 (https://nyt.bzsb.eu; https://github.com/bzsbcode/connections-helper)";

const endpoint = (date: string) => `https://www.nytimes.com/svc/connections/v2/${date}.json`;

const HOUR = 60 * 60;
/** A day's board never changes, so it is kept for the whole Budapest day and a bit beyond. */
const PUZZLE_TTL = 36 * HOUR;
/** Not published yet: ask again in an hour, not on every page view. */
const MISSING_TTL = HOUR;
/** Upstream broken: back off for a few minutes. */
const FAILED_TTL = 5 * 60;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Pulls the 16 words, the number and the date out of a raw NYT response, in board order.
 * Returns null when the shape isn't what we expect (e.g. image cards), rather than guessing.
 */
export function parsePuzzle(raw: unknown): Puzzle | null {
	if (!isRecord(raw) || !Array.isArray(raw.categories)) return null;
	const { id, print_date: date } = raw;
	if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
	if (typeof date !== "string" || !isIsoDate(date)) return null;

	const cards: { word: string; position: number }[] = [];
	for (const category of raw.categories) {
		if (!isRecord(category) || !Array.isArray(category.cards)) return null;
		for (const card of category.cards) {
			if (!isRecord(card) || typeof card.content !== "string" || typeof card.position !== "number") return null;
			const word = card.content.trim();
			if (!word) return null;
			cards.push({ word, position: card.position });
		}
	}
	if (cards.length !== 16) return null;
	// Positions must be the board's 16 distinct slots, otherwise the order means nothing.
	const positions = new Set(cards.map((c) => c.position));
	if (positions.size !== 16 || ![...positions].every((p) => Number.isInteger(p) && p >= 0 && p < 16)) return null;

	// A fresh object built field by field, so nothing else from the response can ride along.
	return {
		number: id,
		date,
		words: cards.sort((a, b) => a.position - b.position).map((c) => c.word),
	};
}

/** A cached value is trusted only if it still has exactly the public shape. */
export function asPuzzle(v: unknown): Puzzle | null {
	if (!isRecord(v) || typeof v.number !== "number" || typeof v.date !== "string" || !Array.isArray(v.words)) return null;
	if (v.words.length !== 16 || !v.words.every((w) => typeof w === "string")) return null;
	return { number: v.number, date: v.date, words: v.words as string[] };
}

export type PuzzleResult = { ok: true; puzzle: Puzzle; stale: boolean } | { ok: false };

type Upstream = { kind: "ok"; puzzle: Puzzle } | { kind: "missing" } | { kind: "failed" };

async function fetchUpstream(date: string, fetcher: typeof fetch): Promise<Upstream> {
	try {
		const res = await fetcher(endpoint(date), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
		if (res.status === 404) return { kind: "missing" };
		if (!res.ok) {
			console.error("nyt fetch failed", date, res.status);
			return { kind: "failed" };
		}
		const puzzle = parsePuzzle(await res.json());
		if (!puzzle) {
			console.error("nyt response shape changed", date);
			return { kind: "failed" };
		}
		return { kind: "ok", puzzle };
	} catch (err) {
		console.error("nyt unreachable", date, err instanceof Error ? err.message : "unknown");
		return { kind: "failed" };
	}
}

/**
 * Today's puzzle (Budapest date), falling back to yesterday's if the NYT hasn't published
 * today's yet, then to the last puzzle ever saved. Every upstream outcome is remembered in
 * KV, so the NYT sees at most one request per date while things work, and a slow trickle
 * while they don't.
 */
export async function getPuzzle(kv: Kv, now: Date, fetcher: typeof fetch = fetch): Promise<PuzzleResult> {
	for (const date of puzzleDates(now)) {
		const cached = asPuzzle(await kvGet(kv, `puzzle:${date}`));
		if (cached) return { ok: true, puzzle: cached, stale: false };

		const marker = await kvGet(kv, `upstream:${date}`);
		if (marker === "missing") continue;
		if (marker === "failed") break;

		const result = await fetchUpstream(date, fetcher);
		if (result.kind === "ok") {
			await Promise.all([kvPut(kv, `puzzle:${date}`, result.puzzle, PUZZLE_TTL), kvPut(kv, "puzzle:last", result.puzzle)]);
			return { ok: true, puzzle: result.puzzle, stale: false };
		}
		await kvPut(kv, `upstream:${date}`, result.kind, result.kind === "missing" ? MISSING_TTL : FAILED_TTL);
		// A 404 means "not yet", so yesterday is worth a try; anything else means the NYT is down for every date.
		if (result.kind === "failed") break;
	}

	const last = asPuzzle(await kvGet(kv, "puzzle:last"));
	return last ? { ok: true, puzzle: last, stale: true } : { ok: false };
}
