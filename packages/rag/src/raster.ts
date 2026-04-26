import './polyfills.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderPageAsImage } from 'unpdf';
import { ensurePdfjs } from './pdf.js';

/**
 * Rasterize a single 1-based PDF page to PNG using unpdf + @napi-rs/canvas.
 * Returns the encoded PNG as a Buffer.
 */
export async function rasterizePage(
  bytes: Uint8Array,
  pageNum: number,
  scale = 2.0,
): Promise<Buffer> {
  await ensurePdfjs();
  // pdfjs detaches the input ArrayBuffer per-call. Hand it a fresh copy
  // each time so concurrent / repeat calls don't blow up with DataCloneError.
  const fresh = new Uint8Array(bytes.byteLength);
  fresh.set(bytes);
  const ab = await renderPageAsImage(fresh, pageNum, {
    scale,
    canvasImport: () => import('@napi-rs/canvas'),
  });
  return Buffer.from(ab as ArrayBuffer);
}

/**
 * Hard upper bound on raster input. Past this, allocating a canvas of the
 * full image risks an OOM on the napi-rs side. D3d.
 */
const MAX_INPUT_EDGE = 8192;

/**
 * Resize the longest edge to `maxEdge` (no-op if already smaller). Preserves
 * aspect ratio. Returns a fresh PNG Buffer.
 *
 * D3d: if the incoming raster has either dim > 8192 we skip the resize
 * (no allocating a same-size canvas) and just re-encode the source. The
 * undersized source can still be passed downstream; we'd rather have a too-
 * big page than crash the worker.
 */
export async function resizeLongestEdge(png: Buffer, maxEdge: number): Promise<Buffer> {
  const img = await loadImage(png);
  const w = img.width;
  const h = img.height;
  const longest = Math.max(w, h);
  if (Math.max(w, h) > MAX_INPUT_EDGE) {
    // Skip large-canvas allocation; return the source as-is to avoid OOM.
    return png;
  }
  if (longest <= maxEdge) {
    // Already small enough — re-encode to ensure a clean PNG.
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return c.toBuffer('image/png');
  }
  const ratio = maxEdge / longest;
  const newW = Math.max(1, Math.round(w * ratio));
  const newH = Math.max(1, Math.round(h * ratio));
  const canvas = createCanvas(newW, newH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, newW, newH);
  return canvas.toBuffer('image/png');
}

/**
 * Crop a PNG by a normalized bbox [x, y, w, h] in 0..1, with optional
 * fractional padding on every side. Pad/clamps and never produces an
 * empty crop.
 */
export async function cropByBbox(
  png: Buffer,
  bbox: [number, number, number, number],
  padPct = 0.03,
): Promise<{ buf: Buffer; width: number; height: number }> {
  // D3d: reject crops that are smaller than 1% on either side. Too small
  // to be a useful figure crop and almost always a model-detection error
  // (e.g. picking up a lone glyph).
  const [, , bw, bh] = bbox;
  if (bw < 0.01 || bh < 0.01) {
    throw new Error(
      `cropByBbox: bbox too small to be useful (w=${bw}, h=${bh}; minimum 0.01)`,
    );
  }
  const img = await loadImage(png);
  const W = img.width;
  const H = img.height;
  let [x, y, w, h] = bbox;
  // Pad each side by padPct of the image (not the bbox), capped within bounds.
  const padX = padPct;
  const padY = padPct;
  let nx = Math.max(0, Math.min(1, x - padX));
  let ny = Math.max(0, Math.min(1, y - padY));
  let nw = Math.max(0, Math.min(1 - nx, w + 2 * padX));
  let nh = Math.max(0, Math.min(1 - ny, h + 2 * padY));
  // Convert to pixel space.
  const pxX = Math.max(0, Math.min(W - 1, Math.round(nx * W)));
  const pxY = Math.max(0, Math.min(H - 1, Math.round(ny * H)));
  const pxW = Math.max(1, Math.min(W - pxX, Math.round(nw * W)));
  const pxH = Math.max(1, Math.min(H - pxY, Math.round(nh * H)));
  const canvas = createCanvas(pxW, pxH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);
  return { buf: canvas.toBuffer('image/png'), width: pxW, height: pxH };
}

/** Read the dimensions of a PNG/JPEG/etc Buffer. */
export async function imageDims(png: Buffer): Promise<{ width: number; height: number }> {
  const img = await loadImage(png);
  return { width: img.width, height: img.height };
}
