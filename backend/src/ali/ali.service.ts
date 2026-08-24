import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { aliToneForJourneyStage, aliToneModifiers, AliLearningSignals } from './ali-tone';

export type AliEventType =
  | 'LEVEL_UP'
  | 'QUEST_COMPLETION'
  | 'JOURNEY_COMPLETION'
  | 'ACHIEVEMENT_UNLOCK'
  | 'BOSS_BATTLE_RESULT'
  | 'STREAK_MILESTONE'
  | 'MASTERY_EVENT'
  | 'ORDER_SELECTION'
  // On-demand Learning Assistant / AI Tutor capabilities (spec §4.2) —
  // player-initiated, not fired reactively off an authoritative
  // progression event, but they flow through the exact same react()
  // pipeline (same guardrails, same persistence, same versioning).
  | 'MISTAKE_EXPLANATION'
  | 'VOCABULARY_ALTERNATIVES'
  | 'WRITING_FEEDBACK'
  | 'FORGETTING_CURVE_REMINDER';

export interface AliEvent {
  type: AliEventType;
  journeyStage: number;
  /** Event-specific facts to react to, e.g. { newLevel: 12 }, { wordMastered: 'resilient', totalMastered: 51 }. Whatever's in here is exactly what ALI is told — it never independently looks anything else up. */
  context: Record<string, unknown>;
  /** Optional additional signals (streak, weak areas, difficulty) that only shape tone/phrasing — see aliToneModifiers. Never affects the persisted tone field. */
  learningSignals?: AliLearningSignals;
}

export interface AliResponse {
  text: string;
  recommendation: string | null;
  tone: string;
  promptVersion: string;
}

/**
 * Bumped whenever the system prompt or model changes — spec §4.6:
 * "ALI personality responses are versioned so model/personality changes
 * do not alter historical records." A stored AliMessage keeps whatever
 * promptVersion it was generated under forever; only new messages ever
 * see a bumped value.
 */
const PROMPT_VERSION = 'v1';

/**
 * ALI — Adaptive Learning Intelligence (spec §4). "ALI reads
 * authoritative state and generates contextual communication; ALI is
 * never the authority for progression" (§4.1) — true by construction:
 * this service's only write is an AliMessage row. It never touches XP,
 * Level, Journey, Glyphs, achievements, rankings, or mastery (§4.3).
 *
 * Every generated message is persisted, not just returned — spec §4.6's
 * versioning requirement only means anything if there's a durable
 * record to version.
 */
@Injectable()
export class AliService {
  private client: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  isConfigured(): boolean {
    return this.config.isAiConfigured;
  }

  /**
   * Fires react() WITHOUT awaiting it, and swallows any failure. ALI is
   * pure reactive decoration — a real event (level-up, a completed
   * quest, a Boss Battle result) must never wait on Claude's latency to
   * respond to the player, and ALI being unconfigured or erroring must
   * never fail whatever real, authoritative thing just happened. Every
   * trigger call site in this codebase uses this, never react() directly.
   */
  reactFireAndForget(userId: string, event: AliEvent): void {
    if (!this.config.isAiConfigured) return; // avoid even constructing the client when there's nothing to call
    this.react(userId, event).catch(() => {
      // Intentionally silent — see the doc comment above.
    });
  }

