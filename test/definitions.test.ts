import { describe, expect, it } from "vitest";
import fdHitch from "./fixtures/free-dictionary-hitch.json";
import wkDope from "./fixtures/wiktionary-dope.json";
import wkHitch from "./fixtures/wiktionary-hitch.json";
import wkJacket from "./fixtures/wiktionary-jacket.json";
import { getDefinitions, lookUp, mergeSenses, nearDuplicate, parseFreeDictionary, parseWiktionary, stripHtml, variants } from "../src/worker/definitions";
import { FakeKv, fakeFetch } from "./helpers";

const fd = (w: string) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;
const wk = (w: string) => `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.replace(/ /g, "_"))}`;

describe("stripHtml", () => {
	it("turns markup into plain text", () => {
		expect(stripHtml('A <a rel="mw:WikiLink" href="/wiki/sudden">sudden</a> <b>pull</b>.')).toBe("A sudden pull.");
		expect(stripHtml("Fish &amp; chips &#8212; &#x2019;n&nbsp;more")).toBe("Fish & chips — ’n more");
	});

	it("drops CSS, scripts and nested sub-sense lists", () => {
		expect(stripHtml("heroin. <style>.mw-parser-output .defdate{font-size:smaller}</style>")).toBe("heroin.");
		expect(stripHtml("x<script>alert(1)</script>y")).toBe("x y");
		expect(stripHtml("Substances:\n<ol><li>An opiate.</li><li>Marijuana.</li></ol>")).toBe("Substances:");
		// As the API sends it for "jacket": the sub-sense list cut off without its closing tag.
		expect(stripHtml("Any of certain types of outerwear.\n<ol><li>A piece of clothing.</li>\n<li>A letter jacket.")).toBe("Any of certain types of outerwear.");
	});

	it("closes the gaps that removed labels leave before punctuation", () => {
		expect(stripHtml('A <a href="/wiki/vest">vest</a> ; a waistcoat <span></span>.')).toBe("A vest; a waistcoat.");
		expect(stripHtml("( <i>slang</i> ) cool , man")).toBe("(slang) cool, man");
	});

	it("leaves no tags behind, even broken ones", () => {
		expect(stripHtml('<img src=x onerror="alert(1)">safe')).toBe("safe");
		expect(stripHtml("a <span class=\"usage-label-sense\"></span> b")).toBe("a b");
	});
});

describe("parseWiktionary", () => {
	it("keeps every English sense of every part of speech", () => {
		const { senses, bases } = parseWiktionary(wkHitch, "hitch");
		expect(senses).toHaveLength(15);
		expect(new Set(senses.map((s) => s.partOfSpeech))).toEqual(new Set(["noun", "verb"]));
		expect(senses[0]).toEqual({ source: "Wiktionary", term: "hitch", partOfSpeech: "noun", text: "A sudden pull." });
		expect(senses.map((s) => s.text)).toContain("A period of time spent in the military.");
		expect(senses.every((s) => !/[<>]/.test(s.text))).toBe(true);
		// "Clipping of hitchhike" points at another headword.
		expect(bases).toContain("hitchhike");
		expect(senses.find((s) => s.text.startsWith("Clipping of"))?.formOf).toBe(true);
	});

	it("keeps slang senses, skips empty ones and other languages", () => {
		const { senses } = parseWiktionary(wkDope, "dope");
		const texts = senses.map((s) => s.text);
		expect(texts).toContain("A stupid person.");
		expect(texts).toContain("A soft drink.");
		expect(texts).toContain("Any of various recreational substances:");
		expect(texts).toContain("An opiate, now particularly heroin.");
		expect(texts.some((t) => t.includes("mw-parser-output"))).toBe(false);
		expect(texts.includes("")).toBe(false);
		const englishCount = wkDope.en.reduce((n, e) => n + e.definitions.filter((d) => d.definition.trim()).length, 0);
		expect(senses).toHaveLength(englishCount);
		expect(senses.find((s) => s.text.startsWith("Information"))?.example).toBe("What's the latest dope on the stock market?");
	});

	it("returns nothing for shapes it doesn't know", () => {
		expect(parseWiktionary({ status: 404 }, "x").senses).toEqual([]);
		expect(parseWiktionary(null, "x").senses).toEqual([]);
	});
});

