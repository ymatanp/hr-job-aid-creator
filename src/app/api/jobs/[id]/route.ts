import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getJob, deleteJob, updateJob } from '../../../../lib/storage/jobStore';
import { jobAidDraftSchema } from '../../../../lib/validation/schemas';

export const runtime = 'nodejs';

/** Job status + current draft (for the review page). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: 'Not found or expired.' }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    stage: job.stage,
    error: job.error,
    draft: job.draft,
    video: job.video,
    frames: job.frames?.map((f) => ({ id: f.id, tMs: f.tMs })),
    // Only the fields the preview/pagination need (no PII-heavy intake fields).
    intake: job.intake
      ? { screenshotDensity: job.intake.screenshotDensity, allowDecisionSlide: job.intake.allowDecisionSlide }
      : undefined,
  });
}

/** Save reviewed/edited draft. Validated against the strict schema. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: 'Not found or expired.' }, { status: 404 });
  try {
    const body = await req.json();
    const draft = jobAidDraftSchema.parse(body.draft);
    updateJob(params.id, { draft });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid draft', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not save draft.' }, { status: 400 });
  }
}

/** "Delete my files now" — remove temp data immediately. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteJob(params.id);
  return NextResponse.json({ ok: true });
}
