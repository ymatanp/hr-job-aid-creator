/**
 * Job orchestration. Runs the honest progress stages, with cleanup in finally.
 * Treats uploaded bytes as untrusted: validates signature, caps size/duration.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config';
import { detectFileKind, isAcceptedVideoKind } from '../validation/file-signature';
import { intakeSchema, type Intake } from '../validation/schemas';
import { readMetadata, sampleFrames } from '../media/ffmpeg';
import { analyze } from '../ai';
import { createJob, updateJob, jobDir, getJob, type JobMeta } from '../storage/jobStore';

export interface StartJobInput {
  videoBytes: Buffer;
  videoFilename: string;
  transcript: string;
  intake: Intake;
}

export async function startJob(input: StartJobInput): Promise<JobMeta> {
  // Validate intake first (throws ZodError -> mapped to 400 by the route).
  const intake = intakeSchema.parse(input.intake);

  if (input.videoBytes.length > config.limits.maxUploadBytes) {
    throw new HttpError(413, `Upload exceeds ${config.limits.maxUploadBytes} bytes.`);
  }
  const kind = detectFileKind(input.videoBytes);
  if (!isAcceptedVideoKind(kind)) {
    throw new HttpError(415, 'File signature is not a supported video (mp4/mov/webm).');
  }

  const job = await createJob();
  const dir = jobDir(job.id);
  const videoPath = path.join(dir, `source.${kind}`);
  await fs.writeFile(videoPath, input.videoBytes);
  updateJob(job.id, { stage: 'preparing-video', intake });

  try {
    const meta = await readMetadata(videoPath);
    updateJob(job.id, { video: meta, stage: 'finding-key-screens' });

    const frames = await sampleFrames(videoPath, path.join(dir, 'frames'), meta);
    updateJob(job.id, {
      frames: frames.map((f) => ({ id: f.id, tMs: f.tMs, file: f.file })),
    });

    updateJob(job.id, { stage: 'drafting-steps' });
    const framePayload = await Promise.all(
      frames.slice(0, 30).map(async (f) => ({
        id: f.id,
        tMs: f.tMs,
        base64Png: (await fs.readFile(f.file)).toString('base64'),
      })),
    );

    const result = await analyze({
      intake,
      transcript: input.transcript,
      frames: framePayload,
      video: meta,
    });
    if ('error' in result) throw new HttpError(422, `Analysis failed: ${result.error}`);

    return updateJob(job.id, { draft: result.draft, stage: 'building-slides' });
  } catch (err) {
    updateJob(job.id, { stage: 'error', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export { getJob };
