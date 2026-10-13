/** Shared between the worker and the page script. Nothing here may carry grouping data. */

/** Today's board: the 16 words in board order, with no categories or groups. */
export interface Puzzle {
	/** The NYT puzzle number. */
	number: number;
	/** The print date, YYYY-MM-DD. */
	date: string;
	words: string[];
}

export type Source = "Free Dictionary" | "Wiktionary";

export interface Sense {
	text: string;
	example?: string;
	/** Every source that gave this sense; near-duplicates are merged into one. */
	sources: Source[];
}

export interface SenseGroup {
	/** Lowercase, e.g. "noun", "proper noun". */
	partOfSpeech: string;
	/** The headword the senses belong to, e.g. "Mars" or "cup" when the board says MARS or CUPS. */
	term: string;
	senses: Sense[];
}

export interface WordDefinitions {
	word: string;
	groups: SenseGroup[];
	/** False when a source failed (rate limit, outage), so the result may be missing senses. */
	complete: boolean;
}

/** GET /api/today */
export interface TodayResponse {
	puzzle: Puzzle;
	/** True when today's puzzle couldn't be fetched and this is the last one saved. */
	stale: boolean;
}

export interface ApiError {
	error: string;
}
