// Ambient light: the player view around a music video glows with the video's own colours. The look
// is youtube-ambilight's (github.com/WesselKroos/youtube-ambilight, MIT, Wessel Kroos) at its
// defaults; the work behind it is not:
//
//   - The extension draws the frame into a canvas the size of the glow and blurs that with a canvas
//     `filter: blur()`, which is most of why it asks for a PassMark 1000 GPU. Here every pass but
//     the last runs on a grid of cells a fortieth of the picture's height (~100x60 for a whole
//     window): the edge projection, a separable Gaussian and the frame blend are a few thousand
//     pixels each, whatever the window size.
//   - Its "spread" is a stack of scaled copies of the frame, each ring outside the picture showing
//     the frame's edge band, blurred until the steps vanish. That is one continuous mapping here:
//     a point outside the picture samples the edge band on the line towards the picture's centre.
//   - Its frame fading is an exponential blend in the grid, so a cut or a strobe eases over ~0.3 s
//     instead of flashing the whole view.
//   - Past the glow, where the extension fades to the page, the whole view gets a wash: the same
//     grid blurred four times wider on a quarter-size grid, so the queue and the far corners take
//     the video's colours too, dimmer the further they are.
//   - Its gradient mask is the last pass, at the canvas's own size, which also dithers (a dark
//     glow on a dark page bands badly in 8 bits) and, on Linux, cuts the hole mpv's picture shows
//     through.

/** A box in canvas pixels, y down. */
export type Box = { x: number; y: number; w: number; h: number };

/** A frame read back by Rust (nativevideo.rs): RGBA rows bottom-up. */
export type Pixels = { w: number; h: number; rgba: Uint8Array };

// The extension's defaults, as fractions of the picture's height. BLUR is its `blur2` of 30
// (30 * 1.275 / 512); BAND is its 12% `edge` ring, half of which lands on each side.
const BLUR = 0.075;
const BAND = 0.06;
/** How far past the picture the glow has handed over to the wash. Its rings plus two blur radii. */
const REACH = 0.3;
/** The wash's grid is this many times coarser, which makes its blur this many times wider. */
const WIDE = 4;
/** The wash's opacity next to the glow; half that in the view's farthest corner. */
const WASH = 0.5;
/** Grid cells per blur radius. Three keeps the Gaussian smooth at 11 taps a pass. */
const CELLS = 3;
/** The frame blend's time constant, seconds: 95% of a cut lands in ~0.35 s. */
const EASE = 0.12;

const VERT = `#version 300 es
void main() {
	gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0);
}`;

// A cell's point on the canvas, and the frame sampled for it: inside the picture the frame itself,
// outside it the copy of the frame grown (by the same amount on every side) until its edge passes
// through the point, pulled in by BAND so it reads the edge band, not the edge row.
const PROJECT = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 grid;
uniform vec2 canvas;
uniform vec4 pic;
uniform float lod;
out vec4 o;
void main() {
	vec2 uv = gl_FragCoord.xy / grid;
	vec2 half_ = pic.zw * 0.5;
	vec2 d = vec2(uv.x, 1.0 - uv.y) * canvas - pic.xy - half_;
	vec2 past = abs(d) - half_;
	vec2 q = d / (half_ + max(max(past.x, past.y), 0.0)) * (1.0 - ${BAND * 2});
	o = vec4(textureLod(src, vec2(0.5 + 0.5 * q.x, 0.5 - 0.5 * q.y), lod).rgb, 1.0);
}`;

// One direction of the Gaussian, 11 bilinear taps for 19 texels (`step_` apart, in the source's
// uv). The glow's vertical pass also blends the result into the previous frame's. `target` is the
// size drawn into, which is smaller than the source for the wash.
const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D img;
uniform sampler2D prev;
uniform vec2 target;
uniform vec2 step_;
uniform float w0;
uniform float offs[5];
uniform float wts[5];
uniform float blend;
out vec4 o;
void main() {
	vec2 uv = gl_FragCoord.xy / target;
	vec3 c = texture(img, uv).rgb * w0;
	for (int i = 0; i < 5; i++) {
		vec2 d = step_ * offs[i];
		c += (texture(img, uv + d).rgb + texture(img, uv - d).rgb) * wts[i];
	}
	if (blend < 1.0) c = mix(texture(prev, uv).rgb, c, blend);
	o = vec4(c, 1.0);
}`;

