import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';
import { stripJsonCodeFence } from '../common/ai-json';

export interface AssessmentInput {
  targetWord: string;
  definition: string;
  /** Exactly one of textEvidence or (photoBytes + photoContentType) must be given. */
  textEvidence?: string;
  photoBytes?: Buffer;
  photoContentType?: 'image/jpeg' | 'image/png';
}

export interface AssessmentResult {
  approved: boolean;
  /** One or two sentences, written for the learner to read directly. */
  reasoning: string;
  /** The relevant text Claude read from the evidence, when there was any to extract. */
  extractedText?: string;
}

/**
 * Word in the Wild's evidence judge (spec v2 WL-09). Claude vision reads
 * whatever text is in a photo AND judges whether the word is genuinely,
 * sensibly used — one model call does both steps, rather than a separate
 * OCR pass feeding a second judgment call.
 *
 * This has never been run against a live API key — there's no way to do
 * that from this sandbox. The prompt, request shape, and response
 * parsing are correct as written, but the first real submission on a
 * configured server is this code's first real-world test.
 */
@Injectable()
export class EvidenceAssessmentService {
  private client: Anthropic | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.isAiConfigured;
  }

  async assess(input: AssessmentInput): Promise<AssessmentResult> {
    if (!input.textEvidence && !input.photoBytes) {
      throw new Error('assess() requires either textEvidence or photoBytes');
    }

    const client = this.getClient();

    const content: Anthropic.Messages.ContentBlockParam[] = [];
    if (input.photoBytes && input.photoContentType) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.photoContentType,
          data: input.photoBytes.toString('base64'),
        },
      });
    }
    content.push({ type: 'text', text: this.buildPrompt(input) });

    const response = await client.messages.create({
      model: this.config.aiModel,
      max_tokens: 512,
      messages: [{ role: 'user', content }],
    });

    return this.parseResponse(response);
  }

  private buildPrompt(input: AssessmentInput): string {
    const evidenceDescription = input.photoBytes
      ? 'The attached photo is evidence a language learner submitted, claiming it shows the target word used in a real-world context (a sign, a book, packaging, a screen, etc.).'
      : `The learner submitted this text as evidence they encountered the word being used: "${input.textEvidence}"`;

    return `You are assessing evidence for a vocabulary-learning app called WordQuest ("Word in the Wild"). A learner claims to have encountered the word "${input.targetWord}" (meaning: ${input.definition}) used naturally in the real world, and submitted evidence.

${evidenceDescription}

Judge whether this is genuine, sensible evidence that "${input.targetWord}" (or a natural inflection of it, e.g. plural or past tense) is used in a real, coherent context — not just present as an isolated word, and not evidence that looks fabricated, copy-pasted from a dictionary, or nonsensical.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"approved": true or false, "reasoning": "one or two sentences explaining your judgment, written for the learner to read", "extractedText": "the relevant text you read from the evidence, or null if there is none to extract"}`;
  }

  private parseResponse(response: Anthropic.Messages.Message): AssessmentResult {
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      throw new Error('Evidence assessment returned no text response');
    }

    let parsed: { approved?: unknown; reasoning?: unknown; extractedText?: unknown };
    try {
      parsed = JSON.parse(stripJsonCodeFence(textBlock.text));
    } catch {
      throw new Error(
        `Evidence assessment returned unparseable output: ${textBlock.text.slice(0, 200)}`,
      );
    }

    if (typeof parsed.approved !== 'boolean' || typeof parsed.reasoning !== 'string') {
      throw new Error(
        `Evidence assessment response missing required fields: ${textBlock.text.slice(0, 200)}`,
      );
    }

    return {
      approved: parsed.approved,
      reasoning: parsed.reasoning,
      extractedText: typeof parsed.extractedText === 'string' ? parsed.extractedText : undefined,
    };
  }

  private getClient(): Anthropic {
    if (!this.config.isAiConfigured) {
      throw new ServiceUnavailableException(
        'Evidence assessment is not configured. Set AI_PROVIDER_API_KEY.',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.aiApiKey });
    }
    return this.client;
  }
}
