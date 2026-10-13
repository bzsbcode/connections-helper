import type { TodayResponse } from "../types";
import { getDefinitions } from "./definitions";
import { renderHomePage } from "./home-page";
import { getPuzzle } from "./puzzle";

interface Env {
	ASSETS: Fetcher;
	/** Puzzle and definition cache (`puzzle:YYYY-MM-DD`, `def:<word>`). */
	CACHE: KVNamespace;
}

const json = (body: unknown, status = 200, cacheControl = "no-store") =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
	});

const methodNotAllowed = () => {
	const res = json({ error: "method_not_allowed" }, 405);
	res.headers.set("Allow", "GET, HEAD");
	return res;
};

const readable = (method: string) => method === "GET" || method === "HEAD";

/** Letters (any script), digits, spaces, hyphens, apostrophes and dots: everything a board word can hold. */
const WORD_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} '’.\-]*[\p{L}\p{N}.])?$/u;

async function handleHome(request: Request, env: Env): Promise<Response> {
	const page = await env.ASSETS.fetch(request);
	if (!readable(request.method) || !page.ok || !page.headers.get("Content-Type")?.includes("text/html")) return page;
	const result = await getPuzzle(env.CACHE, new Date());
	return renderHomePage(page, result.ok ? result : null);
}

async function handleToday(request: Request, env: Env): Promise<Response> {
	if (!readable(request.method)) return methodNotAllowed();
	const result = await getPuzzle(env.CACHE, new Date());
	if (!result.ok) return json({ error: "unavailable" }, 503);
	const body: TodayResponse = { puzzle: result.puzzle, stale: result.stale };
	// Short, because the board changes at Budapest midnight.
	return json(body, 200, result.stale ? "no-store" : "public, max-age=300");
}

async function handleDefine(request: Request, env: Env, url: URL): Promise<Response> {
	if (!readable(request.method)) return methodNotAllowed();
	const word = (url.searchParams.get("word") ?? "").trim().replace(/\s+/g, " ");
	if (url.searchParams.getAll("word").length !== 1 || word.length < 1 || word.length > 40 || !WORD_RE.test(word)) {
		return json({ error: "invalid_word" }, 400);
	}
	const definitions = await getDefinitions(env.CACHE, word);
	// Complete answers barely change; partial ones should be asked for again soon.
	return json(definitions, 200, definitions.complete ? "public, max-age=86400" : "public, max-age=300");
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;
		if (pathname === "/" || pathname === "/index.html") return handleHome(request, env);
		if (pathname === "/api/today") return handleToday(request, env);
		if (pathname === "/api/define") return handleDefine(request, env, url);
		if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
