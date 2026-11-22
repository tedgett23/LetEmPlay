// MVP.md §6 — namespaced, versioned, failure-safe local storage. Nothing ever leaves the device.
const ROOT = 'arcade:v1';
const SCHEMA = 1;

export interface KVBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
	key(index: number): string | null;
	readonly length: number;
}

export interface GameStorage {
	get<T>(key: string, fallback: T): T;
	set<T>(key: string, value: T): boolean;
	remove(key: string): void;
}

function defaultBackend(): KVBackend | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null; // access can throw in some privacy modes
	}
}

export function createStorage(
	namespace: string,
	backend: KVBackend | null = defaultBackend()
): GameStorage {
	const prefix = `${ROOT}:${namespace}:`;
	return {
		get<T>(key: string, fallback: T): T {
			try {
				const raw = backend?.getItem(prefix + key);
				if (raw == null) return fallback;
				const parsed = JSON.parse(raw) as { v?: number; d?: T };
				if (parsed?.v !== SCHEMA || !('d' in parsed)) return fallback;
				return parsed.d as T;
			} catch {
				return fallback;
			}
		},
		set<T>(key: string, value: T): boolean {
			try {
				backend?.setItem(prefix + key, JSON.stringify({ v: SCHEMA, d: value }));
				return !!backend;
			} catch {
				return false; // quota exceeded / private mode — never crash a game
			}
		},
		remove(key: string) {
			try {
				backend?.removeItem(prefix + key);
			} catch {
				/* ignore */
			}
		}
	};
}

/** Wipes every key this app owns (Settings → Reset all). */
export function clearAllAppData(backend: KVBackend | null = defaultBackend()): void {
	if (!backend) return;
	try {
		const keys: string[] = [];
		for (let i = 0; i < backend.length; i++) {
			const k = backend.key(i);
			if (k?.startsWith(ROOT + ':')) keys.push(k);
		}
		keys.forEach((k) => backend.removeItem(k));
	} catch {
		/* ignore */
	}
}

let persistRequested = false;
/** Best effort: ask the browser not to evict our storage. Call after the first game over. */
export function requestPersistence(): void {
	if (persistRequested) return;
	persistRequested = true;
	try {
		void navigator.storage?.persist?.();
	} catch {
		/* ignore */
	}
}
