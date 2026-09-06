import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyRedactions } from '../src/lib/media/redact';

/** A 200x200 image with a high-contrast checker so blur is detectable. */
async function checker(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="#000"/>
    <rect x="0" y="0" width="20" height="20" fill="#fff"/>
    <rect x="40" y="0" width="20" height="20" fill="#fff"/>
    <rect x="20" y="20" width="20" height="20" fill="#fff"/>
    <rect x="60" y="20" width="20" height="20" fill="#fff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('applyRedactions', () => {
  it('returns the original buffer when there are no regions', async () => {
    const img = await checker();
    expect(await applyRedactions(img, [])).toBe(img);
  });

  it('preserves image dimensions', async () => {
    const img = await checker();
    const out = await applyRedactions(img, [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }]);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it('changes pixels inside the redacted region but not far outside it', async () => {
    const img = await checker();
    const out = await applyRedactions(img, [{ x: 0.0, y: 0.0, w: 0.3, h: 0.3 }]);

    const raw = (b: Buffer) => sharp(b).raw().toBuffer({ resolveWithObject: true });
    const a = await raw(img);
    const c = await raw(out);
    const at = (data: Buffer, x: number, y: number) => {
      const ch = a.info.channels;
      return data[(y * a.info.width + x) * ch];
    };
    // Inside the blurred region: a sharp black/white edge should now differ.
    const insideChanged = at(a.data, 20, 5) !== at(c.data, 20, 5);
    // Far outside (bottom-right corner) should be untouched.
    const outsideSame = at(a.data, 190, 190) === at(c.data, 190, 190);
    expect(insideChanged).toBe(true);
    expect(outsideSame).toBe(true);
  });

  it('clamps regions that exceed the image bounds without throwing', async () => {
    const img = await checker();
    await expect(applyRedactions(img, [{ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }])).resolves.toBeInstanceOf(Buffer);
  });
});
