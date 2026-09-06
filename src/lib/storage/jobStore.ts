/**
 * Local temporary storage for the MVP, behind a small interface so an approved
 * object store can replace it later. Each job gets an isolated directory keyed
 * by an unpredictable id. Temp data is deleted on demand or after retention.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config';
import type { JobAidDraft, Intake } from '../validation/schemas';

export type JobStage =
  | 'created'
  | 'uploading'
  | 'preparing-video'
  | 'finding-key-screens'
  | 'drafting-steps'
  | 'building-slides'
  | 'complete'
  | 'error';

export interface JobMeta {
  id: string;
  stage: JobStage;
  createdAt: number;
  expiresAt: number;
  error?: string;
  intake?: Intake;
  draft?: JobAidDraft;
  video?: { durationSec: number; width: number; height: number; fps: number; hasAudio: boolean };
  frames?: Array<{ id: string; tMs: number; file: string }>;
}

const ROOT = path.join(process.cwd(), 'tmp', 'jobs');

// Survive Next.js dev hot-reload by pinning the registry to globalThis.
const g = globalThis as unknown as { __jobRegistry?: Map<string, JobMeta> };
const registry: Map<string, JobMeta> = (g.__jobRegistry ??= new Map());

export function newJobId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function jobDir(id: string): string {
  // id is hex-only; still guard against traversal.
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('invalid job id');
  return path.join(ROOT, id);
}

export async function createJob(): Promise<JobMeta> {
  const id = newJobId();
  const now = Date.now();
  const meta: JobMeta = {
    id,
    stage: 'created',
    createdAt: now,
    expiresAt: now + config.limits.retentionMinutes * 60_000,
  };
  await fs.mkdir(path.join(jobDir(id), 'frames'), { recursive: true });
  registry.set(id, meta);
  return meta;
}

export function getJob(id: string): JobMeta | undefined {
  return registry.get(id);
}

export function updateJob(id: string, patch: Partial<JobMeta>): JobMeta {
  const cur = registry.get(id);
  if (!cur) throw new Error('job not found');
  const next = { ...cur, ...patch };
  registry.set(id, next);
  return next;
}

export async function deleteJob(id: string): Promise<void> {
  registry.delete(id);
  await fs.rm(jobDir(id), { recursive: true, force: true });
}

/** Sweep expired jobs. Call periodically and best-effort; never throws. */
export async function sweepExpired(): Promise<void> {
  const now = Date.now();
  for (const [id, meta] of registry) {
    if (meta.expiresAt <= now) {
      try {
        await deleteJob(id);
      } catch {
        /* best effort */
      }
    }
  }
}
