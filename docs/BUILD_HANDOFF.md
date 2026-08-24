# WORDQUEST — MASTER PROJECT HANDOFF
## Continuation Brief for External AI / Developer Session
### Version: 1.0 — August 9, 2026

---

> **AMENDMENT (V19 Stabilization Pass, August 2026):** this document is the
> original product-definition handoff and is kept as-is for historical
> continuity — section numbering below is NOT renumbered when scope
> changes, since other documents and code comments reference these
> section/screen numbers directly. Two later correction passes cut scope
> this document still describes:
>
> - **Speaking / Pronunciation** (Screen 14 "Speaking response," the
>   "Speaking" challenge type in §32, "Speaking evaluation" in §33) was
>   removed from V1 entirely — no speech input, Azure Speech integration,
>   or pronunciation scoring exists or is planned for V1. Every mention of
>   it below is superseded.
> - **Skill Radar** (Screen 27 / §27, §20 in the later systems outline) as
>   a 6-dimension radar chart was removed and replaced by CEFR-based
>   proficiency tracking (Learning Passport, §28) as the single source of
>   truth for "how good is this player," per the same correction pass.
>
> The codebase, not this document, is the source of truth for current
> scope — see `docs/DEPLOYMENT.md` and the backend/mobile source directly
> for what's actually built.

---

# 0. INSTRUCTION TO THE NEXT AGENT

You are taking over an ongoing product-development project called **WordQuest**.

Do NOT restart product ideation.

Do NOT ask the user to redesign the product from scratch.

Do NOT reopen decisions that have already been concluded unless there is a genuine technical contradiction or implementation blocker.

The project has completed its major product-definition/documentation phase and is now entering the **BUILD PHASE**.

The immediate objective is to begin implementing the actual WordQuest codebase.

The user strongly prefers:

- Minimal chit-chat.
- Direct execution.
- No unnecessary documentation.
- No repeatedly asking for confirmation about decisions already made.
- Work in concrete increments.
- Explain only what is necessary.
- Build first; document only when documentation is required for implementation.

The user's explicit direction is:

> **Stop documenting and start building.**

---

# 1. PRODUCT

## Product Name

**WordQuest**

WordQuest is a gamified language/vocabulary learning platform that combines structured learning with progression, competition, fantasy-world identity, AI assistance, and RPG-style achievement.

The central concept is:

> Turn vocabulary and language development into a persistent personal quest.

The player does not simply complete isolated language exercises.

They develop:

- Vocabulary
- Mastery
- Skills
- XP
- Levels
- Streaks
- Journey progression
- Clan identity
- Kingdom identity
- Castle identity
- Achievements
- CEFR progression
- Competitive records

The product should feel like a **language-learning game/world**, not a conventional educational app with decorative game elements.

---

# 2. PRODUCT EXPERIENCE LOOP

The fundamental WordQuest loop is:

```text
Enter WordQuest
      ↓
See what to do next
      ↓
Start Quest
      ↓
Encounter word/content
      ↓
Complete challenge
      ↓
Receive immediate feedback
      ↓
Improve mastery
      ↓
Earn XP / rewards
      ↓
Advance progression
      ↓
Develop identity/world
      ↓
Return for next Quest
```

Longer-term:

```text
Quest
 ↓
Mastery
 ↓
XP
 ↓
Level
 ↓
Journey
 ↓
City
 ↓
Kingdom
 ↓
Legend
 ↓
CEFR
 ↓
Competition / identity / deeper systems
```

---

# 3. PRODUCT PHILOSOPHY

The UI and game systems must continually answer:

### What am I doing?

### Why does it matter?

### What can I achieve next?

WordQuest should always provide a clear next action.

The user should not feel lost inside the world.

Fantasy should enhance learning rather than obscure it.

---

# 4. COMPLETED DOCUMENTATION

The following product documentation has already been developed conceptually:

## Volume 1–7 Product Documentation

