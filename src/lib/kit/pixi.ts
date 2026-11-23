// The ONLY place games should import PixiJS from.
// 'pixi.js/unsafe-eval' swaps Pixi's runtime code generation for CSP-safe versions, so we
// never need 'unsafe-eval' in the CSP. Import order matters: it must come first.
import 'pixi.js/unsafe-eval';
import { Application, Container } from 'pixi.js';
import { devicePixelRatioCapped, fitLogical, observeSize, type Size } from './viewport';

export * from 'pixi.js';

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
		resizeTo: container,
		autoStart: false // games drive rendering from the kit loop
	});
	app.canvas.style.display = 'block';
	app.canvas.style.touchAction = 'none';
	container.appendChild(app.canvas);

	const root = new Container();
	app.stage.addChild(root);

	let fit = fitLogical({ width: 1, height: 1 }, logical);
	const layout = (size: Size) => {
		fit = fitLogical(size, logical);
		root.scale.set(fit.scale);
		root.position.set(fit.x, fit.y);
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
			// Don't destroy textures here: spritesheet textures are shared through Pixi's Assets
			// cache. Games unload their own assets (Assets.unload) in destroy().
			app.destroy({ removeView: true }, { children: true });
		}
	};
}
