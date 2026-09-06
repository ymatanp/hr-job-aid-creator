import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { startJob, HttpError } from '../../../lib/jobs/pipeline';
import { intakeSchema } from '../../../lib/validation/schemas';
import { sweepExpired } from '../../../lib/storage/jobStore';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Create a job: upload video (+ optional transcript) and run analysis. */
export async function POST(req: NextRequest) {
  await sweepExpired();
  try {
    const form = await req.formData();
    const video = form.get('video');
    if (!(video instanceof File)) {
      return NextResponse.json({ error: 'A video file is required.' }, { status: 400 });
    }

    const intake = intakeSchema.parse({
      title: form.get('title'),
      audience: form.get('audience'),
      purpose: form.get('purpose'),
      owner: form.get('owner'),
      disclaimer: form.get('disclaimer') ?? '',
      resourceLabel: form.get('resourceLabel') || undefined,
      resourceUrl: form.get('resourceUrl') || undefined,
      allowDecisionSlide: form.get('allowDecisionSlide') === 'true',
      screenshotDensity: (form.get('screenshotDensity') as string) || 'auto',
    });

    const transcript = String(form.get('transcript') ?? '').slice(0, 500_000);
    const videoBytes = Buffer.from(await video.arrayBuffer());

    const job = await startJob({
      videoBytes,
      videoFilename: video.name,
      transcript,
      intake,
    });

    return NextResponse.json({ id: job.id, stage: job.stage, draft: job.draft, video: job.video });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid form input', issues: err.issues }, { status: 400 });
    }
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Never leak internals to the client; log the message (not content) server-side.
    console.error('job creation failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Processing error. Your upload was not retained.' }, { status: 500 });
  }
}
