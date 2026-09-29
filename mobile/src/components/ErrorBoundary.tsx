import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { trackEvent } from '@/services/analyticsClient';
import { colors, typography, spacing, radius } from '@/constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-wide render-crash boundary (Telemetry spec Phase 3, generic error
 * tracking) — wraps everything in App.tsx, outside AppProviders, so it
 * catches a crash anywhere in the tree, including inside a provider's own
 * setup. Fires SCREEN_ERROR once per crash via trackEvent(), which is a
 * plain module function backed by zustand stores (not a hook/context), so
 * it works here with no dependency on anything this boundary itself might
 * be catching a crash from.
 *
 * Deliberately does NOT use i18n (useTranslation) in its fallback UI: this
 * is the one screen in the app that must keep rendering even if something
 * upstream (including, in the worst case, i18n initialization itself) is
 * broken. Plain hard-coded English text is the more robust choice here
 * than adding another dependency to the one path that must never itself
 * throw.
 *
 * React error boundaries only catch errors during rendering, in
 * lifecycle methods, and in constructors of the tree below them — not
 * inside event handlers or async code (that's what API_ERROR/
 * GAMEPLAY_ERROR cover instead).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    trackEvent('SCREEN_ERROR', {
      message: error.message?.slice(0, 1000),
      stack: error.stack?.slice(0, 1000),
      componentStack: errorInfo.componentStack?.slice(0, 1000),
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          WordQuest hit an unexpected error. Try again — your progress is saved on the server, not
          on this screen.
        </Text>
        <Pressable
          style={styles.button}
          onPress={this.handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontFamily: typography.display.fontFamily,
    fontWeight: typography.display.weight,
    fontSize: typography.scale.xl,
    color: colors.ink,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  message: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.scale.md,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.arcane,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  buttonText: {
    fontFamily: typography.body.fontFamily,
    fontWeight: '700',
    fontSize: typography.scale.md,
    color: colors.ink,
  },
});
