/**
 * Puzzle dates. The site follows Budapest time, while the NYT publishes on US time,
 * so right after midnight here "today" may not exist upstream yet.
 */

export const TIME_ZONE = "Europe/Budapest";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(s: string): boolean {
	if (!ISO_DATE.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The calendar date at `now` in the given time zone, as YYYY-MM-DD. */
export function dateIn(now: Date, timeZone = TIME_ZONE): string {
	// en-CA formats as YYYY-MM-DD, but parts are safer than relying on a locale's layout.
	const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The day before a YYYY-MM-DD date. */
export function previousDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

/** Dates to try, in order: today in Budapest, then yesterday in case the US hasn't caught up. */
export function puzzleDates(now: Date): [string, string] {
	const today = dateIn(now);
	return [today, previousDay(today)];
}

/** "Tuesday 13 October 2026" for a YYYY-MM-DD date. */
export function formatDate(date: string): string {
	return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
		.format(new Date(`${date}T00:00:00Z`))
		.replace(",", "");
}