describe("parseFreeDictionary", () => {
	it("keeps all meanings and definitions, with examples", () => {
		const senses = parseFreeDictionary(fdHitch, "hitch");
		expect(senses).toHaveLength(6);
		expect(senses[2]).toEqual({
			source: "Free Dictionary",
			term: "hitch",
			partOfSpeech: "noun",
			text: "A problem, delay, or source of difficulty.",
			example: "The banquet went off without a hitch.",
		});
	});

	it("returns nothing for the not-found body", () => {
		expect(parseFreeDictionary({ title: "No Definitions Found", message: "…" }, "x")).toEqual([]);
	});
});

describe("nearDuplicate", () => {
	it("matches the same wording with different punctuation or case", () => {
		expect(nearDuplicate("A problem, delay, or source of difficulty.", "A problem, delay or source of difficulty.")).toBe(true);
		expect(nearDuplicate("To attach, tie or fasten.", "to attach, tie, or fasten")).toBe(true);
	});

	it("keeps senses that say more", () => {
		expect(nearDuplicate("A sudden pull.", "A sudden pull or jerk.")).toBe(false);
		expect(nearDuplicate("A soft drink.", "A stupid person.")).toBe(false);
	});
});

describe("mergeSenses", () => {
	const merged = mergeSenses([...parseFreeDictionary(fdHitch, "hitch"), ...parseWiktionary(wkHitch, "hitch").senses]);

	it("groups by part of speech in source order", () => {
		expect(merged.map((g) => g.partOfSpeech)).toEqual(["noun", "verb"]);
	});

	it("folds near-identical senses into one, crediting both sources", () => {
		const noun = merged[0].senses;
		const pulls = noun.filter((s) => s.text === "A sudden pull.");
		expect(pulls).toHaveLength(1);
		expect(pulls[0].sources).toEqual(["Free Dictionary", "Wiktionary"]);
		const problem = noun.find((s) => s.text.startsWith("A problem"))!;
		expect(problem.sources).toEqual(["Free Dictionary", "Wiktionary"]);
		expect(problem.example).toBe("The banquet went off without a hitch.");
	});

	it("loses no distinct sense from either source", () => {
		const texts = merged.flatMap((g) => g.senses.map((s) => s.text));
		expect(texts).toContain("A free ride in a passing vehicle; a lift.");
		expect(texts).toContain("A large Californian minnow, Lavinia exilicauda.");
		// 6 + 15 senses, of which 5 Free Dictionary ones repeat a Wiktionary one.
		expect(texts).toHaveLength(16);
	});

	it("keeps proper-noun pages apart from the common word", () => {
		const groups = mergeSenses([
			{ source: "Wiktionary", term: "mars", partOfSpeech: "verb", text: "Third-person singular of mar." },
			{ source: "Wiktionary", term: "Mars", partOfSpeech: "proper noun", text: "The fourth planet in the solar system." },
		]);
		expect(groups.map((g) => [g.partOfSpeech, g.term])).toEqual([
			["verb", "mars"],
			["proper noun", "Mars"],
		]);
	});
});

describe("variants", () => {
	it("tries base forms and other spellings", () => {
		expect(variants("LOOSE ENDS")).toEqual(["loose-ends", "looseends", "loose end"]);
		expect(variants("cups")).toEqual(["cup"]);
		expect(variants("berries")).toEqual(["berry", "berrie"]);
		expect(variants("boxes")).toEqual(["box", "boxe"]);
		expect(variants("t-shirt")).toEqual(["t shirt", "tshirt"]);
		expect(variants("glass")).toEqual([]);
		expect(variants("bus")).toEqual([]);
	});
});

