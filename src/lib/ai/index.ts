import { config } from '../config';
import { jobAidDraftSchema } from '../validation/schemas';
import { Semaphore } from '../util/semaphore';
import type { AiProvider, AnalyzeInput, AnalyzeResult } from './types';
import { MockProvider } from './mock';
import { AnthropicProvider } from './anthropic';

const gate = new Semaphore(config.concurrency.ai);

export function getProvider(): AiProvider {
  switch (config.ai.provider) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'mock':
    default:
      return new MockProvider();
  }
}

/** Strip accidental markdown fences the model may wrap around JSON. */
function extractJson(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/**
 * Run analysis and validate against the strict schema. On invalid output, retry
 * once with the validation errors. If still invalid, return a recoverable error
 * so the caller can retain the uploaded work.
 */
export async function analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
  const provider = getProvider();

  const attempt = async (errors?: string): Promise<AnalyzeResult> => {
    const raw = await gate.run(() => provider.complete(input, errors));
    const parsed = jobAidDraftSchema.safeParse(JSON.parse(safe(extractJson(raw))));
    if (parsed.success) return { draft: parsed.data };
    return { error: formatIssues(parsed.error), raw };
  };

  const first = await attempt();
  if ('draft' in first) return first;

  const second = await attempt(first.error);
  if ('draft' in second) return second;

  return { error: `Model output failed validation twice: ${second.error}`, raw: second.raw };
}

function safe(s: string): string {
  // Guard against a non-JSON response so JSON.parse throws a clean, catchable error upstream.
  return s.trim().startsWith('{') ? s : '{}';
}

function formatIssues(err: import('zod').ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

export type { AnalyzeInput, AnalyzeResult };
