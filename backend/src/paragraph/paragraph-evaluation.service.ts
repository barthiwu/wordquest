import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';
import { stripJsonCodeFence } from '../common/ai-json';
import { nativeLanguageInstruction } from '../common/language-names';

export interface ParagraphScores {
  grammar: number;
  vocabulary: number;
  structure: number;
  flow: number;
  context: number;
}

export interface ParagraphEvaluation {
  scores: ParagraphScores;
  /** 0-350 per dimension, summed — max 1,750 (spec §3.5). */
  xpAwarded: number;
  /** 0-1 — the model's own confidence in this evaluation. */
  confidence: number;
  /**
   * A rough CEFR-style label (e.g. "B1"), NOT an official assessment —
   * spec §3.5: "Estimated proficiency is not official CEFR until CEFR
   * is unlocked." This feeds the broader CEFR evidence model
   * eventually; nothing in this service or QuestsService currently
   * aggregates it into an actual CEFR calculation.
   */
  estimatedProficiency: string;
  whatWentWell: string;
  whatNeedsImprovement: string;
  /** A revised paragraph, or null when no meaningful revision is warranted. */
  suggestedRevision: string | null;
  nextAction: string;
}

const MAX_XP_PER_DIMENSION = 350;

/**
 * Paragraph stage (V1 Final Systems Spec §3.5): 30-100 words using the
 * target word, scored on 5 dimensions. "Target-word misuse must reduce
 * the contextual usage component without destroying unrelated skill
 * scores" (spec) — the prompt makes this explicit so a single misused
 * word doesn't tank grammar/structure/flow scores that were otherwise
 * fine.
 */
@Injectable()
export class ParagraphEvaluationService {
  private client: Anthropic | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.isAiConfigured;
  }

  async evaluate(
    targetWord: string,
    definition: string,
    partOfSpeech: string,
    paragraph: string,
    /** The player's native/comprehension language (User.nativeLanguage) -- see nativeLanguageInstruction. Null/undefined/'en' all mean "write feedback in English, nothing to bridge." */
    nativeLanguage?: string | null,
  ): Promise<ParagraphEvaluation> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.config.aiModel,
      // Paragraph is the only evaluated stage whose JSON schema includes a
      // full suggestedRevision (a rewritten 30-100 word paragraph) on top
      // of two feedback fields -- meaningfully heavier output than
      // sentence/master-challenge's schemas. 800, then 1300, both still
      // truncated mid-JSON in real use (see the stop_reason check below,
      // which makes that failure mode diagnosable instead of looking like
      // generic malformed output) -- and Sentence's own lighter schema
      // already needed 1500 to stop truncating, so 1300 here was never
      // going to hold. 2000 leaves real headroom above a heavier schema
      // than either of those, rather than inching up by another few
      // hundred and risking a third repeat.
      max_tokens: 2000,
      system: this.buildSystemPrompt(nativeLanguage),
      messages: [
        {
          role: 'user',
          content: this.buildPrompt(targetWord, definition, partOfSpeech, paragraph),
        },
      ],
    });

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        'Paragraph evaluation response was truncated by max_tokens before completing its JSON -- ' +
          'raise max_tokens further if this recurs.',
      );
    }

    return this.parseResponse(response);
  }

  private buildSystemPrompt(nativeLanguage?: string | null): string {
    return `You are WordQuest's Paragraph stage evaluator. A learner has written a 30-100 word paragraph using a target vocabulary word. Score it on exactly five independent dimensions, each 0-100:

- grammar: is the paragraph grammatically correct throughout?
- vocabulary: is vocabulary (including the target word) used correctly and appropriately?
- structure: does the paragraph have a coherent structure (a beginning, development, some sense of shape)?
- flow: do the sentences connect naturally, without feeling like a disconnected list?
- context: is the target word specifically used correctly and meaningfully within the paragraph's context?

If the target word is misused, reflect that in the context score specifically — do not let it drag down grammar, structure, or flow scores that are independently fine. Score each dimension on its own merits.

Also estimate a rough CEFR-style proficiency band (A1, A2, B1, B2, C1, or C2) based on this single paragraph's complexity and control — label it clearly as an estimate, not an official assessment.

Feedback follows this structure: what went well, what needs improvement, an optional suggested revision (a full rewritten paragraph — omit only if the original is already strong), and one concrete next action.

Also report your own confidence (0-1) in this evaluation.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"scores": {"grammar": 0-100, "vocabulary": 0-100, "structure": 0-100, "flow": 0-100, "context": 0-100}, "confidence": 0-1, "estimatedProficiency": "A1"|"A2"|"B1"|"B2"|"C1"|"C2", "whatWentWell": "...", "whatNeedsImprovement": "...", "suggestedRevision": "..." or null, "nextAction": "..."}${nativeLanguageInstruction(nativeLanguage)}`;
  }

  private buildPrompt(
    targetWord: string,
    definition: string,
    partOfSpeech: string,
    paragraph: string,
  ): string {
    return `Target word: "${targetWord}" (${partOfSpeech}) — meaning: ${definition}\n\nLearner's paragraph: "${paragraph}"\n\nEvaluate this paragraph now, following your system instructions exactly.`;
  }

  private parseResponse(response: Anthropic.Messages.Message): ParagraphEvaluation {
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      throw new Error('Paragraph evaluation returned no text response');
    }

    let parsed: {
      scores?: {
        grammar?: unknown;
        vocabulary?: unknown;
        structure?: unknown;
        flow?: unknown;
        context?: unknown;
      };
      confidence?: unknown;
      estimatedProficiency?: unknown;
      whatWentWell?: unknown;
      whatNeedsImprovement?: unknown;
      suggestedRevision?: unknown;
      nextAction?: unknown;
    };
    try {
      parsed = JSON.parse(stripJsonCodeFence(textBlock.text));
    } catch {
      throw new Error(
        `Paragraph evaluation returned unparseable output: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const dimensions = ['grammar', 'vocabulary', 'structure', 'flow', 'context'] as const;
    const rawScores = parsed.scores;
    if (
      !rawScores ||
      typeof parsed.whatWentWell !== 'string' ||
      typeof parsed.whatNeedsImprovement !== 'string' ||
      typeof parsed.nextAction !== 'string' ||
      typeof parsed.estimatedProficiency !== 'string'
    ) {
      throw new Error(
        `Paragraph evaluation response missing required fields: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const scores = {} as ParagraphScores;
    for (const dim of dimensions) {
      const value = rawScores[dim];
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error(
          `Paragraph evaluation returned an invalid ${dim} score: ${textBlock.text.slice(0, 200)}`,
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
      estimatedProficiency: parsed.estimatedProficiency,
      whatWentWell: parsed.whatWentWell,
      whatNeedsImprovement: parsed.whatNeedsImprovement,
      suggestedRevision:
        typeof parsed.suggestedRevision === 'string' ? parsed.suggestedRevision : null,
      nextAction: parsed.nextAction,
    };
  }

  private getClient(): Anthropic {
    if (!this.config.isAiConfigured) {
      throw new ServiceUnavailableException(
        'Paragraph evaluation is not configured. Set AI_PROVIDER_API_KEY.',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.aiApiKey });
    }
    return this.client;
  }
}
