// Web Audio wrapper: unlock on first touch, SFX + music buses that honor
// settings, suspend when hidden. All audio files are same-origin.
import type { GlobalSettings } from './settings.svelte';

export interface AudioService {
	/** Fetch + decode a same-origin file. Safe to call before unlock. */
	load(name: string, url: string): Promise<void>;
	play(name: string, opts?: { volume?: number; rate?: number }): void;
	playMusic(name: string, volume?: number): void;
	stopMusic(): void;
	/** Re-read settings (call after settings change). */
	sync(): void;
	suspend(): void;
	resume(): void;
	/** Drop buffers loaded by a game. */
	unloadAll(): void;
}

export function createAudio(settings: Readonly<GlobalSettings>): AudioService {
	let ctx: AudioContext | null = null;
	let sfx: GainNode | null = null;
	let music: GainNode | null = null;
	let musicSrc: AudioBufferSourceNode | null = null;
	const buffers = new Map<string, AudioBuffer>();
	const pending = new Map<string, ArrayBuffer>();

	function ensure(): AudioContext | null {
		if (ctx) return ctx;
		const Ctor = globalThis.AudioContext;
		if (!Ctor) return null;
		ctx = new Ctor();
		sfx = ctx.createGain();
		music = ctx.createGain();
		sfx.connect(ctx.destination);
		music.connect(ctx.destination);
		applyGains();
		return ctx;
	}

	function applyGains() {
		if (sfx) sfx.gain.value = settings.sound ? 1 : 0;
		if (music) music.gain.value = settings.music ? 0.5 : 0;
	}

	async function decodePending() {
		if (!ctx) return;
		for (const [name, data] of pending) {
			pending.delete(name);
			try {
				buffers.set(name, await ctx.decodeAudioData(data));
			} catch {
				/* bad file — stay silent rather than crash */
			}
		}
	}

	// iOS requires a user gesture before audio can start.
	const unlock = () => {
		const c = ensure();
		if (!c) return;
		void c.resume().then(decodePending);
		window.removeEventListener('pointerdown', unlock, true);
	};
	if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlock, true);

	return {
		async load(name, url) {
			if (buffers.has(name) || pending.has(name)) return;
			const data = await (await fetch(url)).arrayBuffer();
			if (ctx) {
				try {
					buffers.set(name, await ctx.decodeAudioData(data));
				} catch {
					/* ignore */
				}
			} else {
				pending.set(name, data);
			}
		},
		play(name, opts = {}) {
			if (!ctx || !sfx || !settings.sound) return;
			const buf = buffers.get(name);
			if (!buf) return;
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.playbackRate.value = opts.rate ?? 1;
			const g = ctx.createGain();
			g.gain.value = opts.volume ?? 1;
			src.connect(g).connect(sfx);
			src.start();
		},
		playMusic(name, volume = 1) {
			this.stopMusic();
			if (!ctx || !music) return;
			const buf = buffers.get(name);
			if (!buf) return;
			musicSrc = ctx.createBufferSource();
			musicSrc.buffer = buf;
			musicSrc.loop = true;
			const g = ctx.createGain();
			g.gain.value = volume;
			musicSrc.connect(g).connect(music);
			musicSrc.start();
		},
		stopMusic() {
			try {
				musicSrc?.stop();
			} catch {
				/* already stopped */
			}
			musicSrc = null;
		},
		sync: applyGains,
		suspend() {
			void ctx?.suspend();
		},
		resume() {
			void ctx?.resume();
		},
		unloadAll() {
			this.stopMusic();
			buffers.clear();
			pending.clear();
		}
	};
}

// ---- Sound sets ------------------------------------------------------------------------------
// A sound set is a folder written by scripts/build-assets.mjs with an index.json listing the
// sound names and the formats available (e.g. ["m4a", "ogg"]).

const MIME: Record<string, string> = {
	m4a: 'audio/mp4; codecs="mp4a.40.2"',
	mp3: 'audio/mpeg',
	ogg: 'audio/ogg; codecs=vorbis'
};

/** First format the device can play, in the order given. Falls back to the first listed. */
export function pickFormat(formats: string[], canPlay: (mime: string) => boolean): string | null {
	for (const f of formats) if (MIME[f] && canPlay(MIME[f])) return f;
	return formats[0] ?? null;
}

function browserCanPlay(mime: string): boolean {
	try {
		return document.createElement('audio').canPlayType(mime) !== '';
	} catch {
		return false;
	}
}

/** Load every sound in a set. Missing/undecodable files are skipped, never fatal. */
export async function loadSoundSet(
	audio: AudioService,
	dir: string,
	onProgress?: (p: number) => void
): Promise<void> {
	let index: { formats: string[]; sounds: string[] };
	try {
		index = (await (await fetch(`${dir}/index.json`)).json()) as typeof index;
	} catch {
		return;
	}
	const fmt = pickFormat(index.formats, browserCanPlay);
	if (!fmt) return;
	let done = 0;
	await Promise.all(
		index.sounds.map(async (name) => {
			try {
				await audio.load(name, `${dir}/${name}.${fmt}`);
			} catch {
				/* stay silent rather than fail the game */
			}
			onProgress?.(++done / index.sounds.length);
		})
	);
}
