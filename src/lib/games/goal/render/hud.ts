import { goal as str } from '../../../strings';
import type { GameState } from '../logic/game';
import './hud.css';

export class MatchHud {
	readonly root = document.createElement('div');
	private text(tag: string, cls: string, parent: HTMLElement = this.root) {
		const el = document.createElement(tag);
		el.className = cls;
		parent.append(el);
		return el;
	}
	private card = this.text('div', 'goal-card');
	private level = this.text('b', 'goal-stage', this.card);
	private course = this.text('span', 'goal-course', this.card);
	private result = this.text('div', 'goal-result');
	private score = this.text('b', 'goal-points', this.result);
	private balls = this.text('span', 'goal-balls', this.result);
	private note = this.text('div', 'goal-note');
	private hint = this.text('div', 'goal-coach');
	private clock = 0;
	private lastLevel = -1;
	private lastScore = -1;
	private lastBalls = -1;
	constructor(host: HTMLElement, pause: () => void) {
		this.root.className = 'goal-hud';
		const button = document.createElement('button');
		button.className = 'goal-pause';
		button.textContent = 'Ⅱ';
		button.setAttribute('aria-label', str.pause);
		button.addEventListener('pointerdown', (e) => e.stopPropagation());
		button.onclick = pause;
		this.root.append(button);
		this.hint.textContent = str.hint;
		host.append(this.root);
	}
	sync(s: GameState, dt: number) {
		if (this.lastLevel !== s.levelIndex) {
			this.lastLevel = s.levelIndex;
			this.level.textContent = str.level(s.levelIndex + 1);
			this.course.textContent = str.courses[s.levelIndex % 3]!;
		}
		if (this.lastScore !== s.score) {
			this.lastScore = s.score;
			this.score.textContent = String(s.score);
		}
		if (this.lastBalls !== s.balls) {
			this.lastBalls = s.balls;
			this.balls.textContent = '●'.repeat(s.balls) + '○'.repeat(3 - s.balls);
		}
		this.hint.hidden = s.levelIndex !== 0 || s.started;
		this.clock = Math.max(0, this.clock - dt);
		this.note.hidden = this.clock === 0;
	}
	flash(label: string, time: number) {
		this.note.textContent = label;
		this.clock = time;
	}
	reset() {
		this.clock = 0;
	}
	destroy() {
		this.root.remove();
	}
}