describe("lookUp", () => {
	it("merges both sources, and checks proper-noun and acronym pages", async () => {
		const fetcher = fakeFetch({
			[fd("hitch")]: { status: 200, body: fdHitch },
			[wk("hitch")]: { status: 200, body: wkHitch },
			[wk("Hitch")]: { status: 404 },
			[wk("HITCH")]: { status: 404 },
		});
		const result = await lookUp("HITCH", fetcher);
		expect(result.word).toBe("hitch");
		expect(result.complete).toBe(true);
		expect(result.groups.flatMap((g) => g.senses)).toHaveLength(16);
		expect([...fetcher.calls].sort()).toEqual([fd("hitch"), wk("HITCH"), wk("Hitch"), wk("hitch")].sort());
	});

	it("follows 'plural of' pointers to the base word", async () => {
		const pluralOf = {
			en: [
				{
					partOfSpeech: "Noun",
					language: "English",
					definitions: [
						{
							definition:
								'<span class="form-of-definition use-with-mention">plural of <span class="form-of-definition-link"><i class="Latn mention" lang="en"><a rel="mw:WikiLink" href="/wiki/cup#English" title="cup">cup</a></i></span></span>',
						},
					],
				},
			],
		};
		const cup = { en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: "A small open container for drinking." }, { definition: "A trophy." }] }] };
		const fetcher = fakeFetch({
			[fd("cups")]: { status: 404 },
			[wk("cups")]: { status: 200, body: pluralOf },
			[wk("Cups")]: { status: 404 },
			[wk("CUPS")]: { status: 404 },
			[fd("cup")]: { status: 404 },
			[wk("cup")]: { status: 200, body: cup },
		});
		const result = await lookUp("CUPS", fetcher);
		expect(result.groups.map((g) => g.term)).toEqual(["cups", "cup"]);
		expect(result.groups[1].senses.map((s) => s.text)).toEqual(["A small open container for drinking.", "A trophy."]);
		expect(result.complete).toBe(true);
	});

	it("reports a partial answer when a source fails", async () => {
		const fetcher = fakeFetch({
			[fd("hitch")]: { status: 429 },
			[wk("hitch")]: { status: 200, body: wkHitch },
			[wk("Hitch")]: { status: 404 },
			[wk("HITCH")]: { status: 404 },
		});
		const result = await lookUp("hitch", fetcher);
		expect(result.complete).toBe(false);
		expect(result.groups.flatMap((g) => g.senses)).toHaveLength(15);
	});

	it("gives up cleanly when nothing is found", async () => {
		const result = await lookUp("zzxq", fakeFetch({ [fd("zzxq")]: { status: 404 }, [wk("zzxq")]: { status: 404 }, [wk("Zzxq")]: { status: 404 }, [wk("ZZXQ")]: { status: 404 } }));
		expect(result).toEqual({ word: "zzxq", groups: [], complete: true });
	});

	it("never makes more than 10 upstream requests", async () => {
		const fetcher = fakeFetch({});
		await lookUp("loose ends", fetcher);
		expect(fetcher.calls.length).toBeLessThanOrEqual(10);
	});
});

describe("getDefinitions", () => {
	const replies = {
		[fd("hitch")]: { status: 200, body: fdHitch },
		[wk("hitch")]: { status: 200, body: wkHitch },
		[wk("Hitch")]: { status: 404 },
		[wk("HITCH")]: { status: 404 },
	};

	it("caches complete answers for 30 days and serves them from KV", async () => {
		const kv = new FakeKv();
		const fetcher = fakeFetch(replies);
		const first = await getDefinitions(kv, "HITCH", fetcher);
		const second = await getDefinitions(kv, "hitch", fetcher);
		expect(second).toEqual(first);
		expect(fetcher.calls).toHaveLength(4);
		expect(kv.ttl("def:hitch")).toBe(30 * 24 * 60 * 60);
	});

	it("caches partial answers for an hour only", async () => {
		const kv = new FakeKv();
		await getDefinitions(kv, "hitch", fakeFetch({ ...replies, [fd("hitch")]: { status: 503 } }));
		expect(kv.ttl("def:hitch")).toBe(60 * 60);
	});
});

describe("real responses", () => {
	it("splits a parent sense from its cut-off sub-senses (jacket)", () => {
		const texts = parseWiktionary(wkJacket, "jacket").senses.map((s) => s.text);
		expect(texts[0]).toBe("Any of certain types of outerwear.");
		// Its examples belong to the sub-senses, so it gets none of its own.
		expect(parseWiktionary(wkJacket, "jacket").senses[0].example).toBeUndefined();
		expect(texts[1]).toBe("A piece of clothing worn on the upper body outside a shirt or blouse, often waist length to thigh length.");
		expect(texts.every((t) => !/\s[.,;]/.test(t))).toBe(true);
	});
});