The project previously went through a substantial multi-volume product-definition process covering the WordQuest product, mechanics, progression, learning systems, world-building, competitive systems, monetization, AI, and supporting architecture.

The user explicitly decided that the documentation phase was sufficiently complete for implementation.

Do not restart those volumes.

---

# 5. COMPLETED UI/UX DOCUMENT

A **WordQuest UI/UX Screen Bible** was completed.

It defined the major screens, navigation, states, interactions, animations, data dependencies, analytics, MVP/post-MVP boundaries, and accessibility requirements.

Important screens include:

1. Splash
2. Welcome
3. Registration
4. Login
5. Player identity onboarding
6. Learning goal onboarding
7. Clan selection
8. ALI introduction
9. First Quest
10. Word presentation
11. Word challenge
12. Answer feedback
13. Writing response
14. Speaking response
15. Quest progress
16. Quest completion
17. Daily Quest
18. Streak
19. Home
20. Journey map
21. Journey stage
22. City
23. Kingdom
24. Castle
25. Legend
26. Clan
27. Skill Radar
28. Learning Passport
29. CEFR locked
30. CEFR unlocked
31. Profile
32. Achievements
33. Boss Battle hub
34. Boss Battle lobby
35. Boss countdown
36. Active Boss Battle
37. Live leaderboard
38. Battle complete
39. Leaderboards
40. Personal bests
41. Rewards
42. Glyph wallet
43. Shop
44. ALI
45. ALI customization
46. Notifications
47. Settings
48. Quest+
49. Practice Arena
50. Subscription management
51. Loading state
52. Empty state
53. Locked state
54. Error state
55. Offline state
56. Success toasts
57. Confirmation modals
58. Player report
59. Support
60. Maintenance/update

Not all of these are MVP.

---

# 6. MVP UI

The initial MVP screen set is:

```text
Splash
Welcome
Registration/Login
Onboarding
Clan Selection
Home
Daily Quest
Word Presentation
Challenges
Feedback
Quest Completion
Journey
Profile
Skill Radar
Learning Passport
Streak
Basic Boss Battle
Boss Results
Leaderboard
Rewards
Glyph Wallet
Basic ALI
CEFR Locked/Unlocked
Notifications
Settings
Basic Kingdom/Castle
```

Advanced systems should not block the first playable product.

---

# 7. TECHNICAL ARCHITECTURE ALREADY DECIDED

## Frontend

**React Native + Expo + TypeScript**

Primary platforms:

- iOS
- Android

The architecture should be mobile-first.

---

# 8. BACKEND

**NestJS + TypeScript**

Initial backend architecture:

> Modular monolith.

Do NOT unnecessarily introduce microservices at MVP.

---

# 9. DATABASE

Primary database:

> PostgreSQL

ORM:

> Prisma

PostgreSQL is the authoritative source of truth for permanent application data.

---

# 10. CACHE / TEMPORARY STATE

Use:

> Redis

Potential uses:

- Caching
- Rate limiting
- Temporary battle state
- Leaderboards
- Job queues
- Distributed locks where necessary

Redis is NOT the permanent source of truth.

---

# 11. REAL-TIME SYSTEM

Boss Battles require real-time communication.

Use:

> WebSockets

Battle events can include:

```text
battle.started
battle.question
battle.answer_submitted
battle.score_updated
battle.rank_updated
battle.player_joined
battle.player_left
battle.completed
```

The server is authoritative.

---

# 12. OBJECT STORAGE

Use S3-compatible object storage for:

- Images
- Audio
- ALI assets
- Animation assets
- User-uploaded media where appropriate

Do not store large media directly in PostgreSQL.

---

# 13. AI ARCHITECTURE

AI must be accessed through the WordQuest backend.

Correct:

```text
Mobile
 ↓
WordQuest Backend
 ↓
AI Orchestration Layer
 ↓
AI Provider
 ↓
Validation
 ↓
WordQuest Rules
 ↓
Mobile
```

Incorrect:

```text
Mobile
 ↓
Direct AI Provider
```

