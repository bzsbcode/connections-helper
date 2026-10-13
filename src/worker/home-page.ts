/**
 * Fills the statically built home page (src/views/Home.astro) with today's words, so
 * the board and the list are in the HTML without JavaScript. The static page ships in
 * its error state; only a successful fill swaps that for the board.
 */
import type { Puzzle } from "../types";
import { ui, wiktionaryUrl } from "../ui";
import { formatDate } from "./dates";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const num = (i: number) => String(i + 1).padStart(2, "0");

function cell(word: string, i: number): string {
	return `<li class="border-b border-r border-rule"><a href="#w-${num(i)}" data-jump="${num(i)}" class="group relative flex h-full min-h-[4.75rem] flex-col justify-between gap-2 p-2 transition-colors hover:bg-fg hover:text-bg focus-visible:z-10 focus-visible:bg-fg focus-visible:text-bg sm:min-h-24 sm:p-3">
	<span class="text-[0.7rem] font-semibold tabular-nums text-blue transition-colors group-hover:text-[var(--signal-inv)] group-focus-visible:text-[var(--signal-inv)]" aria-hidden="true">${num(i)}</span>
	<span class="text-[clamp(0.72rem,3.3vw,1.0625rem)] font-extrabold font-stretch-semi-condensed uppercase leading-tight tracking-tight [overflow-wrap:anywhere]">${esc(word)}</span>
</a></li>`;
}

function entry(word: string, i: number): string {
	const n = num(i);
	// The button starts disabled and the page script enables it, so without JS there is no dead control, just the link.
	return `<li id="w-${n}" class="scroll-mt-20 border-b border-rule" data-entry data-word="${esc(word)}">
	<h3>
		<button type="button" disabled aria-expanded="false" aria-controls="p-${n}" data-toggle class="group grid w-full grid-cols-12 items-center gap-x-4 py-5 text-left md:py-6">
			<span class="col-span-2 text-4xl font-light font-stretch-condensed tabular-nums leading-none text-blue transition-transform duration-500 ease-out-expo group-enabled:group-hover:translate-x-2 md:text-6xl" aria-hidden="true">${n}</span>
			<span class="col-span-8 text-3xl font-extrabold font-stretch-semi-condensed uppercase leading-none tracking-tight [overflow-wrap:anywhere] md:text-[2.6rem]">${esc(word)}</span>
			<span class="col-span-2 justify-self-end text-3xl font-light leading-none transition-transform duration-500 ease-out-expo group-aria-expanded:rotate-45 group-enabled:group-hover:text-blue group-disabled:hidden" aria-hidden="true">+</span>
		</button>
	</h3>
	<div id="p-${n}" data-panel hidden></div>
	<div class="grid grid-cols-12 gap-x-4 pb-5 [.js_&]:hidden">
		<p class="col-span-10 col-start-3 text-sm font-semibold"><a href="${esc(wiktionaryUrl(word))}" target="_blank" rel="noreferrer" class="ink-link">${esc(ui.home.lookUp)} <span class="arrow" aria-hidden="true">↗</span></a></p>
	</div>
</li>`;
}

export function renderHomePage(page: Response, result: { puzzle: Puzzle; stale: boolean } | null): Response {
	const rewriter = new HTMLRewriter();
	if (result) {
		const { puzzle, stale } = result;
		rewriter
			.on("[data-unavailable]", { element: (el) => void el.remove() })
			.on("[data-ready]", { element: (el) => void el.removeAttribute("hidden") })
			.on("[data-puzzle-number]", { element: (el) => void el.setInnerContent(`${ui.home.puzzleNo} ${puzzle.number}`) })
			.on("[data-puzzle-date]", {
				element: (el) => {
					el.setAttribute("datetime", puzzle.date);
					el.setInnerContent(formatDate(puzzle.date));
				},
			})
			.on("[data-stale]", { element: (el) => void (stale ? el.removeAttribute("hidden") : el.remove()) })
			.on("[data-board]", { element: (el) => void el.setInnerContent(puzzle.words.map(cell).join(""), { html: true }) })
			.on("[data-entries]", { element: (el) => void el.setInnerContent(puzzle.words.map(entry).join(""), { html: true }) });
	} else {
		rewriter.on("[data-ready]", { element: (el) => void el.remove() });
	}
	const res = rewriter.transform(page);
	const out = new Response(res.body, res);
	out.headers.set("Cache-Control", "no-cache");
	out.headers.delete("ETag");
	return out;
}
