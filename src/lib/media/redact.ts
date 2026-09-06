/**
 * Applies rectangular blur redactions to a PNG screenshot. Regions are given in
 * normalized (0..1) coordinates so they survive any display scaling in the UI.
 * The blur is baked into the image before it is embedded in the deck, so
 * redacted content never leaves the server inside the generated file.
 */
import sharp from 'sharp';
import type { RedactionRect } from '../validation/schemas';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export async function applyRedactions(png: Buffer, rects: RedactionRect[]): Promise<Buffer> {
  if (!rects.length) return png;

  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return png;

  const composites: sharp.OverlayOptions[] = [];
  for (const r of rects) {
    const left = clamp(Math.round(r.x * W), 0, W - 1);
    const top = clamp(Math.round(r.y * H), 0, H - 1);
    const width = clamp(Math.round(r.w * W), 1, W - left);
    const height = clamp(Math.round(r.h * H), 1, H - top);
    if (width < 1 || height < 1) continue;

    // Blur strength scales with region size so small labels stay unreadable.
    const sigma = clamp(Math.round(Math.min(width, height) / 6), 8, 60);
    const region = await sharp(png)
      .extract({ left, top, width, height })
      .blur(sigma)
      .toBuffer();
    composites.push({ input: region, left, top });
  }

  return composites.length ? sharp(png).composite(composites).png().toBuffer() : png;
}