The AI provider should be abstracted behind an internal service layer so it can be replaced later.

---

# 14. ALI

ALI is an actual WordQuest character.

ALI is not merely a chatbot interface.

ALI serves as:

- Guide
- Learning companion
- Character
- Contextual assistant
- Personality layer

ALI should understand relevant player context where appropriate.

Potential context:

- Current Quest
- Current word
- Recent performance
- Journey stage
- Achievements
- Learning weaknesses

ALI should NOT have unrestricted access to the entire user database.

---

# 15. ALI CUSTOMIZATION

The user specifically approved making ALI customizable.

Players can use their earned currency/tokens/Glyphs to purchase clothing and cosmetic items for ALI.

The system should therefore eventually support:

```text
ALI
 ↓
Clothing
Accessories
Cosmetics
 ↓
Inventory
 ↓
Equip
```

The visual quality of ALI's animation matters.

ALI must feel like a real character within the world.

---

# 16. GLYPHS

Glyphs are a WordQuest reward/economy mechanism.

The economy should use a ledger rather than merely changing a balance.

Example:

```text
+50 Glyphs
Quest Completion

-100 Glyphs
ALI Outfit Purchase
```

Every transaction should have:

- User
- Amount
- Direction
- Reason
- Source
- Timestamp
- Reference where applicable

The backend controls Glyph balances.

The client cannot simply award itself Glyphs.

---

# 17. INSIGHT GLYPHS

The project also established the concept of **Insight Glyphs**.

The exact detailed implementation can be finalized during implementation where necessary, but the concept should remain part of WordQuest's reward/progression ecosystem.

Do not remove the concept merely because it was not required for the first MVP screen.

---

# 18. COUNTRY FLAG + CASTLE

One of the user's specific approved ideas:

The player's **country flag should wave at their Castle**.

The correct implementation concept is:

```text
User
 ↓
Country Code
 ↓
Flag Asset
 ↓
Castle
 ↓
Animated Waving Flag
```

Do not require users to upload arbitrary flag images for this feature.

Store the country code.

Example:

```text
country_code = NG
```

The frontend maps it to the appropriate flag asset.

The flag should be an actual animated visual element of the Castle.

---

# 19. CLANS

The user approved a clan system inspired visually by the concept of banners/factions in fantasy worlds such as Game of Thrones.

WordQuest should have multiple fictional clans.

Each clan has:

- Name
- Banner
- Visual identity
- Description
- Lore
- Selection state

The player's selected clan becomes part of their identity.

The **clan banner** should also visually represent the player's Kingdom.

The system should therefore support:

```text
Player
 ↓
Clan
 ↓
Clan Banner
 ↓
Kingdom visual identity
```

Do not copy Game of Thrones names, logos, or copyrighted assets.

Use original WordQuest clans.

---

# 20. KINGDOM

Kingdom is the player's larger world representation.

It should visually incorporate:

- Clan
- Banner
- Castle
- Player identity
- Progression
- World effects

The first implementation can be relatively lightweight.

Do not let an elaborate Kingdom-building system delay the core learning loop.

---

# 21. LEGEND

Legend is a major progression state.

The user suggested that Legend could use:

- Superhero-like celestial heads/effects

but then proposed a better direction:

> Use the player's level name to create the visual effect while stars and shimmering effects surround it.

The agreed direction is therefore:

**Level-name-driven celestial effects.**

The effect should communicate:

> "This player has reached a significant status."

Possible elements:

- Stars
- Shimmer
- Aura
- Celestial particles
- Environment transformation

The exact visual implementation can be refined during development.

---

# 22. CEFR

CEFR unlock has a deterministic rule.

The previously established requirement is:

```text
100 mastered words
+
15 consecutive days
+
4 completed Boss Battles
+
Stage 4 — City
=
CEFR unlocked
```

The backend must be authoritative.

Conceptually:

```text
eligible =
    masteredWords >= 100
    AND streak >= 15
    AND bossBattlesCompleted >= 4
    AND journeyStage >= CITY
```

