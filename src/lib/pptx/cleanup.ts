/**
 * Removes orphaned slide parts from a generated .pptx. pptx-automizer's
 * removeExistingSlides drops the original template slides from the presentation
 * but leaves their XML parts in the archive. PowerPoint ignores unreferenced
 * parts, but they bloat the file and confuse inspection tools, so we prune any
 * slide XML (+ its rels + Content_Types override) not referenced by the deck.
 *
 * Media is intentionally left untouched: masters/layouts also reference media,
 * so pruning it safely would require full reference tracing. The slide XML is
 * the bulk of the orphaned surface and is safe to remove precisely.
 */
import fs from 'node:fs/promises';
import JSZip from 'jszip';

export async function pruneOrphanSlides(pptxPath: string): Promise<{ removed: string[] }> {
  const zip = await JSZip.loadAsync(await fs.readFile(pptxPath));

  const relsFile = zip.files['ppt/_rels/presentation.xml.rels'];
  if (!relsFile) return { removed: [] };
  const rels = await relsFile.async('string');
  const referenced = new Set(
    [...rels.matchAll(/Target="(slides\/slide\d+\.xml)"/g)].map((m) => `ppt/${m[1]}`),
  );

  const allSlides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  const orphans = allSlides.filter((f) => !referenced.has(f));
  if (!orphans.length) return { removed: [] };

  let contentTypes = await zip.files['[Content_Types].xml'].async('string');

  for (const slidePath of orphans) {
    zip.remove(slidePath);
    const relPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
    if (zip.files[relPath]) zip.remove(relPath);
    // Drop the Content_Types Override so no dangling part reference remains.
    const partName = '/' + slidePath;
    contentTypes = contentTypes.replace(
      new RegExp(`<Override PartName="${partName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`),
      '',
    );
  }

  zip.file('[Content_Types].xml', contentTypes);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(pptxPath, out);
  return { removed: orphans };
}
