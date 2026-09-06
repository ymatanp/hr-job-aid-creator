/** Creates a short, non-sensitive synthetic demo video for tests/smoke runs. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import ffmpegPath from 'ffmpeg-static';

const execFileP = promisify(execFile);

async function main() {
  const out = path.join(process.cwd(), 'tmp', 'synthetic.mp4');
  await fs.mkdir(path.dirname(out), { recursive: true });
  // 8s, changing test pattern (creates scene changes) at 1280x720.
  await execFileP(ffmpegPath as unknown as string, [
    '-f', 'lavfi', '-i', 'testsrc=duration=8:size=1280x720:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-pix_fmt', 'yuv420p', '-shortest', '-y', out,
  ]);
  console.log('wrote', out, (await fs.stat(out)).size, 'bytes');
}
main().catch((e) => { console.error(e); process.exit(1); });