// Upscale with a cubic B-spline (four bilinear taps, the GPU Gems 2 trick): bilinear alone shows
// the grid as faint diamonds across a gradient this large.
const FINAL = `#version 300 es
precision highp float;
uniform sampler2D glow;
uniform sampler2D wash;
uniform vec2 canvas;
uniform vec4 pic;
uniform vec4 hole;
uniform float radius;
uniform float reach;
uniform float far;
out vec4 o;
float box(vec2 p, vec4 b, float r) {
	vec2 q = abs(p - b.xy - b.zw * 0.5) - b.zw * 0.5 + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec4 cubic(float v) {
	vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
	vec4 s = n * n * n;
	float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
	return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}
vec3 bicubic(sampler2D t, vec2 uv) {
	vec2 size = vec2(textureSize(t, 0));
	uv = uv * size - 0.5;
	vec2 f = fract(uv);
	uv -= f;
	vec4 xc = cubic(f.x), yc = cubic(f.y);
	vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
	vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
	vec4 off = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
	vec3 s0 = texture(t, off.xz).rgb, s1 = texture(t, off.yz).rgb;
	vec3 s2 = texture(t, off.xw).rgb, s3 = texture(t, off.yw).rgb;
	float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
	return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
void main() {
	vec2 p = vec2(gl_FragCoord.x, canvas.y - gl_FragCoord.y);
	vec2 uv = gl_FragCoord.xy / canvas;
	float d = max(box(p, pic, radius), 0.0);
	float near = 1.0 - smoothstep(0.0, reach, d);
	near *= near;
	vec3 rgb = mix(bicubic(wash, uv), bicubic(glow, uv), near);
	float a = mix(${WASH} * (1.0 - 0.5 * smoothstep(0.0, far, d)), 1.0, near);
	// The cut's 1 px edge sits just inside the hole, over the picture. Just outside it the page
	// paints its background under this canvas, and a half-covered pixel there read as a dark border.
	if (hole.z > 0.0) a *= clamp(box(p, hole, radius) + 1.0, 0.0, 1.0);
	// Interleaved gradient noise, one 8-bit step peak to peak: static, so it never shimmers.
	float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
	vec4 c = vec4(rgb * a, a) + n / 255.0;
	o = vec4(min(c.rgb, c.a), c.a);
}`;

/** The Gaussian's centre weight and its paired taps (offset, weight), for bilinear sampling. */
export function kernel(sigma: number) {
	const r = Math.ceil(sigma * 3);
	const w = Array.from({ length: r + 1 }, (_, i) => Math.exp((-i * i) / (2 * sigma * sigma)));
	const sum = w.reduce((s, x, i) => s + (i ? 2 * x : x), 0);
	const offs: number[] = [];
	const wts: number[] = [];
	for (let i = 1; i <= r; i += 2) {
		const a = w[i] / sum;
		const b = (w[i + 1] ?? 0) / sum;
		offs.push((i * a + (i + 1) * b) / (a + b));
		wts.push(a + b);
	}
	return { w0: w[0] / sum, offs, wts };
}

export type Glow = Exclude<ReturnType<typeof createGlow>, string>;

