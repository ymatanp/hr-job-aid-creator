/** Reads raw slide XML from a .pptx via JSZip (used for geometry + validation). */
import fs from 'node:fs/promises';
import JSZip from 'jszip';

export async function loadSlideXmls(pptxPath: string): Promise<Record<number, string>> {
  const buf = await fs.readFile(pptxPath);
  const zip = await JSZip.loadAsync(buf);
  const out: Record<number, string> = {};
  for (const name of Object.keys(zip.files)) {
    const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
    if (m) out[+m[1]] = await zip.files[name].async('string');
  }
  return out;
}
