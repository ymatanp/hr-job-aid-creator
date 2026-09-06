import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getJob, updateJob, jobDir } from '../../../../../lib/storage/jobStore';
import { generateDeck } from '../../../../../lib/pptx/generator';
import { extractFrameAt } from '../../../../../lib/media/ffmpeg';
import { applyRedactions } from '../../../../../lib/media/redact';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Generate the .pptx from the (reviewed) draft. For each step we pair a
 * screenshot extracted at its frameTimestampMs and stream the deck back.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job || !job.draft) {
    return NextResponse.json({ error: 'No reviewed draft to generate.' }, { status: 400 });
  }
  const dir = jobDir(job.id);
  const outDir = path.join(dir, 'out');
  await fs.mkdir(outDir, { recursive: true });

  try {
    updateJob(job.id, { stage: 'building-slides' });

    // Extract one screenshot per step at its chosen timestamp.
    const screenshots = new Map<string, Buffer>();
    const videoFiles = (await fs.readdir(dir)).filter((f) => /^source\./.test(f));
    if (videoFiles.length) {
      const videoPath = path.join(dir, videoFiles[0]);
      for (const section of job.draft.sections) {
        for (const step of section.steps) {
          const out = path.join(outDir, `${step.id}.png`);
          try {
            await extractFrameAt(videoPath, step.frameTimestampMs, out);
            const raw = await fs.readFile(out);
            // Bake in any user-marked blur regions before the image is embedded.
            screenshots.set(step.id, await applyRedactions(raw, step.redactions ?? []));
          } catch {
            /* step remains text-only if the frame cannot be grabbed */
          }
        }
      }
    }

    const { file } = await generateDeck({
      draft: job.draft,
      intake: job.intake!,
      templateDir: process.cwd(),
      outputDir: outDir,
      outputName: 'job-aid.pptx',
      screenshots,
    });

    updateJob(job.id, { stage: 'complete' });
    const bytes = await fs.readFile(file);
    const safeName = job.draft.title.replace(/[^a-z0-9 _-]/gi, '').trim() || 'job-aid';
    return new NextResponse(bytes, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${safeName}.pptx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    updateJob(job.id, { stage: 'error', error: 'generation failed' });
    console.error('generation failed');
    return NextResponse.json({ error: 'Could not generate the deck.' }, { status: 500 });
  }
}
