/**
 * Media extraction service. Reads video metadata and samples candidate frames
 * using ffmpeg-static via child_process. No shell is used (execFile with an
 * argument array) so filenames cannot inject commands.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import ffmpegPath from 'ffmpeg-static';
import { Semaphore } from '../util/semaphore';
import { config } from '../config';

const execFileP = promisify(execFile);
const ffmpeg = (ffmpegPath as unknown as string) || 'ffmpeg';
const gate = new Semaphore(config.concurrency.ffmpeg);
const FFMPEG_TIMEOUT_MS = 120_000;

export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** ffmpeg writes metadata to stderr; we parse it rather than requiring ffprobe. */
export async function readMetadata(videoPath: string): Promise<VideoMetadata> {
  const { stderr } = await gate.run(() =>
    execFileP(ffmpeg, ['-hide_banner', '-i', videoPath], {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    }).catch((e) => e as { stderr: string }),
  );
  const text = String(stderr ?? '');

  const dur = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(text);
  const durationSec = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;

  const res = /,\s*(\d{2,5})x(\d{2,5})/.exec(text);
  const width = res ? +res[1] : 0;
  const height = res ? +res[2] : 0;

  const fpsM = /(\d+(?:\.\d+)?)\s*fps/.exec(text);
  const fps = fpsM ? +fpsM[1] : 0;

  const hasAudio = /Stream #\d+:\d+.*Audio:/.test(text);

  if (durationSec <= 0) throw new Error('Could not read video duration; file may be corrupt.');
  if (durationSec > config.limits.maxVideoDurationSeconds) {
    throw new Error(`Video exceeds the ${config.limits.maxVideoDurationSeconds}s limit.`);
  }
  return { durationSec, width, height, fps, hasAudio };
}

export interface Frame {
  id: string;
  tMs: number;
  file: string;
}

/**
 * Sample candidate frames: scene-change detections plus a modest interval grid.
 * We do NOT extract every frame. Returns deduplicated, time-sorted frames.
 */
export async function sampleFrames(
  videoPath: string,
  outDir: string,
  meta: VideoMetadata,
  opts: { maxFrames?: number; intervalSec?: number; sceneThreshold?: number } = {},
): Promise<Frame[]> {
  const maxFrames = opts.maxFrames ?? 40;
  const intervalSec = opts.intervalSec ?? Math.max(3, Math.round(meta.durationSec / 25));
  const sceneThreshold = opts.sceneThreshold ?? 0.4;

  await fs.mkdir(outDir, { recursive: true });

  // One pass: keep frames on scene change OR at the interval grid; scale down.
  // showinfo prints each output frame's pts_time to stderr so we can label them.
  const select = `gt(scene\\,${sceneThreshold})+not(mod(t\\,${intervalSec}))`;
  const pattern = path.join(outDir, 'cand-%04d.png');

  const { stderr } = await gate.run(() =>
    execFileP(
      ffmpeg,
      [
        '-hide_banner',
        '-i', videoPath,
        '-vf', `select='${select}',showinfo,scale=1280:-1:flags=lanczos`,
        '-vsync', 'vfr',
        '-frames:v', String(maxFrames),
        '-y', pattern,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
    ),
  );

  // Map each emitted frame index to its pts_time from showinfo lines.
  const times = [...String(stderr ?? '').matchAll(/pts_time:([0-9.]+)/g)].map((m) => +m[1]);
  const files = (await fs.readdir(outDir))
    .filter((f) => /^cand-\d+\.png$/.test(f))
    .sort();

  const frames: Frame[] = files.map((f, i) => ({
    id: `f${String(i).padStart(4, '0')}`,
    tMs: Math.round((times[i] ?? i * intervalSec) * 1000),
    file: path.join(outDir, f),
  }));

  return frames.sort((a, b) => a.tMs - b.tMs);
}

/** Extract a single frame at an exact timestamp (used by "Capture this frame"). */
export async function extractFrameAt(videoPath: string, tMs: number, outFile: string): Promise<void> {
  await gate.run(() =>
    execFileP(
      ffmpeg,
      [
        '-hide_banner',
        '-ss', (tMs / 1000).toFixed(3),
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', 'scale=1280:-1:flags=lanczos',
        '-y', outFile,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    ),
  );
}