Once satisfied:

```text
cefr_unlocked = true
```

The frontend displays the appropriate unlock sequence.

---

# 23. JOURNEY

Journey represents long-term progression.

It should visually communicate movement through a world.

Important milestone:

> City

City is Stage 4 in the CEFR requirement.

Journey should have:

- Completed stages
- Current stage
- Locked stages
- Requirements
- Rewards
- Environment

---

# 24. XP

XP is a core progression currency.

XP must be calculated server-side.

The client never determines how much XP the user earns.

XP should feed:

- Level
- Journey
- Progress
- Achievements
- Visual status

XP thresholds should be configurable rather than hard-coded throughout the application.

---

# 25. MASTERY

Mastery tracks the player's relationship with individual words.

The engine can consider:

- Correctness
- Frequency
- Recency
- Recall
- Context
- Review performance

The exact mathematical formula can be implemented as a deterministic versioned ruleset.

---

# 26. STREAK

The server determines streak validity.

The system must consider:

- Calendar day
- User timezone
- Meaningful activity
- Consecutive days

Do not trust the device clock.

---

# 27. SKILL RADAR

> **Superseded** — see the amendment note at the top of this document.
> Skill Radar was removed; CEFR-based proficiency tracking (§28, Learning
> Passport) is the actual V1 mechanism.

The Skill Radar represents multiple dimensions of language ability.

It should communicate:

- Strengths
- Weaknesses
- Current level
- Progress/trend

Possible dimensions can include:

- Vocabulary
- Context
- Recall
- Sentence construction
- Writing
- Speaking

The final exact dimensions should align with the learning model used in implementation.

---

# 28. LEARNING PASSPORT

The Passport is the player's permanent learning record.

It can display:

- Name
- Avatar
- Country
- Clan
- Journey stage
- Level
- Words mastered
- CEFR
- Skill profile
- Achievements
- Boss Battle history
- Major milestones

It should feel like a credential/progression record rather than merely another profile screen.

---

# 29. BOSS BATTLES

Boss Battles are competitive language-learning sessions.

The established architecture allows:

> Maximum 20 players.

Core flow:

```text
Battle Created
 ↓
Scheduled
 ↓
Lobby
 ↓
Players Join
 ↓
Countdown
 ↓
Battle Starts
 ↓
Challenges
 ↓
Answers
 ↓
Server Scoring
 ↓
Live Ranking
 ↓
Battle Ends
 ↓
Final Ranking
 ↓
Rewards
```

Battle states:

```text
DRAFT
SCHEDULED
LOBBY
ACTIVE
COMPLETED
CANCELLED
```

The server controls:

- Timer
- Score
- Ranking
- Completion

---

# 30. LEADERBOARDS

Potential categories:

- Global
- Friends
- Clan
- Personal

Leaderboards must use authoritative data.

Redis may be used for fast ranking, but permanent records remain in PostgreSQL.

---

# 31. QUEST ENGINE

Quest definitions should be data/configuration-driven.

General flow:

```text
Start Quest
 ↓
Load Quest
 ↓
Select Activities
 ↓
Present Challenge
 ↓
Submit Answer
 ↓
Evaluate
 ↓
Record Attempt
 ↓
Update Mastery
 ↓
Calculate XP
 ↓
Calculate Rewards
 ↓
Continue
 ↓
Quest Complete
```

Do not hard-code the entire Quest system into UI screens.

---

# 32. LEARNING CHALLENGES

Potential challenge types include:

- Multiple choice
- Fill in the blank
- Meaning selection
- Context selection
- Sentence construction
- Writing
- Speaking
- Recall

The architecture should allow new challenge types to be added later.

---

# 33. AI EVALUATION

AI can assist with:

- Writing evaluation
- Speaking evaluation
- Explanations
- Contextual feedback
- ALI dialogue

But AI does NOT independently control:

- XP
- Glyphs
- Mastery state
- CEFR unlock
- Battle ranking

AI output must be validated before being incorporated into product state.

