import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../config/config.service';

export interface MasterChallengeScores {
  wordUsage: number;
  coherence: number;
  grammar: number;
  vocabulary: number;
  context: number;
}

export interface MasterChallengeEvaluation {
  scores: MasterChallengeScores;
  /** 0-50 per dimension, summed — max 250 (spec §3.8). */
  xpAwarded: number;
  allWordsUsedCorrectly: boolean;
  whatWentWell: string;
  whatNeedsImprovement: string;
  nextAction: string;
}

const MAX_XP_PER_DIMENSION = 50;

/**
 * Three-Word Master Challenge (V1 Final Systems Spec §3.8): after
 * finishing all three of the day's words, one synthesis paragraph
 * requiring all three. Spec lists "correct use of all three words,
 * coherence, grammar, structure, vocabulary, context/relevance" as what
 * to evaluate — looser than Sentence/Paragraph's exact 5-item lists, so
 * this consolidates "structure" into "coherence" to land on 5 clean
 * dimensions at 50 XP each (250 max). "Speed where applicable" isn't
 * scored — no timer exists for this stage in this codebase.
 *
 * Deliberately does not check the paragraph against a "day's category"
 * — this codebase doesn't have a category/theme concept for daily word
 * selection yet, so context is judged on the paragraph's own internal
 * relevance and coherence, not an external theme match that doesn't
 * exist to check against.
 */
@Injectable()
export class MasterChallengeEvaluationService {
  private client: Anthropic | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.isAiConfigured;
  }

  async evaluate(
    words: { word: string; definition: string }[],
    paragraph: string,
  ): Promise<MasterChallengeEvaluation> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.config.aiModel,
      max_tokens: 700,
      system: this.buildSystemPrompt(),
      messages: [{ role: 'user', content: this.buildPrompt(words, paragraph) }],
    });

    return this.parseResponse(response);
  }

  private buildSystemPrompt(): string {
    return `You are WordQuest's Three-Word Master Challenge evaluator. A learner has written one paragraph that must use all three of today's target vocabulary words together, coherently. Score it on exactly five dimensions, each 0-100:

- wordUsage: are all three target words present and used with their correct meanings?
- coherence: does the paragraph read as one coherent piece, not three disconnected sentences bolted together? (this also covers overall structure)
- grammar: is the paragraph grammatically correct?
- vocabulary: is vocabulary used correctly and appropriately throughout, beyond just the three target words?
- context: does each target word sit in a sensible, meaningful context within the paragraph?

Also report allWordsUsedCorrectly (true/false) — false if even one of the three words is missing or used with the wrong meaning, regardless of how good the rest of the paragraph is.

Feedback follows: what went well, what needs improvement, one concrete next action.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"scores": {"wordUsage": 0-100, "coherence": 0-100, "grammar": 0-100, "vocabulary": 0-100, "context": 0-100}, "allWordsUsedCorrectly": true|false, "whatWentWell": "...", "whatNeedsImprovement": "...", "nextAction": "..."}`;
  }

  private buildPrompt(words: { word: string; definition: string }[], paragraph: string): string {
    const wordList = words.map((w) => `"${w.word}" (meaning: ${w.definition})`).join(', ');
    return `Today's three target words: ${wordList}\n\nLearner's paragraph: "${paragraph}"\n\nEvaluate this paragraph now, following your system instructions exactly.`;
  }

  private parseResponse(response: Anthropic.Messages.Message): MasterChallengeEvaluation {
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      throw new Error('Master Challenge evaluation returned no text response');
    }

    let parsed: {
      scores?: {
        wordUsage?: unknown;
        coherence?: unknown;
        grammar?: unknown;
        vocabulary?: unknown;
        context?: unknown;
      };
      allWordsUsedCorrectly?: unknown;
      whatWentWell?: unknown;
      whatNeedsImprovement?: unknown;
      nextAction?: unknown;
    };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new Error(
        `Master Challenge evaluation returned unparseable output: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const dimensions = ['wordUsage', 'coherence', 'grammar', 'vocabulary', 'context'] as const;
    const rawScores = parsed.scores;
    if (
      !rawScores ||
      typeof parsed.allWordsUsedCorrectly !== 'boolean' ||
      typeof parsed.whatWentWell !== 'string' ||
      typeof parsed.whatNeedsImprovement !== 'string' ||
      typeof parsed.nextAction !== 'string'
    ) {
      throw new Error(
        `Master Challenge evaluation response missing required fields: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const scores = {} as MasterChallengeScores;
    for (const dim of dimensions) {
      const value = rawScores[dim];
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error(
          `Master Challenge evaluation returned an invalid ${dim} score: ${textBlock.text.slice(0, 200)}`,
        );
      }
      scores[dim] = value;
    }

    const xpAwarded = dimensions.reduce(
      (sum, dim) => sum + Math.round((scores[dim] / 100) * MAX_XP_PER_DIMENSION),
      0,
    );

    return {
      scores,
      xpAwarded,
      allWordsUsedCorrectly: parsed.allWordsUsedCorrectly,
      whatWentWell: parsed.whatWentWell,
      whatNeedsImprovement: parsed.whatNeedsImprovement,
      nextAction: parsed.nextAction,
    };
  }

  private getClient(): Anthropic {
    if (!this.config.isAiConfigured) {
      throw new ServiceUnavailableException(
        'Master Challenge evaluation is not configured. Set AI_PROVIDER_API_KEY.',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.aiApiKey });
    }
    return this.client;
  }
}
