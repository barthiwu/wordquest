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
import { QUICK_CHAT, quickChatEmoji, type ChatInput, type ChatMessage } from '@/services/quickChat';
import type { ReportTargetType } from '@/services/reports';
import { ReportButton } from './ReportButton';

export const DUEL_CHAT_MAX_LENGTH = 200;

export interface DuelChatProps {
  colors: ThemeColors;
  messages: ChatMessage[];
  opponentName: string;
  open: boolean;
  onToggle: () => void;
  /** Unread messages from the opponent while the panel was closed. */
  unread: number;
  /** Resolves when the message was accepted; rejects with a player-safe Error message when not. */
  onSend: (input: ChatInput) => Promise<void>;
  /** Opens the opponent's profile / add friend / block menu. */
  onOpponentMenu?: () => void;
  /** The server stopped chat for this pair (a block): hide the composer. */
  unavailable?: boolean;
  /** Typed chat is allowed (false against strangers: quick chat only). Default true. */
  canType?: boolean;
  /** Quick (emoji) chat is allowed. Default true. */
  canQuick?: boolean;
  /** What a report on one of the opponent's messages is filed against. */
  reportTargetType?: ReportTargetType;
}

type Tab = 'chat' | 'quick';

/**
 * A small collapsible chat for the two players of a Word Duel or a
 * head-to-head challenge. Closed it is one slim row with an unread badge so
 * it never gets in the way of the game; open it has two sides: "Chat" (the
 * conversation and a text box) and "Quick" (a grid of one-tap emoji
 * reactions). Against strangers only the Quick side is offered. Messages from
 * the opponent carry a flag to report them, and the opponent's name opens the
 * menu where they can be blocked.
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
  canType = true,
  canQuick = true,
  reportTargetType = 'WORD_DUEL_MESSAGE',
}: DuelChatProps) {
  const { t } = useTranslation(['wordDuel', 'arcade']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  // Messages this player reported: gone from their screen straight away.
  const [reportedIds, setReportedIds] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (open) listRef.current?.scrollToEnd({ animated: true });
  }, [open, messages.length]);

  // Quick-only chat (a stranger): the quick side is the only side.
  const activeTab: Tab = !canType ? 'quick' : !canQuick ? 'chat' : tab;

  const send = async (input: ChatInput) => {
    const isQuick = 'quick' in input;
    const body = isQuick ? input.quick : input.body.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(isQuick ? { quick: body } : { body });
      if (!isQuick) setDraft('');
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
              messages
                .filter((m) => !reportedIds.has(m.id))
                .map((m) => (
                  <View key={m.id} style={[styles.row, m.mine && styles.rowMine]}>
                    <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {m.kind === 'QUICK' ? (
                        <View style={styles.quickBubble}>
                          <Text style={styles.quickBubbleEmoji}>{quickChatEmoji(m.body)}</Text>
                          <Text style={[styles.quickBubbleLabel, m.mine && { color: colors.ink }]}>
                            {t(`arcade:chat.quick.${m.body}`, { defaultValue: '' })}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.bubbleText, m.mine && { color: colors.ink }]}>
                          {m.body}
                        </Text>
                      )}
                    </View>
                    {!m.mine && (
                      <ReportButton
                        targetType={reportTargetType}
                        targetId={m.id}
                        label={t('wordDuel:chatReportLabel')}
                        variant="chat"
                        onReported={() => setReportedIds((prev) => new Set(prev).add(m.id))}
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
              {canType && canQuick && (
                <View style={styles.tabs} accessibilityRole="tablist">
                  {(['chat', 'quick'] as const).map((id) => (
                    <Pressable
                      key={id}
                      style={[styles.tab, activeTab === id && styles.tabActive]}
                      onPress={() => setTab(id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: activeTab === id }}
                      accessibilityLabel={t(`arcade:chat.tab.${id}`)}
                    >
                      <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
                        {id === 'quick' ? '😀 ' : ''}
                        {t(`arcade:chat.tab.${id}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {activeTab === 'quick' && canQuick && (
                <View style={styles.quickGrid}>
                  {QUICK_CHAT.map((q) => (
                    <Pressable
                      key={q.code}
                      style={styles.quickCell}
                      onPress={() => void send({ quick: q.code })}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={t(`arcade:chat.quick.${q.code}`)}
                    >
                      <Text style={styles.quickCellEmoji}>{q.emoji}</Text>
                      <Text style={styles.quickCellLabel} numberOfLines={1}>
                        {t(`arcade:chat.quick.${q.code}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {activeTab === 'chat' && canType && (
                <>
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
                      onSubmitEditing={() => void send({ body: draft })}
                      accessibilityLabel={t('wordDuel:chatPlaceholder')}
                    />
                    <Pressable
                      style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
                      onPress={() => void send({ body: draft })}
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
                  <Text style={styles.rules}>{t('wordDuel:chatRules')}</Text>
                </>
              )}
              {!canType && <Text style={styles.rules}>{t('arcade:chat.quickOnly')}</Text>}
              {error && <Text style={styles.error}>{error}</Text>}
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
    tabs: { flexDirection: 'row', gap: spacing.xs },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    tabText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    tabTextActive: { color: colors.ink },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    quickCell: {
      width: '18.4%',
      minWidth: 52,
      flexGrow: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 6,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    quickCellEmoji: { fontSize: 24 },
    quickCellLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
    quickBubble: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    quickBubbleEmoji: { fontSize: 26 },
    quickBubbleLabel: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
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