---

# 34. AUTHENTICATION

Required:

- Registration
- Login
- Password hashing
- Email verification
- Password reset
- Session/token management
- Account recovery

Passwords must never be stored in plaintext.

---

# 35. AUTHORIZATION

Initial roles:

```text
USER
ADMIN
CONTENT_EDITOR
SUPPORT
```

Potential future:

```text
MODERATOR
ANALYST
FINANCE
SUPER_ADMIN
```

Authorization must happen server-side.

---

# 36. API

Backend API should be versioned.

Base structure:

```text
/api/v1/auth
/api/v1/users
/api/v1/quests
/api/v1/words
/api/v1/mastery
/api/v1/journey
/api/v1/battles
/api/v1/leaderboards
/api/v1/rewards
/api/v1/clans
/api/v1/kingdom
/api/v1/ali
/api/v1/cefr
/api/v1/notifications
/api/v1/subscriptions
/api/v1/analytics
```

Exact endpoints can be designed during implementation.

---

# 37. FRONTEND FOLDER ARCHITECTURE

Recommended:

```text
src/
│
├── app/
│   ├── navigation/
│   ├── providers/
│   └── config/
│
├── features/
│   ├── auth/
│   ├── onboarding/
│   ├── home/
│   ├── quests/
│   ├── vocabulary/
│   ├── mastery/
│   ├── journey/
│   ├── skills/
│   ├── passport/
│   ├── boss-battles/
│   ├── leaderboard/
│   ├── clans/
│   ├── kingdom/
│   ├── castle/
│   ├── ali/
│   ├── rewards/
│   ├── shop/
│   ├── cefr/
│   ├── notifications/
│   ├── profile/
│   └── subscription/
│
├── components/
├── services/
├── hooks/
├── state/
├── utils/
├── types/
├── constants/
├── assets/
└── tests/
```

---

# 38. BACKEND MODULES

Recommended:

```text
Auth
Users
Vocabulary
Content
Quests
Learning
Mastery
Progression
Rewards
Battles
Leaderboards
Clans
Kingdom
Castle
ALI
CEFR
Notifications
Subscriptions
Analytics
Admin
```

---

# 39. ARCHITECTURAL PRINCIPLE

The system is a:

> **Modular monolith**

not a premature microservice architecture.

The internal boundaries should be clean enough that specific systems can later be extracted if necessary.

---

# 40. CORE DATA OWNERSHIP

Backend owns:

- User progression
- Learning records
- XP
- Mastery
- Streak
- Rewards
- Glyphs
- Battles
- Leaderboards
- CEFR
- Purchases
- Subscription state

Frontend owns:

- Presentation
- Temporary UI state
- Local preferences
- Safe cache

---

# 41. TECHNICAL NON-NEGOTIABLES

1. Backend is authoritative.
2. Client cannot award itself XP.
3. Client cannot award itself Glyphs.
4. Client cannot determine Boss Battle scores.
5. AI cannot directly modify progression.
6. PostgreSQL is the permanent source of truth.
7. Redis is not permanent truth.
8. Secrets never go into Git.
9. Critical operations should be idempotent.
10. Database changes use migrations.
11. Business logic does not live inside UI components.
12. Configuration should be centralized.
13. External providers should be abstracted.
14. MVP infrastructure should remain simple.
15. Critical actions should be recoverable or clearly reported.

---

# 42. ERROR / LOADING / EMPTY STATES

Every major screen must support appropriate:

- Loading
- Empty
- Locked
- Error
- Offline
- Success

Example locked state:

```text
CEFR
Locked

73 / 100 mastered words
12 / 15 day streak
3 / 4 Boss Battles
City: ✓
```

The user should always know what remains.

---

# 43. ANALYTICS

Important events include:

```text
onboarding_started
onboarding_completed
first_quest_started
quest_completed
word_submitted
word_mastered
journey_viewed
passport_viewed
cefr_viewed
boss_lobby_joined
boss_battle_started
boss_battle_completed
shop_viewed
cosmetic_purchased
ali_opened
ali_item_equipped
quest_plus_viewed
quest_plus_purchased
```

