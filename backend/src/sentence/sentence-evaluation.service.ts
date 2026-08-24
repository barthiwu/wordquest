import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';

export interface SentenceScores {
  grammar: number;
  vocabulary: number;
  context: number;
  naturalness: number;
  clarity: number;
}

export interface SentenceEvaluation {
  scores: SentenceScores;
  /** 0-250 per dimension, summed — max 1,250 (spec §3.4). */
  xpAwarded: number;
  /** 0-1 — the model's own confidence in this evaluation, stored per spec §3.4/§4.5 so a low-confidence result can be flagged for retry rather than silently trusted. */
  confidence: number;
  whatWentWell: string;
  whatNeedsImprovement: string;
  /** A rewritten example, or null when the sentence is already strong enough that a "better version" wouldn't be meaningful. */
  betterVersion: string | null;
  nextAction: string;
}

const MAX_XP_PER_DIMENSION = 250;

/**
 * Sentence stage (V1 Final Systems Spec §3.4): the player writes a
 * natural sentence using the target word; Claude scores 5 independent
 * dimensions. Deliberately does NOT send the word's reference
 * exampleSentence to the model as something to match — spec: "a valid
 * but unusual sentence must not be rejected merely because it differs
 * from the reference example." The sentence is judged on its own
 * merits, not similarity to a specific "right answer."
 */
@Injectable()
export class SentenceEvaluationService {
  private client: Anthropic | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.isAiConfigured;
  }

  async evaluate(
    targetWord: string,
    definition: string,
    partOfSpeech: string,
    sentence: string,
  ): Promise<SentenceEvaluation> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.config.aiModel,
      max_tokens: 700,
      system: this.buildSystemPrompt(),
      messages: [
        { role: 'user', content: this.buildPrompt(targetWord, definition, partOfSpeech, sentence) },
      ],
    });

    return this.parseResponse(response);
  }

  private buildSystemPrompt(): string {
    return `You are WordQuest's Sentence stage evaluator. A learner has written one sentence using a target vocabulary word. Score it on exactly five independent dimensions, each 0-100:

- grammar: is the sentence grammatically correct?
- vocabulary: is the target word used with its correct meaning and in a grammatically valid form (e.g. correct tense/plural where relevant)?
- context: does the sentence give the word a coherent, sensible surrounding context?
- naturalness: does it read like something a fluent speaker would actually write, not an awkward or forced construction?
- clarity: is the sentence easy to understand on a single read?

A valid but unusual or creative sentence must NOT be scored down merely for differing from a typical or expected example — judge it on its own merits. Do not penalize minor stylistic choices that are still correct.

Feedback follows this structure: what went well, what needs improvement, an optional better version (a full rewritten sentence — omit only if the original is already strong), and one concrete next action for the learner.

Also report your own confidence (0-1) in this evaluation — lower it for genuinely ambiguous or borderline cases, not out of general caution.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"scores": {"grammar": 0-100, "vocabulary": 0-100, "context": 0-100, "naturalness": 0-100, "clarity": 0-100}, "confidence": 0-1, "whatWentWell": "...", "whatNeedsImprovement": "...", "betterVersion": "..." or null, "nextAction": "..."}`;
  }

  private buildPrompt(
    targetWord: string,
    definition: string,
    partOfSpeech: string,
    sentence: string,
  ): string {
    return `Target word: "${targetWord}" (${partOfSpeech}) — meaning: ${definition}\n\nLearner's sentence: "${sentence}"\n\nEvaluate this sentence now, following your system instructions exactly.`;
  }

  private parseResponse(response: Anthropic.Messages.Message): SentenceEvaluation {
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      throw new Error('Sentence evaluation returned no text response');
    }

    let parsed: {
      scores?: {
        grammar?: unknown;
        vocabulary?: unknown;
        context?: unknown;
        naturalness?: unknown;
        clarity?: unknown;
      };
      confidence?: unknown;
      whatWentWell?: unknown;
      whatNeedsImprovement?: unknown;
      betterVersion?: unknown;
      nextAction?: unknown;
    };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new Error(
        `Sentence evaluation returned unparseable output: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const dimensions = ['grammar', 'vocabulary', 'context', 'naturalness', 'clarity'] as const;
    const rawScores = parsed.scores;
    if (
      !rawScores ||
      typeof parsed.whatWentWell !== 'string' ||
      typeof parsed.whatNeedsImprovement !== 'string' ||
      typeof parsed.nextAction !== 'string'
    ) {
      throw new Error(
        `Sentence evaluation response missing required fields: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const scores = {} as SentenceScores;
    for (const dim of dimensions) {
      const value = rawScores[dim];
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error(
          `Sentence evaluation returned an invalid ${dim} score: ${textBlock.text.slice(0, 200)}`,
        );
      }
      scores[dim] = value;
    }

    const confidence =
      typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5;

    const xpAwarded = dimensions.reduce(
      (sum, dim) => sum + Math.round((scores[dim] / 100) * MAX_XP_PER_DIMENSION),
      0,
    );

    return {
      scores,
      xpAwarded,
      confidence,
      whatWentWell: parsed.whatWentWell,
      whatNeedsImprovement: parsed.whatNeedsImprovement,
      betterVersion: typeof parsed.betterVersion === 'string' ? parsed.betterVersion : null,
      nextAction: parsed.nextAction,
    };
  }

  private getClient(): Anthropic {
    if (!this.config.isAiConfigured) {
      throw new ServiceUnavailableException(
        'Sentence evaluation is not configured. Set AI_PROVIDER_API_KEY.',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.aiApiKey });
    }
    return this.client;
  }
}
