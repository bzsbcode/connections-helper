import { describe, expect, it } from "vitest";
import nyt from "./fixtures/nyt-2026-10-12.json";
import { getPuzzle, parsePuzzle } from "../src/worker/puzzle";
import { FakeKv, fakeFetch } from "./helpers";

const BOARD = [
	"CALAMARI", "MANDARIN", "STATE", "ABBREVIATION",
	"NICKNAME", "HANDLE", "SHAPE", "WEATHER",
	"CONDITION", "CONTRACTION", "SITUATION", "BEAR",
	"ALKYLAMIDE", "STAND", "ELISION", "MELAMINE",
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("parsePuzzle", () => {
	it("keeps the 16 words in board order, with the number and date", () => {
		expect(parsePuzzle(nyt)).toEqual({ number: 1317, date: "2026-10-12", words: BOARD });
	});

	it("lets no grouping data through", () => {
		const puzzle = parsePuzzle(nyt)!;
		expect(Object.keys(puzzle).sort()).toEqual(["date", "number", "words"]);
		const out = JSON.stringify(puzzle);
		for (const category of nyt.categories) {
			expect(out).not.toContain(category.title);
			// No group's four words sit together in the order the NYT listed them.
			const members = category.cards.map((c) => c.content);
			expect(out).not.toContain(JSON.stringify(members).slice(1, -1));
		}
		for (const field of ["categories", "title", "cards", "position", "editor", "status", "stream"]) {
			expect(out).not.toContain(`"${field}"`);
		}
	});

	it("rejects shapes it doesn't understand instead of guessing", () => {
		const imageCard = clone(nyt);
		(imageCard.categories[0].cards[0] as Record<string, unknown>).content = undefined;
		(imageCard.categories[0].cards[0] as Record<string, unknown>).image_url = "https://example.com/a.png";
		expect(parsePuzzle(imageCard)).toBeNull();

		const short = clone(nyt);
		short.categories[0].cards.pop();
		expect(parsePuzzle(short)).toBeNull();

		const samePosition = clone(nyt);
		samePosition.categories[0].cards[0].position = samePosition.categories[0].cards[1].position;
		expect(parsePuzzle(samePosition)).toBeNull();

		expect(parsePuzzle({ ...clone(nyt), print_date: "yesterday" })).toBeNull();
		expect(parsePuzzle({ status: "ERROR" })).toBeNull();
		expect(parsePuzzle(null)).toBeNull();
		expect(parsePuzzle("<html>")).toBeNull();
	});
});

describe("getPuzzle", () => {
	// 10:00 in Budapest on 12 October: today is the fixture's date.
	const now = new Date("2026-10-12T08:00:00Z");
	const url = (date: string) => `https://www.nytimes.com/svc/connections/v2/${date}.json`;

	it("fetches once, then serves from KV", async () => {
		const kv = new FakeKv();
		const fetcher = fakeFetch({ [url("2026-10-12")]: { status: 200, body: nyt } });
		const first = await getPuzzle(kv, now, fetcher);
		expect(first).toEqual({ ok: true, stale: false, puzzle: { number: 1317, date: "2026-10-12", words: BOARD } });
		await getPuzzle(kv, now, fetcher);
		expect(fetcher.calls).toEqual([url("2026-10-12")]);
		expect(kv.ttl("puzzle:2026-10-12")).toBe(36 * 60 * 60);
	});

	it("never stores grouping data in KV", async () => {
		const kv = new FakeKv();
		await getPuzzle(kv, now, fakeFetch({ [url("2026-10-12")]: { status: 200, body: nyt } }));
		const stored = kv.dump();
		for (const category of nyt.categories) expect(stored).not.toContain(category.title);
		expect(stored).not.toContain("position");
	});

	it("falls back to yesterday when today isn't published yet, and remembers the 404", async () => {
		const kv = new FakeKv();
		const later = new Date("2026-10-12T22:30:00Z"); // 00:30 on the 13th in Budapest
		const fetcher = fakeFetch({ [url("2026-10-13")]: { status: 404 }, [url("2026-10-12")]: { status: 200, body: nyt } });
		const result = await getPuzzle(kv, later, fetcher);
		expect(result.ok && result.puzzle.date).toBe("2026-10-12");
		expect(result.ok && result.stale).toBe(false);
		await getPuzzle(kv, later, fetcher);
		expect(fetcher.calls).toEqual([url("2026-10-13"), url("2026-10-12")]);
	});

	it("serves the last saved puzzle when the NYT is down, and backs off", async () => {
		const kv = new FakeKv();
		await getPuzzle(kv, now, fakeFetch({ [url("2026-10-12")]: { status: 200, body: nyt } }));
		const tomorrow = new Date("2026-10-13T08:00:00Z");
		const down = fakeFetch({});
		const result = await getPuzzle(kv, tomorrow, down);
		expect(result).toEqual({ ok: true, stale: true, puzzle: { number: 1317, date: "2026-10-12", words: BOARD } });
		await getPuzzle(kv, tomorrow, down);
		// One try for today; yesterday isn't asked once the NYT is known to be failing.
		expect(down.calls).toEqual([url("2026-10-13")]);
	});

	it("treats a changed response shape like an outage", async () => {
		const kv = new FakeKv();
		const result = await getPuzzle(kv, now, fakeFetch({ [url("2026-10-12")]: { status: 200, body: { categories: "?" } } }));
		expect(result).toEqual({ ok: false });
	});

	it("survives the network throwing", async () => {
		const kv = new FakeKv();
		const result = await getPuzzle(kv, now, fakeFetch({ [url("2026-10-12")]: "throw" }));
		expect(result).toEqual({ ok: false });
	});
});
