import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getMyProgression, type Progression } from '@/services/progression';
import { getMyJourney, type JourneyView } from '@/services/journey';
import { getTodayQuestSummary, type TodayQuestSummary } from '@/services/quests';
import {
  getBossBattleXpLeaderboard,
  getClanLeaderboard,
  getFriendLeaderboard,
  type LeaderboardEntry,
} from '@/services/leaderboards';
import { listMyWordMastery, type WordMasteryListItem } from '@/services/users';
import { useAuthStore } from '@/state/authStore';

export interface HomeData {
  progression: Progression | null;
  journey: JourneyView | null;
  todaySummary: TodayQuestSummary | null;
  clanViewer: LeaderboardEntry | null;
  bossBattleRankViewer: LeaderboardEntry | null;
  friendRankViewer: LeaderboardEntry | null;
  friendCount: number | null;
  wordMastery: WordMasteryListItem[] | null;
  /** True when the one page-level fetch (progression) failed. */
  failed: boolean;
}

/**
 * Same server reads, same refetch-on-focus behaviour as the classic
 * HomeScreen — the redesigned Home renders live server state only, it
 * never invents or caches progression values. A failed progression
 * fetch is the single page-level error; every other card fails quietly
 * and simply stays empty.
 */
export function useHomeData(): HomeData {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodayQuestSummary | null>(null);
  const [clanViewer, setClanViewer] = useState<LeaderboardEntry | null>(null);
  const [bossBattleRankViewer, setBossBattleRankViewer] = useState<LeaderboardEntry | null>(null);
  const [friendRankViewer, setFriendRankViewer] = useState<LeaderboardEntry | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [wordMastery, setWordMastery] = useState<WordMasteryListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyProgression(accessToken)
      .then((p) => {
        setProgression(p);
        setFailed(false);
      })
      .catch(() => setFailed(true));
    getMyJourney(accessToken).then(setJourney).catch(() => {});
    getTodayQuestSummary(accessToken).then(setTodaySummary).catch(() => {});
    getClanLeaderboard(accessToken)
      .then((v) => setClanViewer(v.viewer))
      .catch(() => {});
    getBossBattleXpLeaderboard(accessToken)
      .then((v) => setBossBattleRankViewer(v.viewer))
      .catch(() => {});
    getFriendLeaderboard(accessToken)
      .then((v) => {
        setFriendRankViewer(v.viewer);
        setFriendCount(v.entries.length - 1);
      })
      .catch(() => {});
    listMyWordMastery(accessToken).then(setWordMastery).catch(() => {});
  }, [accessToken]);

  useEffect(load, [load]);
  useFocusEffect(load);

  return {
    progression,
    journey,
    todaySummary,
    clanViewer,
    bossBattleRankViewer,
    friendRankViewer,
    friendCount,
    wordMastery,
    failed,
  };
}
