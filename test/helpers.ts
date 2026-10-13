import type { Kv } from "../src/worker/kv";

/** In-memory KV that records TTLs. */
export class FakeKv implements Kv {
	private store = new Map<string, { value: string; ttl?: number }>();

	async get(key: string): Promise<unknown> {
		const hit = this.store.get(key);
		return hit ? JSON.parse(hit.value) : null;
	}

	async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
		this.store.set(key, { value, ttl: options?.expirationTtl });
	}

	ttl(key: string) {
		return this.store.get(key)?.ttl;
	}

	dump() {
		return [...this.store].map(([k, v]) => `${k}=${v.value}`).join("\n");
	}
}

type Reply = { status: number; body?: unknown } | "throw";

/** A fetch that answers from a URL map (unknown URLs get a 500) and records every URL asked for. */
export function fakeFetch(replies: Record<string, Reply>) {
	const calls: string[] = [];
	const fn = async (input: RequestInfo | URL): Promise<Response> => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		calls.push(url);
		const reply = replies[url] ?? { status: 500 };
		if (reply === "throw") throw new TypeError("network down");
		return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status });
	};
	return Object.assign(fn as typeof fetch, { calls });
}
