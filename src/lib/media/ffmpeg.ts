/**
 * Media extraction service. Reads video metadata and samples candidate frames
 * using ffmpeg-static via child_process. No shell is used (execFile with an
 * argument array) so filenames cannot inject commands.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import { Semaphore } from '../util/semaphore';
import { config } from '../config';

const execFileP = promisify(execFile);

/**
 * Resolve the ffmpeg binary robustly. In a Next.js PRODUCTION build the path
 * exported by ffmpeg-static can be rewritten/incorrect, so we fall back to the
 * real binary under node_modules (which is what actually ships), and finally to
 * a PATH lookup. Whichever exists first wins.
 */
function resolveFfmpeg(): string {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    ffmpegStatic as unknown as string,
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exe),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore and try next */
    }
  }
  return 'ffmpeg'; // last resort: rely on system PATH
}

const ffmpeg = resolveFfmpeg();
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
  const result = await gate.run(() =>
    execFileP(ffmpeg, ['-hide_banner', '-i', videoPath], {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    }).catch((e) => e as { stderr?: string; code?: string; message?: string }),
  );
  // A spawn failure (e.g. binary not found/executable) has no stderr — surface it
  // clearly rather than masquerading as a corrupt file.
  if (!('stderr' in result) || result.stderr === undefined) {
    const code = (result as { code?: string }).code;
    if (code === 'ENOENT') {
      throw new Error(`ffmpeg binary could not be launched (resolved: ${ffmpeg}).`);
    }
  }
  const text = String((result as { stderr?: string }).stderr ?? '');

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