Analytics should be centralized.

---

# 44. SECURITY

Must include:

- HTTPS
- Secure authentication
- Password hashing
- Authorization
- Input validation
- Rate limiting
- Secret management
- Secure uploads
- Audit logging
- Anti-cheat

---

# 45. ANTI-CHEAT

Protect:

- XP
- Glyphs
- Mastery
- Level
- Battle score
- Rewards
- CEFR
- Leaderboards

Potential attack vectors:

- Replay requests
- Modified client
- API manipulation
- Duplicate submissions
- Timing manipulation
- Automated submissions

---

# 46. CONFIGURATION-DRIVEN SYSTEMS

These should be configurable:

- XP values
- Glyph rewards
- Level thresholds
- Journey thresholds
- Mastery thresholds
- Quest definitions
- Battle duration
- Battle capacity
- Achievement requirements
- CEFR requirements
- Cosmetic prices

Do not scatter these values throughout code.

---

# 47. BUILD ORDER

The previously agreed engineering build sequence is:

## FOUNDATION

1. Repository
2. CI/CD
3. Environment configuration
4. Database
5. Backend foundation
6. Mobile foundation

## IDENTITY

7. Authentication
8. User profile
9. Onboarding
10. Clan selection

## LEARNING

11. Vocabulary
12. Content
13. Quest Engine
14. Answer evaluation
15. Mastery
16. XP
17. Streak

## PROGRESSION

18. Level
19. Journey
20. Skill Radar
21. Passport
22. CEFR

## GAME

23. Rewards
24. Glyphs
25. Leaderboards
26. Boss Battles

## WORLD

27. ALI
28. Kingdom
29. Castle
30. Legend effects

## PLATFORM

31. Notifications
32. Analytics
33. Settings
34. Support

## COMMERCIAL

35. Quest+
36. Shop
37. Cosmetics

---

# 48. WHAT HAS NOT BEEN BUILT YET

At the point of this handoff, the project has moved from documentation into implementation, but no completed production WordQuest application has been established in this conversation.

The next agent should therefore assume:

> **Build has just begun.**

Do not pretend that any code, repository, database, API, UI, or deployment already exists unless the external workspace actually contains it.

---

# 49. IMMEDIATE NEXT TASK

The next engineering task is:

## SET UP THE WORDQUEST CODEBASE.

Start with:

```text
WordQuest/
├── mobile/
├── backend/
├── packages/        # if shared package architecture is used
├── docs/
└── README.md
```

Then establish:

### Mobile

- Expo
- React Native
- TypeScript
- Navigation
- Basic app shell
- Design-system foundation

### Backend

- NestJS
- TypeScript
- API foundation
- Environment configuration
- Health endpoint

### Database

- PostgreSQL
- Prisma
- Initial schema foundation
- Migration system

### Development

- Git
- Environment files
- Linting
- Formatting
- Type checking
- Basic tests

Do NOT attempt to build all 60 screens immediately.

---

# 50. FIRST PLAYABLE MILESTONE

After infrastructure is established, the first meaningful milestone is:

> **A user can register, enter the app, start a Quest, answer a vocabulary challenge, receive feedback, earn XP, and see their updated progress.**

This is more important than having a beautiful but non-functional Kingdom.

The first playable vertical slice should therefore be:

```text
Register
 ↓
Onboarding
 ↓
Home
 ↓
Start Daily Quest
 ↓
See Word
 ↓
Answer
 ↓
Receive Feedback
 ↓
Earn XP
 ↓
Quest Complete
 ↓
See Progress
```

---

# 51. SECOND PLAYABLE MILESTONE

After the first loop works:

```text
Mastery
 ↓
Streak
 ↓
Journey
 ↓
Skill Radar
 ↓
Passport
```

---

# 52. THIRD PLAYABLE MILESTONE

Then:

