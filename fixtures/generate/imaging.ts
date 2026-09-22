import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

/**
 * Shared imaging helpers for the two documents that did not arrive as files.
 *
 * Vendor D scanned a printed quotation; Vendor E photographed a rate card on a
 * desk. Both are generated as clean pages first, then degraded — because the
 * degradation has to sit on top of real typeset text, the way it does on a real
 * scan. Faking the artefacts without the underlying document would produce
 * something that looks damaged rather than something that is hard to read.
 *
 * Every random value is drawn from a seeded PRNG so the output is byte-stable.
 */

/** mulberry32 — small, fast, and deterministic from a fixed seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A4 at 200 dpi — the resolution an office scanner actually produces. */
export const PAGE = { width: 1654, height: 2339 };

export function newPage(background = "#ffffff"): { canvas: Canvas; ctx: SKRSContext2D } {
  // Explicitly the raster Canvas, not the SVG variant the overload can return.
  const canvas: Canvas = createCanvas(PAGE.width, PAGE.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);
  return { canvas, ctx };
}

/** Monochrome noise tile, composited to give paper and sensor grain. */
async function noiseLayer(
  width: number,
  height: number,
  seed: number,
  strength: number,
): Promise<Buffer> {
  const rand = seededRandom(seed);
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = 128 + (rand() - 0.5) * 255 * strength;
    const clamped = Math.max(0, Math.min(255, v));
    pixels[i * 4] = clamped;
    pixels[i * 4 + 1] = clamped;
    pixels[i * 4 + 2] = clamped;
    pixels[i * 4 + 3] = 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** A soft directional light gradient, for photographs taken under one lamp. */
async function lightingLayer(
  width: number,
  height: number,
  opts: { cx: number; cy: number; innerAlpha: number; outerAlpha: number },
): Promise<Buffer> {
  const canvas: Canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    width * opts.cx,
    height * opts.cy,
    Math.min(width, height) * 0.12,
    width * opts.cx,
    height * opts.cy,
    Math.max(width, height) * 0.95,
  );
  gradient.addColorStop(0, `rgba(255,255,255,${opts.innerAlpha})`);
  gradient.addColorStop(0.55, "rgba(255,255,255,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${opts.outerAlpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

/**
 * Office-scanner degradation: greyscale, a degree or so of skew from a sheet
 * fed slightly crooked, reduced contrast from a tired drum, and the JPEG
 * artefacts every scan-to-PDF pipeline leaves behind.
 */
export async function degradeAsScan(pageBuffer: Buffer, seed: number): Promise<Buffer> {
  const rotated = await sharp(pageBuffer)
    // 0.55 degrees drifts the right-hand columns by ~14px across the page —
    // visibly crooked, but under one row pitch, so a rate still belongs to an
    // unambiguous row. More skew than this makes wrong-row extraction likely,
    // which produces confident bad data rather than honest difficulty.
    .rotate(0.55, { background: "#ffffff" })
    .greyscale()
    // Flatten the tonal range: black is no longer black, white is no longer white.
    .linear(0.88, 18)
    .blur(0.7)
    .toBuffer();

  const meta = await sharp(rotated).metadata();
  const width = meta.width!;
  const height = meta.height!;

  const noise = await noiseLayer(width, height, seed, 0.42);

  return sharp(rotated)
    .composite([{ input: noise, blend: "overlay" }])
    .jpeg({ quality: 52, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

/**
 * Phone-photograph degradation: the sheet is not square to the lens, one lamp
 * is off to the left, the paper is warm rather than white, and the whole thing
 * went through a messaging app's JPEG encoder on the way.
 */
export async function degradeAsPhotograph(pageBuffer: Buffer, seed: number): Promise<Buffer> {
  // A mild shear plus rotation stands in for perspective — enough to defeat a
  // naive row-alignment assumption without making the page unreadable.
  const warped = await sharp(pageBuffer)
    .affine([
      [1, 0.021],
      [0.013, 1],
    ], { background: "#e8e4dc" })
    .rotate(-1.7, { background: "#e8e4dc" })
    .toBuffer();

  const meta = await sharp(warped).metadata();
  const width = meta.width!;
  const height = meta.height!;

  const lighting = await lightingLayer(width, height, {
    cx: 0.32,
    cy: 0.18,
    innerAlpha: 0.3,
    outerAlpha: 0.34,
  });
  const noise = await noiseLayer(width, height, seed, 0.2);

  return sharp(warped)
    // Warm the paper and pull the contrast down the way indoor light does.
    .modulate({ brightness: 1.03, saturation: 0.86 })
    .tint({ r: 255, g: 250, b: 238 })
    .linear(0.94, 6)
    .blur(0.5)
    .composite([
      { input: lighting, blend: "over" },
      { input: noise, blend: "overlay" },
    ])
    .jpeg({ quality: 74, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

/** Draws text and returns the y baseline it finished on. */
export function line(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number },
): number {
  ctx.font = opts?.font ?? "24px Helvetica";
  ctx.fillStyle = opts?.color ?? "#141414";
  ctx.textAlign = opts?.align ?? "left";
  ctx.fillText(text, x, y, opts?.maxWidth);
  return y;
}
