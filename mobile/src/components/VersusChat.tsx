import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { ApiError } from '@/services/apiClient';
import { getVersusChat, getVersusMatch, sendVersusChat } from '@/services/arcadeVersus';
import type { ChatInput, ChatMessage } from '@/services/quickChat';
import { DuelChat } from './DuelChat';

const POLL_OPEN_MS = 3000;
const POLL_CLOSED_MS = 6000;

/**
 * Chat with the opponent of a head-to-head challenge, shown under the
 * VersusBar while playing and under the result card afterwards. Between
 * friends it has typed chat and quick emoji chat; against a stranger from
 * the random queue, quick emoji chat only (the server decides which, and
 * this follows what it says). Renders nothing until the server says chat is
 * open for this match, so it never shows a dead box.
 */
export function VersusChat({ matchId }: { matchId: string }) {
  const colors = useThemeColors();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [canType, setCanType] = useState(false);
  const [canQuick, setCanQuick] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [blocked, setBlocked] = useState(false);
  const seqRef = useRef(0);
  const idsRef = useRef<Set<string>>(new Set());
  const openRef = useRef(false);
  openRef.current = open;
  const alive = useRef(true);

  const merge = useCallback((incoming: ChatMessage[]) => {
    const fresh = incoming.filter((m) => !idsRef.current.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) {
      idsRef.current.add(m.id);
      seqRef.current = Math.max(seqRef.current, m.seq);
    }
    setMessages((prev) => [...prev, ...fresh].sort((a, b) => a.seq - b.seq));
    if (!openRef.current) {
      const fromThem = fresh.filter((m) => !m.mine).length;
      if (fromThem > 0) setUnread((n) => n + fromThem);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!accessToken) return undefined;
    getVersusMatch(accessToken, matchId)
      .then((m) => alive.current && setOpponentName(m.opponent?.username ?? ''))
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [accessToken, matchId]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const list = await getVersusChat(accessToken, matchId, seqRef.current);
        if (!alive.current) return;
        merge(list.messages);
        setCanType(list.canType);
        setCanQuick(list.canQuick);
      } catch {
        // Offline or a blip: try again on the next tick.
      }
      if (alive.current) timer = setTimeout(tick, openRef.current ? POLL_OPEN_MS : POLL_CLOSED_MS);
    };
    void tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [accessToken, matchId, merge]);

  const onSend = async (input: ChatInput) => {
    if (!accessToken) return;
    try {
      merge([await sendVersusChat(accessToken, matchId, input)]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && 'quick' in input) setBlocked(true);
      throw new Error(err instanceof ApiError ? err.message : '');
    }
  };

  // Nothing to show until chat is open (or there is history to read).
  if (!canQuick && !canType && messages.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <DuelChat
        colors={colors}
        messages={messages}
        opponentName={opponentName}
        open={open}
        onToggle={() => {
          setOpen((o) => {
            if (!o) setUnread(0);
            return !o;
          });
        }}
        unread={unread}
        onSend={onSend}
        unavailable={blocked || (!canQuick && !canType)}
        canType={canType}
        canQuick={canQuick}
        reportTargetType="ARCADE_VERSUS_MESSAGE"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
});
