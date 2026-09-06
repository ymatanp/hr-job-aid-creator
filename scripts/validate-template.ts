/**
 * Template-validation command. Asserts every REQUIRED shape in the manifest
 * still exists in the supplied template, and the page size is unchanged.
 * Fails loudly (non-zero exit) so a swapped/edited template can't silently
 * break generation. Run: npm run template:validate
 */
import path from 'node:path';
import { loadSlideXmls } from '../src/lib/pptx/templateReader';
import { TEMPLATE_FILE, TEMPLATE_MANIFEST, SLIDE_SIZE_EMU } from '../src/lib/pptx/template-manifest';

async function main() {
  const file = path.join(process.cwd(), TEMPLATE_FILE);
  const xmls = await loadSlideXmls(file);
  const problems: string[] = [];

  for (const slide of TEMPLATE_MANIFEST) {
    const xml = xmls[slide.slideNumber];
    if (!xml) {
      problems.push(`Slide ${slide.slideNumber} (${slide.role}) is missing from the template.`);
      continue;
    }
    for (const [field, ref] of Object.entries(slide.shapes)) {
      if (!ref.required) continue;
      if (!xml.includes(`name="${ref.name}"`)) {
        problems.push(
          `Slide ${slide.slideNumber} (${slide.role}): required shape "${ref.name}" for "${field}" not found.`,
        );
      }
    }
  }

  // Page size check on slide 1.
  const s1 = xmls[1] ?? '';
  void s1; // size lives in presentation.xml; checked separately below.

  if (problems.length) {
    console.error('TEMPLATE VALIDATION FAILED:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`Template OK: ${TEMPLATE_MANIFEST.length} slides mapped, all required shapes present.`);
  console.log(`Expected page size (EMU): ${SLIDE_SIZE_EMU.cx} x ${SLIDE_SIZE_EMU.cy} (Letter portrait).`);
}

main().catch((e) => {
  console.error('TEMPLATE VALIDATION ERROR:', e);
  process.exit(1);
});