```text
Glyphs
 ↓
Rewards
 ↓
Leaderboards
 ↓
Boss Battle
```

---

# 53. FOURTH PLAYABLE MILESTONE

Then:

```text
ALI
 ↓
Kingdom
 ↓
Castle
 ↓
Country Flag
 ↓
Clan Banner
 ↓
Legend Effects
```

---

# 54. FIFTH MILESTONE

Then:

```text
CEFR
Quest+
Shop
ALI Cosmetics
Advanced Economy
Advanced Social/Competitive Systems
```

---

# 55. PRODUCT DECISIONS THAT MUST NOT BE LOST

The following are especially important because they were specific decisions made during the product discussion.

### Castle

The user's **country flag waves at their Castle**.

### Kingdom

Players belong to fictional clans.

Each clan has its own banner.

The selected clan banner becomes part of the player's Kingdom visual identity.

### Legend

Legend uses celestial visual effects.

The preferred direction is to make the visual effect respond to the player's **level name**, with stars/shimmering/celestial treatment.

### ALI

ALI is a real character.

Players can eventually use their earned tokens/Glyphs to buy clothing/cosmetics for ALI.

### Insight Glyphs

The Insight Glyph concept remains part of the product.

### Commandments

The product's previously established commandments/principles remain valid and should not be discarded merely because they are not repeated in this handoff.

---

# 56. MVP PRIORITY RULE

When deciding what to build next, prioritize:

```text
Learning value
+
Core gameplay
+
Progression
+
Retention
```

over:

```text
Decorative complexity
+
Advanced social features
+
Cosmetic depth
```

The world should grow around a working learning game.

---

# 57. IMPORTANT PRODUCT BALANCE

WordQuest should NOT become:

> A fantasy game that happens to contain vocabulary questions.

It should remain:

> A language-learning system that becomes compelling because it behaves like a game/world.

Learning is the core.

The game layer provides motivation, identity, progression and retention.

---

# 58. DEVELOPMENT STYLE

The user wants implementation to proceed efficiently.

Avoid:

- Long theoretical explanations
- Repeated confirmation requests
- Re-documenting concluded decisions
- Generating another "volume" before implementation
- Asking what the user wants to do next when the build sequence already determines it

Prefer:

```text
Inspect
 ↓
Implement
 ↓
Run
 ↓
Test
 ↓
Fix
 ↓
Show result
 ↓
Move to next build increment
```

---

# 59. IF A TECHNICAL DECISION IS UNCERTAIN

Choose the simplest option consistent with the architecture.

Do not stop the build for minor decisions.

Only ask the user when:

- The decision materially changes the product.
- There are incompatible requirements.
- Credentials/access are genuinely required.
- A destructive action needs approval.
- A major product decision has not actually been made.

Otherwise:

> Make the reasonable engineering decision and continue.

---

# 60. CURRENT PROJECT STATUS

```text
PRODUCT VISION                 ✓
PRODUCT SYSTEMS                ✓
GAME MECHANICS                 ✓
PROGRESSION CONCEPT            ✓
WORLD CONCEPT                  ✓
UI/UX SCREEN BIBLE              ✓
TECHNICAL ARCHITECTURE         ✓
BUILD STRATEGY                 ✓

ACTUAL CODEBASE                → BEGIN NOW
DATABASE IMPLEMENTATION        → NEXT
AUTHENTICATION                 → AFTER FOUNDATION
FIRST PLAYABLE QUEST           → FIRST MAJOR MILESTONE
```

---

# 61. FINAL HANDOFF COMMAND

The next agent should treat this document as the current WordQuest project context.

Start by inspecting the available workspace/repository.

If there is an existing WordQuest repository, preserve and build upon it.

If there is no repository, initialize the agreed architecture.

Do not create another product Bible.

Do not create another UI/UX Bible.

Do not create another technical architecture document.

**Start building.**

The immediate objective is:

> **Create the WordQuest development foundation and begin the first playable vertical slice.**

---

# END OF WORDQUEST MASTER HANDOFF
