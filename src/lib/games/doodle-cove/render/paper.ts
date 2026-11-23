import { inks, type Mark, type Tool } from '../logic/drawing';
import { SIDE } from '../logic/pages';

// Ink lives on a transparent canvas beneath a separate outline layer. No animation loop:
// append just the newest segment as the finger moves; replay only on undo, cancel or opening.
export function drawingPaper(
	canvas: HTMLCanvasElement,
	shapes: string[],
	marks: Mark[],
	pick: () => { tool: Tool; ink: number },
	changed: () => void
) {
	const scale = 2;
	canvas.width = canvas.height = SIDE * scale;
	const g = canvas.getContext('2d')!;
	g.scale(scale, scale);
	const paths = shapes.map((d) => new Path2D(d));
	const outside = paths.map((path) => {
		const mask = new Path2D();
		mask.rect(-1, -1, SIDE + 2, SIDE + 2);
		mask.addPath(path);
		return mask;
	});

	function bucket(region: number, ink: number) {
		g.save();
		if (region >= 0) g.clip(paths[region]!);
		// Exclude shapes printed in front, e.g. a turtle's shell markings. -1 is the paper.
		for (let i = region + 1; i < outside.length; i++) g.clip(outside[i]!, 'evenodd');
		g.globalCompositeOperation = 'source-over';
		g.fillStyle = inks[ink]!;
		g.fillRect(0, 0, SIDE, SIDE);
		g.restore();
	}
	type Stroke = Exclude<Mark, { tool: 'fill' }>;
	function brush(m: Stroke) {
		g.globalCompositeOperation = m.tool === 'eraser' ? 'destination-out' : 'source-over';
		g.lineCap = g.lineJoin = 'round';
		g.lineWidth = m.tool === 'pen' ? 4 : m.tool === 'marker' ? 16 : 25;
		g.strokeStyle = g.fillStyle = inks[m.ink]!;
	}
	function segment(points: number[], i: number) {
		g.beginPath();
		if (i === 0) {
			g.arc(points[0]!, points[1]!, g.lineWidth / 2, 0, 2 * Math.PI);
			g.fill();
		} else {
			g.moveTo(points[i - 2]!, points[i - 1]!);
			g.lineTo(points[i]!, points[i + 1]!);
			g.stroke();
		}
	}
	function replay() {
		g.clearRect(0, 0, SIDE, SIDE);
		for (const mark of marks) {
			if (mark.tool === 'fill') bucket(mark.region, mark.ink);
			else {
				brush(mark);
				for (let i = 0; i < mark.points.length; i += 2) segment(mark.points, i);
			}
		}
	}
	replay();
	let pointer: number | null = null;
	let rect: DOMRect;
	let current: Mark | null = null;
	const point = (e: PointerEvent) => [
		Math.round(((e.clientX - rect.left) * SIDE) / rect.width),
		Math.round(((e.clientY - rect.top) * SIDE) / rect.height)
	];
	function down(e: PointerEvent) {
		if (pointer !== null || e.button !== 0) return;
		pointer = e.pointerId;
		canvas.setPointerCapture(pointer);
		rect = canvas.getBoundingClientRect();
		const { tool, ink } = pick();
		const points = point(e);
		if (tool === 'fill') {
			let region = paths.length - 1;
			while (
				region >= 0 &&
				!g.isPointInPath(paths[region]!, points[0]! * scale, points[1]! * scale)
			)
				region--;
			current = { tool, ink, region };
		} else {
			current = { tool, ink, points };
			brush(current);
			segment(points, 0);
		}
	}
	function move(e: PointerEvent) {
		if (pointer !== e.pointerId || !current || current.tool === 'fill') return;
		const p = current.points;
		const next = point(e);
		if (next[0] === p[p.length - 2] && next[1] === p[p.length - 1]) return;
		p.push(...next);
		segment(p, p.length - 2);
	}
	function up(e: PointerEvent) {
		if (pointer !== e.pointerId || !current) return;
		if (current.tool === 'fill') bucket(current.region, current.ink);
		else move(e);
		marks.push(current);
		current = null;
		pointer = null;
		changed();
	}
	function cancel() {
		if (!current) return;
		const redraw = current.tool !== 'fill';
		current = null;
		pointer = null;
		if (redraw) replay();
	}
	const interrupted = (e: PointerEvent) => {
		if (e.pointerId === pointer) cancel();
	};
	const events = new AbortController();
	const opts = { signal: events.signal };
	canvas.addEventListener('pointerdown', down, opts);
	canvas.addEventListener('pointermove', move, opts);
	canvas.addEventListener('pointerup', up, opts);
	canvas.addEventListener('pointercancel', interrupted, opts);
	canvas.addEventListener('lostpointercapture', interrupted, opts);
	return {
		cancel,
		undo() {
			cancel();
			marks.pop();
			replay();
			changed();
		},
		clear() {
			cancel();
			marks.length = 0;
			replay();
			changed();
		},
		destroy() {
			events.abort();
		}
	};
}