/** A glow renderer on `canvas`, or why there can't be one. */
export function createGlow(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext('webgl2', {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false
	});
	if (!ctx || ctx.isContextLost()) return 'no WebGL 2';
	const gl = ctx;
	let failed: string | undefined;

	function program(fs: string) {
		const p = gl.createProgram()!;
		for (const [type, src] of [
			[gl.VERTEX_SHADER, VERT],
			[gl.FRAGMENT_SHADER, fs]
		] as const) {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			gl.attachShader(p, s);
		}
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			failed ??= `shader: ${gl.getProgramInfoLog(p)}`;
			return null;
		}
		const locs = new Map<string, WebGLUniformLocation | null>();
		const u = (name: string) => {
			if (!locs.has(name)) locs.set(name, gl.getUniformLocation(p, name));
			return locs.get(name)!;
		};
		return { p, u };
	}
	const project = program(PROJECT);
	const blur = program(BLUR_FS);
	const final = program(FINAL);
	if (!project || !blur || !final) return failed!;
	gl.bindVertexArray(gl.createVertexArray());

	// Half floats where they can be drawn into: the blend's small steps stay exact, and a dark
	// gradient keeps its low bits until the dither. RGBA8 is fine without, just less smooth.
	const half = !!gl.getExtension('EXT_color_buffer_float');
	function texture(w: number, h: number) {
		const t = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
		else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		const fb = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
		return { t, fb };
	}

	// The frame, mipmapped: the projection reads it at about one texel per grid cell.
	const src = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, src);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	let srcW = 0;
	let srcH = 0;

	const k = kernel(CELLS);
	gl.useProgram(blur.p);
	gl.uniform1i(blur.u('img'), 0);
	gl.uniform1i(blur.u('prev'), 1);
	gl.uniform1f(blur.u('w0'), k.w0);
	gl.uniform1fv(blur.u('offs'), k.offs);
	gl.uniform1fv(blur.u('wts'), k.wts);

	type Target = ReturnType<typeof texture>;
	/** The grid: projected, blurred one way, and the blended pair (read one, write the other); then
	 *  the wash's, blurred one way and both. */
	let cells: {
		w: number;
		h: number;
		a: Target;
		b: Target;
		acc: Target[];
		wa: Target;
		wb: Target;
	} | null = null;
	let cur = 0;
	/** The blend has nothing to ease from: the first frame, or a new grid. */
	let snap = true;

	function freeCells() {
		if (!cells) return;
		for (const x of [cells.a, cells.b, ...cells.acc, cells.wa, cells.wb]) {
			gl.deleteTexture(x.t);
			gl.deleteFramebuffer(x.fb);
		}
		cells = null;
	}

	function pass(target: WebGLFramebuffer | null, w: number, h: number) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, target);
		gl.viewport(0, 0, w, h);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	function bind(unit: number, t: WebGLTexture) {
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, t);
	}

	return {
		/** Take a new frame. False when there is none to take: a `<video>` with no picture yet, or
		 *  one loaded without CORS (the setting was turned on mid-video and it hasn't reloaded). */
		frame(f: HTMLVideoElement | Pixels): boolean {
			const [w, h] = f instanceof HTMLVideoElement ? [f.videoWidth, f.videoHeight] : [f.w, f.h];
			if (!w || !h) return false;
			bind(0, src);
			// Both end up bottom row first, the way GL reads a texture.
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, f instanceof HTMLVideoElement);
			const same = w === srcW && h === srcH;
			try {
				if (f instanceof HTMLVideoElement) {
					if (same) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, f);
					else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, f);
				} else if (same) {
					gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, f.rgba);
				} else {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, f.rgba);
				}
			} catch {
				return false; // SecurityError: a cross-origin picture
			}
			srcW = w;
			srcH = h;
			gl.generateMipmap(gl.TEXTURE_2D);
			return true;
		},

		/** Draw the glow around `pic` (corners of `radius`) and the wash across the rest, leaving
		 *  `hole` clear. `dt` is seconds since the last draw, for the blend; 0 snaps to the frame.
		 *  Everything in canvas pixels. */
		draw(at: { pic: Box; hole: Box | null; radius: number }, dt: number) {
			const { pic, hole, radius } = at;
			if (pic.w < 2 || pic.h < 2) {
				// No picture on screen (the column is hidden at this width): no glow around it either.
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				return;
			}
			if (!srcW) return;
			const cw = canvas.width;
			const ch = canvas.height;
			const cell = (pic.h * BLUR) / CELLS;
			const gw = Math.max(2, Math.ceil(cw / cell));
			const gh = Math.max(2, Math.ceil(ch / cell));
			const ww = Math.max(2, Math.ceil(gw / WIDE));
			const wh = Math.max(2, Math.ceil(gh / WIDE));
			if (!cells || cells.w !== gw || cells.h !== gh) {
				freeCells();
				const t = () => texture(gw, gh);
				const [wa, wb] = [texture(ww, gh), texture(ww, wh)];
				cells = { w: gw, h: gh, a: t(), b: t(), acc: [t(), t()], wa, wb };
				snap = true;
			}

			gl.useProgram(project.p);
			bind(0, src);
			gl.uniform1i(project.u('src'), 0);
			gl.uniform2f(project.u('grid'), gw, gh);
			gl.uniform2f(project.u('canvas'), cw, ch);
			gl.uniform4f(project.u('pic'), pic.x, pic.y, pic.w, pic.h);
			// One source texel per cell's worth of picture.
			gl.uniform1f(project.u('lod'), Math.max(0, Math.log2((cell / pic.h) * srcH)));
			pass(cells.a.fb, gw, gh);

			const prev = cells.acc[cur];
			const next = cells.acc[1 - cur];
			gl.useProgram(blur.p);
			bind(1, prev.t);
			bind(0, cells.a.t);
			gl.uniform2f(blur.u('target'), gw, gh);
			gl.uniform2f(blur.u('step_'), 1 / gw, 0);
			gl.uniform1f(blur.u('blend'), 1);
			pass(cells.b.fb, gw, gh);
			bind(0, cells.b.t);
			gl.uniform2f(blur.u('step_'), 0, 1 / gh);
			gl.uniform1f(blur.u('blend'), snap || dt <= 0 ? 1 : 1 - Math.exp(-dt / EASE));
			pass(next.fb, gw, gh);
			cur = 1 - cur;
			snap = false;

			// The wash: the blended grid again, taps WIDE cells apart, into a grid WIDE times coarser.
			bind(0, next.t);
			gl.uniform2f(blur.u('target'), ww, gh);
			gl.uniform2f(blur.u('step_'), WIDE / gw, 0);
			gl.uniform1f(blur.u('blend'), 1);
			pass(cells.wa.fb, ww, gh);
			bind(0, cells.wa.t);
			gl.uniform2f(blur.u('target'), ww, wh);
			gl.uniform2f(blur.u('step_'), 0, WIDE / gh);
			pass(cells.wb.fb, ww, wh);

			gl.useProgram(final.p);
			bind(0, next.t);
			bind(1, cells.wb.t);
			gl.uniform1i(final.u('glow'), 0);
			gl.uniform1i(final.u('wash'), 1);
			gl.uniform2f(final.u('canvas'), cw, ch);
			gl.uniform4f(final.u('pic'), pic.x, pic.y, pic.w, pic.h);
			gl.uniform4f(final.u('hole'), hole?.x ?? 0, hole?.y ?? 0, hole?.w ?? 0, hole?.h ?? 0);
			gl.uniform1f(final.u('radius'), radius);
			gl.uniform1f(final.u('reach'), pic.h * REACH);
			// From the picture to the view's farthest corner, where the wash is at its dimmest.
			const dx = Math.max(pic.x, cw - pic.x - pic.w, 0);
			const dy = Math.max(pic.y, ch - pic.y - pic.h, 0);
			gl.uniform1f(final.u('far'), Math.max(1, Math.hypot(dx, dy)));
			pass(null, cw, ch);
		},

		/** Whether the GPU took the context away (a driver reset); the caller builds a new one. */
		lost: () => gl.isContextLost(),

		/** Give the GPU memory back now rather than whenever the canvas is collected. */
		destroy() {
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		}
	};
}
