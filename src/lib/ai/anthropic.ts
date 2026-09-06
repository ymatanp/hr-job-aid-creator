import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, AnalyzeInput } from './types';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';
import { config } from '../config';

/** Anthropic (Claude) multimodal implementation. Keys are read server-side only. */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor() {
    if (!config.ai.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.client = new Anthropic({ apiKey: config.ai.anthropicApiKey });
  }

  async complete(input: AnalyzeInput, validationErrors?: string): Promise<string> {
    const imageBlocks = input.frames.map((f) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/png' as const, data: f.base64Png },
    }));

    const text = buildUserMessage(input) +
      (validationErrors
        ? `\n\nYour previous output failed validation with:\n${validationErrors}\nReturn corrected JSON only.`
        : '');

    const msg = await this.client.messages.create({
      model: config.ai.anthropicModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text }, ...imageBlocks] }],
    });

    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}
