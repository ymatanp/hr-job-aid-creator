import type { JobAidDraft, Intake } from '../validation/schemas';
import type { Frame } from '../media/ffmpeg';

export interface AnalyzeInput {
  intake: Intake;
  transcript: string;
  frames: Array<Pick<Frame, 'id' | 'tMs'> & { base64Png: string }>;
  video: { durationSec: number; width: number; height: number; hasAudio: boolean };
}

/** Provider-neutral analysis interface. Implementations must return raw JSON text. */
export interface AiProvider {
  readonly name: string;
  /** Return the model's raw JSON string. `validationErrors` is set on the retry. */
  complete(input: AnalyzeInput, validationErrors?: string): Promise<string>;
}

export type AnalyzeResult = { draft: JobAidDraft } | { error: string; raw?: string };
