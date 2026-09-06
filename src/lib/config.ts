/** Central runtime configuration, read from env with safe defaults. Server-only. */

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'mock').toLowerCase() as 'mock' | 'anthropic',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
  },
  limits: {
    maxUploadBytes: num('MAX_UPLOAD_BYTES', 524_288_000),
    maxVideoDurationSeconds: num('MAX_VIDEO_DURATION_SECONDS', 1800),
    retentionMinutes: num('JOB_RETENTION_MINUTES', 60),
  },
  concurrency: {
    ffmpeg: num('MAX_CONCURRENT_FFMPEG', 2),
    ai: num('MAX_CONCURRENT_AI', 2),
  },
} as const;

export const ACCEPTED_VIDEO = {
  'video/mp4': ['mp4'],
  'video/quicktime': ['mov'],
  'video/webm': ['webm'],
} as const;

export const ACCEPTED_TEXT = {
  'text/plain': ['txt'],
  'text/markdown': ['md'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
} as const;
