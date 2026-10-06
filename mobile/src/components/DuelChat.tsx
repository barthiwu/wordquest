import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { WordDuelChatMessage } from '@/services/wordDuel';
import { ReportButton } from './ReportButton';

export const DUEL_CHAT_MAX_LENGTH = 200;

/** Preset one-tap messages (keys under wordDuel:chatQuick*). */
const QUICK_KEYS = [
  'chatQuickGoodLuck',
  'chatQuickNiceOne',
  'chatQuickClose',
  'chatQuickGg',
] as const;

export interface DuelChatProps {
  colors: ThemeColors;
  messages: WordDuelChatMessage[];
  opponentName: string;
  open: boolean;
  onToggle: () => void;
  /** Unread messages from the opponent while the panel was closed. */
  unread: number;
  /** Resolves when the message was accepted; rejects with a player-safe Error message when not. */
  onSend: (body: string) => Promise<void>;
  /** Opens the opponent's profile / add friend / block menu. */
  onOpponentMenu?: () => void;
  /** The server stopped chat for this pair (a block): hide the composer. */
  unavailable?: boolean;
}

/**
 * A small collapsible chat for the two players of a Word Duel. Closed it is
 * one slim row with an unread badge so it never gets in the way of the
 * duel; open it shows the conversation, four one-tap phrases, and a text
 * box. Messages from the opponent carry a flag to report them, and the
 * opponent's name opens the menu where they can be blocked.
 */
export function DuelChat({
  colors,
  messages,
  opponentName,
  open,
  onToggle,
  unread,
  onSend,
  onOpponentMenu,
  unavailable = false,
}: DuelChatProps) {
  const { t } = useTranslation(['wordDuel']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (open) listRef.current?.scrollToEnd({ animated: true });
  }, [open, messages.length]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('wordDuel:chatSendFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('wordDuel:chatToggle', { name: opponentName })}
      >
        <Ionicons name="chatbubbles-outline" size={18} color={colors.arcaneSoft} />
        <Text style={styles.headerTitle}>{t('wordDuel:chatTitle')}</Text>
        {unread > 0 && !open && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
        <View style={styles.flex} />
        <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={18} color={colors.inkMuted} />
      </Pressable>

      {open && (
        <View style={styles.body}>
          {onOpponentMenu && (
            <Pressable
              onPress={onOpponentMenu}
              style={styles.opponentRow}
              accessibilityRole="button"
              accessibilityLabel={t('wordDuel:chatOpponentMenu', { name: opponentName })}
            >
              <Text style={styles.opponentRowText}>
                {t('wordDuel:chatWith', { name: opponentName })}
              </Text>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.inkMuted} />
            </Pressable>
          )}

          <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent}>
            {messages.length === 0 ? (
              <Text style={styles.empty}>{t('wordDuel:chatEmpty')}</Text>
            ) : (
              messages.map((m) => (
                <View key={m.id} style={[styles.row, m.mine && styles.rowMine]}>
                  <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, m.mine && { color: colors.ink }]}>
                      {m.body}
                    </Text>
                  </View>
                  {!m.mine && (
                    <ReportButton
                      targetType="WORD_DUEL_MESSAGE"
                      targetId={m.id}
                      label={t('wordDuel:chatReportLabel')}
                    />
                  )}
                </View>
              ))
            )}
          </ScrollView>

          {unavailable ? (
            <Text style={styles.notice}>{t('wordDuel:chatUnavailable')}</Text>
          ) : (
            <>
              <View style={styles.quickRow}>
                {QUICK_KEYS.map((key) => (
                  <Pressable
                    key={key}
                    style={styles.quickChip}
                    onPress={() => void send(t(`wordDuel:${key}`))}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel={t(`wordDuel:${key}`)}
                  >
                    <Text style={styles.quickChipText}>{t(`wordDuel:${key}`)}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.composer}>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={(v) => {
                    setDraft(v);
                    if (error) setError(null);
                  }}
                  placeholder={t('wordDuel:chatPlaceholder')}
                  placeholderTextColor={colors.inkMuted}
                  maxLength={DUEL_CHAT_MAX_LENGTH}
                  editable={!sending}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onSubmitEditing={() => void send(draft)}
                  accessibilityLabel={t('wordDuel:chatPlaceholder')}
                />
                <Pressable
                  style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
                  onPress={() => void send(draft)}
                  disabled={!draft.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel={t('wordDuel:chatSend')}
                >
                  {sending ? (
                    <ActivityIndicator color={colors.ink} size="small" />
                  ) : (
                    <Ionicons name="send" size={16} color={colors.ink} />
                  )}
                </Pressable>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
              <Text style={styles.rules}>{t('wordDuel:chatRules')}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    headerTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
    opponentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
    opponentRowText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    list: { maxHeight: 180 },
    listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
    empty: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    rowMine: { justifyContent: 'flex-end' },
    bubble: {
      maxWidth: '82%',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    bubbleMine: { backgroundColor: colors.arcane },
    bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    bubbleText: { color: colors.ink, fontSize: typography.scale.sm },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    quickChip: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    quickChipText: { color: colors.arcaneSoft, fontSize: typography.scale.xs, fontWeight: '700' },
    composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    input: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
      fontSize: typography.scale.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    sendButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.arcane,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.4 },
    error: { color: colors.danger, fontSize: typography.scale.xs },
    notice: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    rules: { color: colors.inkMuted, fontSize: 11, textAlign: 'center' },
  });
}
