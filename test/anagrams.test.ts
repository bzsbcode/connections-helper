import { describe, expect, it } from "vitest";
import enable from "../public/words/enable1.txt?raw";
import { findAnagrams, normalizeLetters, parseWordList } from "../src/lib/anagrams";

const words = parseWordList(enable);

describe("parseWordList", () => {
	it("reads the whole ENABLE list", () => {
		expect(words).toHaveLength(172823);
		expect(words[0]).toBe("aa");
	});

	it("ignores blank lines, Windows line endings and anything that isn't a–z", () => {
		expect(parseWordList("cat\r\ndog\n\nCAPS\nnaïve\n")).toEqual(["cat", "dog"]);
	});
});

describe("normalizeLetters", () => {
	it("keeps letters only, lowercased", () => {
		expect(normalizeLetters(" S-l i p! 3")).toBe("slip");
		expect(normalizeLetters("Café")).toBe("cafe");
	});

	it("caps the input length", () => {
		expect(normalizeLetters("a".repeat(40))).toHaveLength(24);
	});
});

describe("findAnagrams", () => {
	it("finds every rearrangement, but not the input itself", () => {
		expect(findAnagrams(words, "LIPS").exact).toEqual(["lisp", "slip"]);
		expect(findAnagrams(words, "listen").exact).toEqual(["elints", "enlist", "inlets", "silent", "tinsel"]);
	});

	it("lists the shorter hidden words, longest first, four letters or more", () => {
		const { shorter } = findAnagrams(words, "strands");
		expect(shorter.map((g) => g.length)).toEqual([6, 5, 4]);
		expect(shorter[0].words).toContain("strand");
		expect(shorter.at(-1)!.words).toContain("sand");
		expect(shorter.flatMap((g) => g.words).every((w) => w.length >= 4)).toBe(true);
	});

	it("uses each letter only as often as it was given", () => {
		const all = findAnagrams(words, "ballon");
		const found = [...all.exact, ...all.shorter.flatMap((g) => g.words)];
		expect(found).toContain("ball");
		expect(found).not.toContain("balloon");
	});

	it("returns nothing for fewer than four letters", () => {
		expect(findAnagrams(words, "cat")).toEqual({ letters: "cat", exact: [], shorter: [] });
		expect(findAnagrams(words, "")).toEqual({ letters: "", exact: [], shorter: [] });
	});

	it("is fast enough to run on every keystroke", () => {
		const start = performance.now();
		findAnagrams(words, "abcdefghijklmnopqrstuvwx");
		expect(performance.now() - start).toBeLessThan(250);
	});
});
