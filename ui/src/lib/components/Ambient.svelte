<script lang="ts">
	// The glow around the music video in the player view (the setting under "Enable music videos";
	// $lib/ambient has the effect itself). This owns the canvas, feeds it frames, and draws only
	// when there is something new: the newest video frame every GAP while the video plays, then for
	// the half second the blend takes to land, then not at all until the next frame or a resize.
	import { fade } from 'svelte/transition';
	import * as api from '$lib/api';
	import { createGlow, type Box, type Glow } from '$lib/ambient';
	import { logUi } from '$lib/errlog';
	import { prefs } from '$lib/player.svelte';
	import { video, videoElement } from '$lib/video.svelte';

	/** The picture's box in the player view. */
	let { box }: { box: HTMLElement } = $props();

	let canvas: HTMLCanvasElement;
	/** A frame has been drawn, so the canvas can fade in on it rather than on a blank. */
	let ready = $state(false);

	/** Draw soon: within GAP for a new frame, on the next animation frame when `now` (the picture
	 *  moved, and the hole cut has to follow it). Swapped for the live one while the renderer exists. */
	let kick: (now?: boolean) => void = () => {};
	/** Linux: the hole mpv's picture shows through, as the page reports it (viewport pixels). The
	 *  glow must not paint it. Kept in viewport pixels and placed against the canvas at each draw,
	 *  because the canvas moves too: collapsing the sidebar slides the whole view over. */
	let hole: Box | null = null;
	/** Where the canvas sits in the viewport, as of the last measure. */
	let origin = { x: 0, y: 0 };

	/** The glow draws at most this often, ms. A draw repaints the whole player view (on the
	 *  AppImage's X11 path WebKit and GTK also copy all of it out), and the frame blend already
	 *  spreads a change over ~0.3 s, so a draw per video frame bought cost, not light. */
	const GAP = 1000 / 15;

	/** Context attempts so far. State, so a retry re-runs the effect below. */
	let tries = $state(0);
	/** One per canvas for its whole life: a canvas hands back the same context however often it is
	 *  asked, so releasing it is for the unmount alone, never for a re-run of the effect below. */
	let glow: Glow | null = null;
	$effect(() => () => glow?.destroy());

	$effect(() => {
		const native = prefs.nativeVideo;
		const el = box;
		const made = glow ?? createGlow(canvas);
		if (typeof made === 'string') {
			// On Linux the setting is also what turns WebGL on (lib.rs `set_webgl`), and that reaches
			// the page a moment after the setting's own reply. Past two seconds it is not coming.
			if (tries < 8) {
				const retry = setTimeout(() => tries++, 250);
				return () => clearTimeout(retry);
			}
			logUi('warn', `ambient light: ${made}`);
			return;
		}
		glow = made;
		let alive = true;
		let raf = 0;
		let settle: ReturnType<typeof setTimeout> | undefined;
		/** Takes the frame that arrived since the last draw, if one did. */
		let upload: (() => boolean) | null = null;
		let lastFrame = 0;
		let lastDraw = 0;
		let pic: Box | null = null;
		let radius = 0;

		function draw() {
			if (!pic) return;
			const now = performance.now();
			// Seconds since the last draw, for the blend. Capped: after a long pause the next frame
			// should all but replace the old one, not ease in from minutes ago.
			const dt = lastDraw ? Math.min(0.25, (now - lastDraw) / 1000) : 0;
			lastDraw = now;
			const at = hole && { ...hole, x: hole.x - origin.x, y: hole.y - origin.y };
			glow!.draw({ pic, hole: at, radius }, dt);
		}

		function tick(now: number) {
			raf = 0;
			const fresh = upload?.() ?? false;
			upload = null;
			if (fresh) {
				lastFrame = now;
				ready = true;
			}
			draw();
			clearTimeout(settle);
			// While the video plays a frame lands every 30-40 ms, and the newest is drawn every GAP.
			// When they stop (paused, seeking) the blend still has to ease the rest of the way, so draw
			// on for a bit.
			if (fresh) settle = setTimeout(() => kick(), 80);
			else if (now - lastFrame < 600) kick();
		}

		/** A draw held back by GAP. */
		let wait: ReturnType<typeof setTimeout> | undefined;
		kick = (now = false) => {
			if (raf || !alive) return;
			// Half a display frame early: the animation frame it waits for lands up to one later.
			const early = now ? 0 : lastDraw + GAP - 8 - performance.now();
			if (early > 0) {
				wait ??= setTimeout(() => ((wait = undefined), kick()), early);
				return;
			}
			clearTimeout(wait);
			wait = undefined;
			raf = requestAnimationFrame(tick);
		};

		// The picture's box against the canvas. Both move together while the view flies in, so this
		// holds through the transform; a size change is what moves either, so an observer covers it.
		const measure = () => {
			const c = canvas.getBoundingClientRect();
			const b = el.getBoundingClientRect();
			origin = { x: c.left, y: c.top };
			pic = { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height };
			// rounded-2xl, as NowPlaying draws the picture.
			radius = parseFloat(getComputedStyle(document.documentElement).fontSize);
			const w = Math.round(c.width);
			const h = Math.round(c.height);
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
				// Resizing clears it, and the next animation frame is a frame after this paint.
				lastDraw = 0;
				draw();
			}
			kick(true);
		};
		const ro = new ResizeObserver(measure);
		ro.observe(canvas);
		ro.observe(el);

		const stops: (() => void)[] = [];
		let seq = 0;
		let take = () => {};
		if (native) {
			// Rust holds each request up to a quarter second for a new frame, so this asks about as
			// often as frames come, and four times a second while paused. Nothing may end this loop
			// but the unmount: the component outlives most track changes, so a loop that stopped
			// on one odd reply left the glow dark until the setting was turned off and on.
			const sleep = (ms: number) => new Promise<null>((r) => setTimeout(r, ms, null));
			let asked = 0;
			(async () => {
				while (alive) {
					if (document.hidden) {
						await new Promise((r) =>
							document.addEventListener('visibilitychange', r, { once: true })
						);
						continue;
					}
					try {
						// No faster than the glow draws: a frame it would skip is a wasted round trip.
						await sleep(asked + GAP - 8 - performance.now());
						asked = performance.now();
						// Raced, so a request that never comes back cannot hold the loop either.
						const reply = await Promise.race([api.ambientFrame(seq), sleep(2000)]);
						if (!alive) break;
						const buf = Array.isArray(reply)
							? Uint8Array.from(reply)
							: reply && new Uint8Array(reply);
						if (!buf || buf.length <= 12) continue;
						const head = new DataView(buf.buffer, buf.byteOffset, 12);
						seq = head.getUint32(0, true);
						const w = head.getUint32(4, true);
						const h = head.getUint32(8, true);
						const rgba = buf.subarray(12);
						upload = () => glow!.frame({ w, h, rgba });
						kick();
					} catch (e) {
						logUi('warn', `ambient light: frame request failed: ${e}`);
						await sleep(1000);
					}
				}
			})();
		} else {
			const v = videoElement();
			if (v) {
				take = () => {
					upload = () => v.readyState >= 2 && glow!.frame(v);
					kick();
				};
				// A plain boolean: TypeScript's DOM types say every engine has it, and older WebKitGTK doesn't.
				if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
					let id = 0;
					const onFrame = () => {
						take();
						id = v.requestVideoFrameCallback(onFrame);
					};
					id = v.requestVideoFrameCallback(onFrame);
					stops.push(() => v.cancelVideoFrameCallback(id));
				} else {
					// No frame callback: look for a new position once a display frame while it plays.
					let t = -1;
					let poll = 0;
					const look = () => {
						poll = 0;
						if (v.currentTime !== t) {
							t = v.currentTime;
							take();
						}
						if (!v.paused && alive) poll = requestAnimationFrame(look);
					};
					v.addEventListener('play', look);
					v.addEventListener('seeked', look);
					look();
					stops.push(() => {
						cancelAnimationFrame(poll);
						v.removeEventListener('play', look);
						v.removeEventListener('seeked', look);
					});
				}
				take(); // the frame already up, for a paused video
			}
		}

		// A driver reset takes the context. Allow it back, then rebuild on it.
		// ponytail: waits for WebKit to restore it. If a loss that never comes back shows up in the
		// log, rebuild on a fresh canvas instead.
		const onLost = (e: Event) => {
			e.preventDefault();
			logUi('warn', 'ambient light: WebGL context lost');
		};
		const onRestored = () => {
			const made = createGlow(canvas);
			if (typeof made !== 'string') glow = made;
			lastDraw = 0;
			seq = 0;
			take();
			kick(true);
		};
		canvas.addEventListener('webglcontextlost', onLost);
		canvas.addEventListener('webglcontextrestored', onRestored);

		return () => {
			alive = false;
			kick = () => {};
			cancelAnimationFrame(raf);
			clearTimeout(settle);
			clearTimeout(wait);
			ro.disconnect();
			for (const stop of stops) stop();
			canvas.removeEventListener('webglcontextlost', onLost);
			canvas.removeEventListener('webglcontextrestored', onRestored);
		};
	});

	// After the renderer's effect, so it kicks the live renderer. The canvas is measured again here
	// rather than trusted from mount: the view is still flying in then, and a transform fires no
	// observer, so an origin measured mid-flight would put the hole where the picture was.
	$effect(() => {
		const h = prefs.nativeVideo ? video.hole : null;
		hole = h && { ...h };
		if (h) {
			const c = canvas.getBoundingClientRect();
			origin = { x: c.left, y: c.top };
		}
		kick(true);
	});
</script>

<!-- First in the view and absolute, so everything after it paints above. No CSS filter or blur:
     the canvas holds the finished glow. Softer over a light theme, where a dark scene would
     otherwise read as a smudge rather than light. -->
<canvas
	bind:this={canvas}
	out:fade={{ duration: 300 }}
	aria-hidden="true"
	class="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 {ready
		? 'opacity-60 dark:opacity-100'
		: 'opacity-0'}"
></canvas>
