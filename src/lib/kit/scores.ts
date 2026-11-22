import { createStorage, type KVBackend } from './storage';
import type { GameId } from './types';

/** Returns true if `score` is a new best (and stores it). */
export function recordScore(gameId: GameId, score: number, backend?: KVBackend | null): boolean {
	const s = createStorage(gameId, backend);
	const best = s.get<number>('best', 0);
	if (score > best) {
		s.set('best', score);
		return true;
	}
	return false;
}

export function getBest(gameId: GameId, backend?: KVBackend | null): number {
	return createStorage(gameId, backend).get<number>('best', 0);
}
