import { afterEach, expect, it, vi } from 'vitest';
import { createAudio } from './audio';

afterEach(() => vi.unstubAllGlobals());

it('a late response from a previous game cannot claim a sound name in the next one', async () => {
	let finish!: (value: ArrayBuffer) => void;
	const data = new Promise<ArrayBuffer>((resolve) => (finish = resolve));
	const fetch = vi
		.fn<(url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>>()
		.mockResolvedValue({ ok: true, arrayBuffer: () => data });
	vi.stubGlobal('fetch', fetch);
	const audio = createAudio({ sound: true, music: true, haptics: true, reducedMotion: false });
	const old = new AbortController();
	const loading = audio.load('throw', '/first/throw', old.signal);
	await Promise.resolve();
	old.abort();
	audio.unloadAll();
	finish(new ArrayBuffer(1));
	await loading;
	await audio.load('throw', '/second/throw', new AbortController().signal);
	expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/first/throw', '/second/throw']);
});
