import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { getJob } from '../../../../../../lib/storage/jobStore';

export const runtime = 'nodejs';

/** Serve a candidate frame image for the review UI. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; frameId: string } },
) {
  const job = getJob(params.id);
  const frame = job?.frames?.find((f) => f.id === params.frameId);
  if (!frame) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const bytes = await fs.readFile(frame.file);
    return new NextResponse(bytes, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
