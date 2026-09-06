/** Live HTTP smoke test against the running dev server. */
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';

async function waitReady(tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok || r.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('dev server did not become ready');
}

async function main() {
  await waitReady();
  const video = await fs.readFile(path.join(process.cwd(), 'tmp', 'synthetic.mp4'));

  const fd = new FormData();
  fd.set('video', new Blob([video], { type: 'video/mp4' }), 'synthetic.mp4');
  fd.set('transcript', 'Open the HR portal. Then click New Request to begin a leave request.');
  fd.set('title', 'Submit a Leave Request');
  fd.set('audience', 'All employees');
  fd.set('purpose', 'How to submit a leave request in the HR portal.');
  fd.set('owner', 'Human Resources');
  fd.set('disclaimer', '');
  fd.set('screenshotDensity', 'two');

  console.log('POST /api/jobs ...');
  const res = await fetch(`${BASE}/api/jobs`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error('create failed: ' + JSON.stringify(data));
  console.log('job', data.id, 'stage', data.stage, 'steps', data.draft?.sections?.[0]?.steps?.length);

  console.log('POST /api/jobs/:id/generate ...');
  const gen = await fetch(`${BASE}/api/jobs/${data.id}/generate`, { method: 'POST' });
  if (!gen.ok) throw new Error('generate failed: ' + (await gen.text()));
  const buf = Buffer.from(await gen.arrayBuffer());
  const out = path.join(process.cwd(), 'tmp', 'smoke-job-aid.pptx');
  await fs.writeFile(out, buf);
  console.log('downloaded', out, buf.length, 'bytes, content-type', gen.headers.get('content-type'));

  if (buf.length < 500_000) throw new Error('deck suspiciously small');
  console.log('\nHTTP SMOKE PASSED');
}
main().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1); });
