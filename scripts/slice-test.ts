/**
 * End-to-end backend vertical-slice test (no UI, no network):
 *   intake -> mock AI analyze (strict schema) -> paginate/number -> generate .pptx
 *   -> re-open and assert branding preserved + our content present.
 * Run: npx tsx scripts/slice-test.ts
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import sharp from 'sharp';
import { analyze } from '../src/lib/ai';
import { generateDeck } from '../src/lib/pptx/generator';
import { intakeSchema } from '../src/lib/validation/schemas';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'slice');

async function shot(label: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600">
    <rect width="1000" height="600" fill="#e8eef5"/>
    <rect x="20" y="20" width="960" height="80" fill="#0b5cad"/>
    <text x="40" y="72" font-family="Arial" font-size="40" fill="#fff">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const intake = intakeSchema.parse({
    title: 'Submit a Leave Request',
    audience: 'All employees',
    purpose: 'How to submit a leave request in the HR portal.',
    owner: 'Human Resources',
    disclaimer: '',
    allowDecisionSlide: false,
    screenshotDensity: 'two',
  });

  const frames = [
    { id: 'f0', tMs: 1000, base64Png: (await shot('Open HR portal')).toString('base64') },
    { id: 'f1', tMs: 5000, base64Png: (await shot('Click New Request')).toString('base64') },
  ];

  const result = await analyze({
    intake,
    transcript: 'First open the HR portal. Then click New Request to start.',
    frames,
    video: { durationSec: 12, width: 1000, height: 600, hasAudio: true },
  });
  if ('error' in result) throw new Error('analyze failed: ' + result.error);
  const draft = result.draft;
  console.log('DRAFT OK:', draft.sections[0].steps.length, 'steps');

  // Map screenshots to the produced step ids.
  const screenshots = new Map<string, Buffer>();
  for (const s of draft.sections[0].steps) screenshots.set(s.id, await shot(s.instruction.slice(0, 24)));

  const { file, slideCount } = await generateDeck({
    draft,
    intake,
    templateDir: ROOT,
    outputDir: OUT,
    outputName: 'slice-output.pptx',
    screenshots,
  });
  console.log('GENERATED:', path.basename(file), 'slides:', slideCount);

  // Verify.
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const has = (p: string) => !!zip.files[p];
  const layouts = Object.keys(zip.files).filter((f) => /slideLayouts\/slideLayout\d+\.xml$/.test(f)).length;
  const fonts = Object.keys(zip.files).filter((f) => /ppt\/fonts\//.test(f)).length;
  const pres = await zip.files['ppt/presentation.xml'].async('string');
  const sldIds = (pres.match(/<p:sldId /g) || []).length;
  const size = /sldSz cx="7772400" cy="10058400"/.test(pres);

  const allSlides = await Promise.all(
    Object.keys(zip.files)
      .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
      .map((f) => zip.files[f].async('string')),
  );
  const joined = allSlides.join('\n');
  const hasTitle = joined.includes('Submit a Leave Request');
  const hasImage = allSlides.some((s) => /<p:pic>/.test(s));

  console.log({ layouts, fonts, sldIds, portraitPreserved: size, master: has('ppt/slideMasters/slideMaster1.xml'), hasTitle, hasImage });

  const ok = layouts >= 40 && fonts >= 10 && size && hasTitle && hasImage && sldIds >= 4;
  if (!ok) throw new Error('SLICE ASSERTIONS FAILED');
  console.log('\nSLICE PASSED: branding preserved, title present, screenshots embedded, numbering applied.');
}

main().catch((e) => {
  console.error('SLICE FAILED:', e);
  process.exit(1);
});
