/** All the copy on the site, in one place. */
export const ui = {
	htmlLang: "en",
	siteTitle: "Connections Helper by bzsbcode",
	navTitle: "Connections Helper",
	description: "Every meaning of every word in today's NYT Connections puzzle, without giving the groups away.",
	menu: { open: "Menu", theme: "Theme", light: "Light", dark: "Dark", system: "System", skip: "Skip to content" },
	footer: {
		rights: "© 2026 bzsb_code.",
		unofficial: "An unofficial helper. Not affiliated with or endorsed by The New York Times.",
		credits: "Definitions from the",
		freeDictionary: "Free Dictionary API",
		and: "and",
		wiktionary: "Wiktionary",
		license: "(CC BY-SA 4.0)",
		localTime: "Budapest time",
		portfolio: "bzsb.eu",
	},
	home: {
		title: "Today's words",
		intro: "Every meaning of each word, the odd and slangy ones too, without giving away a single group.",
		puzzleNo: "No.",
		board: "The board",
		boardHint: "Tap a word to jump to its meanings.",
		meanings: "Meanings",
		search: "Find a word",
		searchPlaceholder: "Type to filter…",
		expandAll: "Expand all",
		collapseAll: "Collapse all",
		noMatch: "No word on today's board matches that.",
		stale: "Today's puzzle couldn't be loaded, so this is the last one saved.",
		lookUp: "Look it up on Wiktionary",
		loading: "Loading meanings…",
		notFound: "No definition found.",
		incomplete: "A dictionary didn't answer, so some meanings may be missing.",
		loadError: "The meanings couldn't be loaded.",
		retry: "Try again",
		source: "Source",
		example: "Example",
		errorTitle: "The puzzle couldn't be loaded",
		errorText: "The New York Times didn't answer, or answered in a way this helper doesn't understand yet. Try again in a minute, or open the official game.",
		ctaTitle: "Ready to group them?",
		ctaText: "Head over to the official game and make your four.",
		ctaButton: "Play Connections",
	},
	notFound: { title: "Page not found", home: "Today's words" },
} as const;

/** The official game. */
export const NYT_GAME_URL = "https://www.nytimes.com/games/connections";

export const wiktionaryUrl = (word: string) => `https://en.wiktionary.org/wiki/Special:Search?search=${encodeURIComponent(word.toLowerCase())}`;
