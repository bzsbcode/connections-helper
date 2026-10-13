/**
 * The slice of Workers KV the worker uses, so tests can pass a plain Map-backed fake.
 * KVNamespace satisfies it as is.
 */
export interface Kv {
	get(key: string, type: "json"): Promise<unknown>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Cache reads must never take the page down: a KV hiccup is treated as a miss. */
export async function kvGet(kv: Kv, key: string): Promise<unknown> {
	try {
		return await kv.get(key, "json");
	} catch (err) {
		console.error("kv get failed", key, err);
		return null;
	}
}

export async function kvPut(kv: Kv, key: string, value: unknown, ttl?: number): Promise<void> {
	try {
		// KV refuses TTLs under 60 seconds.
		await kv.put(key, JSON.stringify(value), ttl ? { expirationTtl: Math.max(60, ttl) } : undefined);
	} catch (err) {
		console.error("kv put failed", key, err);
	}
}
