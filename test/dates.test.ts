import { describe, expect, it } from "vitest";
import { dateIn, formatDate, isIsoDate, previousDay, puzzleDates } from "../src/worker/dates";

describe("dateIn", () => {
	it("uses the Budapest calendar date, not UTC", () => {
		// 23:30 UTC on 12 October is already 01:30 on 13 October in Budapest (CEST, UTC+2).
		expect(dateIn(new Date("2026-10-12T23:30:00Z"))).toBe("2026-10-13");
		expect(dateIn(new Date("2026-10-12T21:59:59Z"))).toBe("2026-10-12");
	});

	it("follows the winter offset (CET, UTC+1)", () => {
		expect(dateIn(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
		expect(dateIn(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
	});
});

describe("previousDay", () => {
	it("crosses month, year and leap-day boundaries", () => {
		expect(previousDay("2026-10-13")).toBe("2026-10-12");
		expect(previousDay("2026-03-01")).toBe("2026-02-28");
		expect(previousDay("2028-03-01")).toBe("2028-02-29");
		expect(previousDay("2027-01-01")).toBe("2026-12-31");
	});
});

describe("puzzleDates", () => {
	it("tries today in Budapest, then yesterday", () => {
		expect(puzzleDates(new Date("2026-10-12T23:30:00Z"))).toEqual(["2026-10-13", "2026-10-12"]);
	});
});

describe("isIsoDate", () => {
	it("accepts only real YYYY-MM-DD dates", () => {
		expect(isIsoDate("2026-10-13")).toBe(true);
		expect(isIsoDate("2026-02-30")).toBe(false);
		expect(isIsoDate("2026-1-3")).toBe(false);
		expect(isIsoDate("../2026-10-13")).toBe(false);
	});
});

describe("formatDate", () => {
	it("reads naturally and ignores the server's time zone", () => {
		expect(formatDate("2026-10-13")).toBe("Tuesday 13 October 2026");
	});
});
