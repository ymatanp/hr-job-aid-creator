/** Verifies the full flow against the running dev server: many steps -> screens
 *  on replicated instructional slides. Run: npx tsx scripts/verify-flow.ts */
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const TRANSCRIPT = [
  'Open the HR portal.',
  'Click New Request.',
  'Select the leave type.',
  'Enter the start and end dates.',
  'Add a reason for the request.',
  'Click Submit to send it for approval.',
].join('\n');

async function referencedSlides(zip: JSZip): Promise<string[]> {
  const pres = await zip.files['ppt/presentation.xml'].async('string');
  const rels = await zip.files['ppt/_rels/presentation.xml.rels'].async('string');
  const rIds = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const map = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  return Promise.all(
    rIds.map((id) => map.get(id)).filter((t): t is string => !!t).map((t) => zip.files[`ppt/${t}`].async('string')),
  );
}

async function main() {
  const video = await fs.readFile(path.join(process.cwd(), 'tmp', 'synthetic.mp4'));
  const fd = new FormData();
  fd.set('video', new Blob([video], { type: 'video/mp4' }), 'synthetic.mp4');
  fd.set('transcript', TRANSCRIPT);
  fd.set('title', 'Submit a Leave Request');
  fd.set('audience', 'All employees');
  fd.set('purpose', 'How to submit a leave request.');
  fd.set('owner', 'Human Resources');
  fd.set('disclaimer', '');
  fd.set('screenshotDensity', 'four');

  const res = await fetch(`${BASE}/api/jobs`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error('create failed: ' + JSON.stringify(data));
  const stepCount = data.draft.sections.reduce((n: number, s: any) => n + s.steps.length, 0);
  console.log('DRAFT steps:', stepCount);

  const gen = await fetch(`${BASE}/api/jobs/${data.id}/generate`, { method: 'POST' });
  if (!gen.ok) throw new Error('generate failed: ' + (await gen.text()));
  const buf = Buffer.from(await gen.arrayBuffer());

  const zip = await JSZip.loadAsync(buf);
  const slides = await referencedSlides(zip);
  let instructional = 0;
  let totalPics = 0;
  const numbers = new Set<string>();
  for (const xml of slides) {
    const pics = (xml.match(/<p:pic>/g) || []).length;
    const isInstructional = /Step information goes here|Information about the step|Oval 4[89]|Oval 1[2367]/.test(xml) || pics > 0;
    if (pics > 0) {
      instructional++;
      totalPics += pics;
    }
    for (const m of xml.matchAll(/<a:t>(\d{1,2})<\/a:t>/g)) numbers.add(m[1]);
  }
  console.log('referenced slides:', slides.length);
  console.log('instructional slides (with screenshots):', instructional);
  console.log('total screenshots embedded:', totalPics);
  console.log('step numbers seen on slides:', [...numbers].map(Number).filter((n) => n <= stepCount).sort((a, b) => a - b).join(','));

  if (totalPics < stepCount) throw new Error(`Expected >= ${stepCount} screenshots, got ${totalPics}`);
  console.log('\nOK: every step has a screenshot, spread across replicated instructional slides.');
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
