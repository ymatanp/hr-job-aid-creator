import type { AiProvider, AnalyzeInput } from './types';
import { DEFAULT_DISCLAIMER } from '../validation/schemas';

/**
 * Deterministic OFFLINE provider (no LLM). It does not truly "understand" the
 * demo — instead it derives one candidate step per instruction sentence in the
 * supplied transcript, pairing each with a representative frame spread across
 * the recording. Everything it emits is grounded in the operator's own inputs
 * (transcript + frames + intake); it never fabricates UI labels. Every step is
 * flagged low-confidence so the reviewer knows to verify wording.
 *
 * With a real multimodal provider these steps would instead be extracted by
 * watching the frames and reading the transcript together, with exact UI labels.
 */
export class MockProvider implements AiProvider {
  readonly name = 'mock';

  async complete(input: AnalyzeInput): Promise<string> {
    const { intake, transcript, frames, video } = input;

    const sentences = splitIntoSteps(transcript);
    const durationMs = Math.max(1, Math.round((video?.durationSec ?? 0) * 1000));

    const source = sentences.length
      ? sentences.map((text, i) => ({
          text,
          tMs: frameFor(i, sentences.length, frames, durationMs),
        }))
      : // No transcript: fall back to one step per extracted frame.
        (frames.length ? frames : [{ id: 'f0', tMs: 0 }]).map((f) => ({
          text: `Review the screen shown at ${(f.tMs / 1000).toFixed(1)}s and perform the demonstrated action.`,
          tMs: f.tMs,
        }));

    const steps = source.map((s, i) => ({
      id: `s${i + 1}`,
      instruction: capitalize(s.text).slice(0, 480),
      expectedResult: undefined,
      frameTimestampMs: s.tMs,
      evidenceTimestampMs: s.tMs,
      transcriptEvidence: sentences.length ? s.text.slice(0, 480) : undefined,
      confidence: 0.5,
      reviewFlags: ['low-confidence'] as const,
    }));

    const draft = {
      title: intake.title,
      subtitle: 'Step-by-Step Job Aid',
      audience: intake.audience,
      purpose: intake.purpose,
      disclaimer: intake.disclaimer || DEFAULT_DISCLAIMER,
      owner: intake.owner,
      lastUpdated: new Date().toISOString().slice(0, 10),
      resources:
        intake.resourceLabel && intake.resourceUrl
          ? [{ label: intake.resourceLabel, url: intake.resourceUrl }]
          : undefined,
      sections: [{ id: 'sec1', title: intake.title, kind: 'steps' as const, steps }],
    };
    return JSON.stringify(draft);
  }
}

/** Split a transcript into candidate step sentences, dropping obvious filler. */
function splitIntoSteps(transcript: string): string[] {
  if (!transcript?.trim()) return [];
  const FILLER = /^(hi|hello|hey|thanks|thank you|ok|okay|so|um|uh|welcome|great|alright|right)\b/i;
  return transcript
    // Break on sentence terminators and line breaks.
    .split(/(?:[.!?]+\s+)|[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && /[a-z]/i.test(s))
    .filter((s) => !FILLER.test(s) || s.split(/\s+/).length > 4)
    .slice(0, 24); // sane cap for a single demo
}

/** Assign step i (of total) a frame timestamp spread across the recording. */
function frameFor(
  i: number,
  total: number,
  frames: AnalyzeInput['frames'],
  durationMs: number,
): number {
  if (frames.length) {
    const idx = total <= 1 ? 0 : Math.round((i / (total - 1)) * (frames.length - 1));
    return frames[Math.min(idx, frames.length - 1)].tMs;
  }
  return total <= 1 ? 0 : Math.round((i / (total - 1)) * durationMs);
}

function capitalize(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
