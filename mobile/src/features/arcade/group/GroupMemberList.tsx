import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { AvatarBubble } from '@/components/AvatarBubble';
import type { GroupMember } from '@/services/arcadeGroups';
import { formatClock } from './groupFormat';

interface Props {
  colors: ThemeColors;
  members: GroupMember[];
  wordsTotal: number | null;
  /** Host in the lobby / mid-round: shows a Remove action on other members. */
  onRemove?: (member: GroupMember) => void;
  /** The member the host has tapped Remove on once (the second tap confirms). */
  confirmingRemoveId?: string | null;
  /** Hide the score columns (the lobby has none yet). */
  showScores: boolean;
  /** The round is over: a half-finished or never-started play is labelled as such. */
  ended?: boolean;
}

/** The members of a group, as a lobby roster or a ranked results table. */
export function GroupMemberList({
  colors,
  members,
  wordsTotal,
  onRemove,
  confirmingRemoveId,
  showScores,
  ended = false,
}: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');

  return (
    <View style={styles.list} accessibilityLabel={t('group.results.table')}>
      {members.map((m) => {
        const scored = showScores && m.correct !== null && m.state !== 'NOT_STARTED';
        // The lobby has no progress to show; after the round, say what happened.
        const stateLabel = !showScores
          ? ''
          : ended && m.state === 'PLAYING'
            ? t('group.state.UNFINISHED')
            : ended && m.state === 'NOT_STARTED'
              ? t('group.state.ABSENT')
              : t(`group.state.${m.state}`);
        const sub = [m.isHost ? t('group.lobby.host') : '', stateLabel].filter(Boolean).join(' · ');
        return (
          <View key={m.userId} style={[styles.row, m.isMe && styles.rowMe]}>
            {showScores ? (
              <Text style={styles.rank}>{m.rank !== null ? `#${m.rank}` : '–'}</Text>
            ) : null}
            <AvatarBubble colors={colors} avatarUrl={m.avatarUrl} username={m.username} size={32} />
            <View style={styles.nameCol}>
              <Text style={styles.name} numberOfLines={1}>
                {m.username}
                {m.isMe ? ` (${t('group.lobby.you')})` : ''}
              </Text>
              {sub ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              ) : null}
            </View>
            {scored ? (
              <View style={styles.scoreCol}>
                <Text style={styles.score}>
                  {wordsTotal
                    ? t('group.results.score', { correct: m.correct, total: wordsTotal })
                    : String(m.correct)}
                </Text>
                {m.timeMs ? <Text style={styles.sub}>{formatClock(m.timeMs)}</Text> : null}
              </View>
            ) : null}
            {onRemove && !m.isHost ? (
              <Pressable
                style={styles.remove}
                onPress={() => onRemove(m)}
                accessibilityRole="button"
                accessibilityLabel={`${t('group.lobby.remove')} ${m.username}`}
              >
                <Text style={styles.removeText}>
                  {confirmingRemoveId === m.userId
                    ? t('group.lobby.confirmRemove')
                    : t('group.lobby.remove')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: { gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    rowMe: { borderColor: colors.arcane },
    rank: {
      width: 34,
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '800',
    },
    nameCol: { flex: 1, gap: 1 },
    name: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    sub: { color: colors.inkMuted, fontSize: typography.scale.sm },
    scoreCol: { alignItems: 'flex-end', gap: 1 },
    score: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '800' },
    remove: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
    removeText: { color: colors.danger, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