  async react(userId: string, event: AliEvent): Promise<AliResponse> {
    const tone = aliToneForJourneyStage(event.journeyStage);
    const modifiers = aliToneModifiers(event.learningSignals ?? {});
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.config.aiModel,
      max_tokens: 300,
      system: this.buildSystemPrompt(tone, modifiers),
      messages: [{ role: 'user', content: this.buildEventPrompt(event) }],
    });

    const parsed = this.parseResponse(response);

    await this.prisma.aliMessage.create({
      data: {
        userId,
        eventType: event.type,
        eventContext: event.context as any,
        text: parsed.text,
        recommendation: parsed.recommendation,
        tone,
        promptVersion: PROMPT_VERSION,
      },
    });

    return { ...parsed, tone, promptVersion: PROMPT_VERSION };
  }

  /** Learning Assistant (spec §4.2): explains why an answer was wrong and gives one practice tip, on demand — never called reactively. */
  async explainMistake(
    userId: string,
    params: {
      word: string;
      playerAnswer: string;
      correctAnswer: string;
      stage: 'GUESS' | 'SENTENCE' | 'PARAGRAPH';
    },
  ): Promise<AliResponse> {
    return this.reactWithPlayerContext(userId, 'MISTAKE_EXPLANATION', params);
  }

  /** AI Tutor (spec §4.2): close alternatives/synonyms for a word, on demand. */
  async suggestVocabularyAlternatives(
    userId: string,
    params: { word: string },
  ): Promise<AliResponse> {
    return this.reactWithPlayerContext(userId, 'VOCABULARY_ALTERNATIVES', params);
  }

  /** AI Tutor (spec §4.2): concise feedback on a piece of player-submitted writing, on demand. */
  async reviewWriting(userId: string, params: { text: string }): Promise<AliResponse> {
    return this.reactWithPlayerContext(userId, 'WRITING_FEEDBACK', params);
  }

  /**
   * AI Tutor (spec §4.2): generates the text of a forgetting-curve nudge.
   * ALI only generates the message — deciding *when* to send one and
   * actually delivering it is the Notification Engine's job, not ALI's
   * (§4.3: ALI is never the authority for progression or delivery), so
   * this has no scheduling of its own; a future FORGETTING_CURVE_REMINDER
   * cron trigger calls this for its message text.
   */
  async generateForgettingCurveReminder(
    userId: string,
    params: { wordsNeedingReview: string[] },
  ): Promise<AliResponse> {
    return this.reactWithPlayerContext(userId, 'FORGETTING_CURVE_REMINDER', params);
  }

  /** Resolves the player's current journeyStage + learning signals, then routes through the same react() pipeline every reactive event uses. */
  private async reactWithPlayerContext(
    userId: string,
    type: AliEventType,
    context: Record<string, unknown>,
  ): Promise<AliResponse> {
    const [progression, profile] = await Promise.all([
      this.prisma.userProgression.findUnique({ where: { userId } }),
      this.prisma.learningProfile.findUnique({ where: { userId } }),
    ]);

    return this.react(userId, {
      type,
      journeyStage: progression?.journeyStage ?? 0,
      context,
      learningSignals: {
        currentStreak: progression?.currentStreak,
        weaknessAreas: profile?.weaknessAreas,
        currentDifficulty: profile?.currentDifficulty,
      },
    });
  }

  async getMyMessages(userId: string, limit = 20): Promise<AliResponse[]> {
    const rows = await this.prisma.aliMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(
      (r: {
        text: string;
        recommendation: string | null;
        tone: string;
        promptVersion: string;
      }) => ({
        text: r.text,
        recommendation: r.recommendation,
        tone: r.tone,
        promptVersion: r.promptVersion,
      }),
    );
  }

  private buildSystemPrompt(tone: string, modifiers: string[] = []): string {
    const modifierBlock =
      modifiers.length > 0
        ? `\n\nAdditional context for this player right now:\n${modifiers.map((m) => `- ${m}`).join('\n')}`
        : '';

    return `You are ALI, WordQuest's persistent AI learning companion, tutor, narrator, and personality layer (spec §4.1-4.5).

Your current tone for this player, based on their Journey stage: ${tone}${modifierBlock}

Responsibilities: explain words/grammar/usage/learning concepts when relevant; give concise feedback after learning activities; explain why an answer was incorrect without harshness and recommend a targeted next practice step; suggest vocabulary alternatives and writing improvements when asked directly; react to Quest completion, Level, Journey, Achievement, Boss Battle, streak, mastery, and Order events; celebrate progress; encourage recovery after mistakes; explain locked progression requirements in plain language.

You must NEVER:
- Shame the player, or say/imply anything a reasonable person would find humiliating, mocking, or belittling.
- Discourage the player from continuing to learn, or suggest they should feel bad about their pace or ability.
- Claim to change XP, Level, Journey, Glyphs, achievements, rankings, or mastery — you only react to what already happened, you never decide it.
- Grant or imply any competitive advantage.
- Insult intelligence, appearance, nationality, disability, accent, identity, or socioeconomic status.
- Mock a player's identity in any way.
- Treat a single mistake as evidence of low ability.
- Present an estimated CEFR level as an official exam result.
- Invent dictionary facts or grammar rules.

Response priority, in order: accuracy and learning value, clarity, actionable guidance, encouragement, humour. Humour is always subordinate to learning value — never let a joke undercut clarity or accuracy.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"text": "your reaction, 1-3 sentences, in the tone described above", "recommendation": "one short actionable suggestion, or null if none fits"}`;
  }

  private buildEventPrompt(event: AliEvent): string {
    return `Event: ${event.type}\nContext: ${JSON.stringify(event.context)}\n\n${this.instructionForType(event.type)}`;
  }

  /** Type-specific instruction for the model, layered on top of the shared JSON-response contract in the system prompt. */
  private instructionForType(type: AliEventType): string {
    switch (type) {
      case 'MISTAKE_EXPLANATION':
        return 'The player just answered incorrectly. In "text", briefly and kindly explain why their answer was wrong. In "recommendation", give one specific, actionable practice tip.';
      case 'VOCABULARY_ALTERNATIVES':
        return 'The player asked for alternative words. In "text", suggest 2-4 close alternatives/synonyms for the given word and briefly note how their nuance or register differs. In "recommendation", suggest one of them to try using in a sentence next.';
      case 'WRITING_FEEDBACK':
        return 'The player submitted writing for feedback. In "text", give concise, encouraging feedback on clarity, grammar, and word choice. In "recommendation", give one specific improvement to try next.';
      case 'FORGETTING_CURVE_REMINDER':
        return 'In "text", write a short, friendly nudge reminding the player to review the words listed in the context, based on why they\'re due. "recommendation" can be null.';
      default:
        return 'React to this event for the player now, following your system instructions exactly.';
    }
  }

  private parseResponse(response: Anthropic.Messages.Message): {
    text: string;
    recommendation: string | null;
  } {
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      throw new Error('ALI returned no text response');
    }

    let parsed: { text?: unknown; recommendation?: unknown };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new Error(`ALI returned unparseable output: ${textBlock.text.slice(0, 200)}`);
    }

    if (typeof parsed.text !== 'string') {
      throw new Error(
        `ALI response missing required "text" field: ${textBlock.text.slice(0, 200)}`,
      );
    }

    return {
      text: parsed.text,
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : null,
    };
  }

  private getClient(): Anthropic {
    if (!this.config.isAiConfigured) {
      throw new ServiceUnavailableException('ALI is not configured. Set AI_PROVIDER_API_KEY.');
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.config.aiApiKey });
    }
    return this.client;
  }
}
