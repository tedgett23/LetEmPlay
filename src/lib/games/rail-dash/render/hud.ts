// Rail Dash HUD: plain DOM over the 3D canvas (score, coins, pause). Text stays crisp at any
// resolution, and the pause control is a real, labelled button.
import { palette } from '../../../kit/theme';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class RailDashHud {
	readonly root = document.createElement('div');
	private score = document.createElement('div');
	private coins = document.createElement('div');
	private hint = document.createElement('div');
	private shownScore = -1;
	private shownCoins = -1;

	constructor(container: HTMLElement, onPause: () => void) {
		const r = this.root;
		Object.assign(r.style, {
			position: 'absolute',
			inset: '0',
			pointerEvents: 'none',
			fontFamily: 'ui-rounded, system-ui, -apple-system, sans-serif',
			fontWeight: '900',
			color: '#fff',
			textShadow: `0 3px 0 ${hex(palette.bgDeep)}`
		});
		Object.assign(this.score.style, {
			position: 'absolute',
			left: '16px',
			top: '12px',
			fontSize: '44px',
			lineHeight: '1'
		});
		Object.assign(this.coins.style, {
			position: 'absolute',
			left: '18px',
			top: '62px',
			fontSize: '26px',
			color: hex(palette.yellow)
		});
		Object.assign(this.hint.style, {
			position: 'absolute',
			left: '0',
			right: '0',
			bottom: '18%',
			textAlign: 'center',
			fontSize: '26px',
			transition: 'opacity 0.4s'
		});
		this.hint.textContent = 'Swipe to switch lanes, jump and slide';

		const pause = document.createElement('button');
		pause.type = 'button';
		pause.setAttribute('aria-label', 'Pause');
		Object.assign(pause.style, {
			position: 'absolute',
			right: '12px',
			top: '12px',
			width: '56px',
			height: '56px',
			borderRadius: '16px',
			border: 'none',
			background: 'rgba(18, 15, 46, 0.35)',
			pointerEvents: 'auto',
			touchAction: 'manipulation',
			display: 'grid',
			placeItems: 'center',
			padding: '0'
		});
		const bars = document.createElement('div');
		Object.assign(bars.style, {
			width: '22px',
			height: '26px',
			borderLeft: '7px solid #fff',
			borderRight: '7px solid #fff',
			boxSizing: 'border-box'
		});
		pause.appendChild(bars);
		// Keep the pause press out of the swipe detector (it captures the pointer otherwise,
		// and the click would never reach the button).
		pause.addEventListener('pointerdown', (e) => e.stopPropagation());
		pause.addEventListener('click', onPause);

		r.append(this.score, this.coins, this.hint, pause);
		container.appendChild(r);
	}

	set(score: number, coins: number) {
		if (score !== this.shownScore) {
			this.shownScore = score;
			this.score.textContent = String(score);
		}
		if (coins !== this.shownCoins) {
			this.shownCoins = coins;
			this.coins.textContent = `● ${coins}`;
		}
	}

	showHint(show: boolean) {
		this.hint.style.opacity = show ? '1' : '0';
	}

	destroy() {
		this.root.remove();
	}
}
