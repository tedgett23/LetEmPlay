// The ONLY place games should import PixiJS from.
// 'pixi.js/unsafe-eval' swaps Pixi's runtime code generation for CSP-safe versions, so we
// never need 'unsafe-eval' in the CSP. Import order matters: it must come first.
import 'pixi.js/unsafe-eval';
import { Application, Container } from 'pixi.js';
import type { GameContext } from './types';
import { palette } from './theme';
import { devicePixelRatioCapped, fitLogical, observeSize, type Size } from './viewport';

export * from 'pixi.js';

/** The shell waits for ready; navigating away during renderer initialization is safe. */
export function mountPixiStage(ctx: GameContext, size: Size, setup: (s: PixiStage) => void) {
	let stage: PixiStage | undefined;
	const ready = createPixiStage(ctx.container, size, palette.bg).then((s) => {
		if (ctx.signal.aborted) return s.destroy();
		stage = s;
		setup(s);
	});
	return { ready, destroy: () => stage?.destroy() };
}

export interface PixiStage {
	app: Application;
	/** Draw in logical coordinates here; it is scaled + letterboxed to the container. */
	root: Container;
	logical: Size;
	/** Convert a container-relative CSS px point (e.g. from attachGestures) to logical coords. */
	toLogical(p: { x: number; y: number }): { x: number; y: number };
	destroy(): void;
}

export async function createPixiStage(
	container: HTMLElement,
	logical: Size,
	background: number
): Promise<PixiStage> {
	const app = new Application();
	await app.init({
		background,
		antialias: true,
		resolution: devicePixelRatioCapped(),
		autoDensity: true,
		autoStart: false // games drive rendering from the kit loop
	});
	app.canvas.style.display = 'block';
	app.canvas.style.touchAction = 'none';
	container.appendChild(app.canvas);

	const root = new Container();
	app.stage.addChild(root);

	let fit = fitLogical({ width: 1, height: 1 }, logical);
	const layout = (size: Size) => {
		app.renderer.resize(size.width, size.height);
		fit = fitLogical(size, logical);
		root.scale.set(fit.scale);
		root.position.set(fit.x, fit.y);
		app.render(); // also redraw a paused game or an idle turn-based board
	};
	layout({ width: container.clientWidth, height: container.clientHeight });
	const stopObserving = observeSize(container, layout);

	return {
		app,
		root,
		logical,
		toLogical: (p) => ({ x: (p.x - fit.x) / fit.scale, y: (p.y - fit.y) / fit.scale }),
		destroy() {
			stopObserving();
			// sheetAndSounds unloads cached textures after the stage is destroyed.
			app.destroy({ removeView: true }, { children: true });
		}
	};
}
