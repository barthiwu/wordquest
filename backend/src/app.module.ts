import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ClansModule } from './clans/clans.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { MasteryModule } from './mastery/mastery.module';
import { ProgressionModule } from './progression/progression.module';
import { QuestsModule } from './quests/quests.module';
import { JourneyModule } from './journey/journey.module';
import { SkillsModule } from './skills/skills.module';
import { PassportModule } from './passport/passport.module';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { WordInTheWildModule } from './word-in-the-wild/word-in-the-wild.module';
import { BossBattleModule } from './boss-battle/boss-battle.module';
import { OrderModule } from './order/order.module';
import { AchievementModule } from './achievement/achievement.module';
import { QuestCardModule } from './quest-card/quest-card.module';
import { AliModule } from './ali/ali.module';
import { MasterChallengeModule } from './master-challenge/master-challenge.module';
import { NotificationModule } from './notifications/notification.module';
import { ShopModule } from './shop/shop.module';
import { LearningProfileModule } from './learning-profile/learning-profile.module';
import { PracticeModule } from './practice/practice.module';
import { ModerationModule } from './moderation/moderation.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    // Powers every @Cron job in the app (Boss Battle auto-finalization,
    // scheduled notification dispatch) — V1 Remaining Systems Spec §13/§19.
    ScheduleModule.forRoot(),
    // Baseline rate limiting — tightened per-route (esp. auth, submissions,
    // battle actions) once those modules land. See BUILD_HANDOFF §44/§45.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AppConfigModule,
    PrismaModule,
    CommonModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ClansModule,
    VocabularyModule,
    MasteryModule,
    ProgressionModule,
    QuestsModule,
    JourneyModule,
    SkillsModule,
    PassportModule,
    LeaderboardsModule,
    WordInTheWildModule,
    BossBattleModule,
    OrderModule,
    AchievementModule,
    QuestCardModule,
    AliModule,
    MasterChallengeModule,
    NotificationModule,
    ShopModule,
    LearningProfileModule,
    PracticeModule,
    ModerationModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
