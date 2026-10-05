import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm and notice. react-native-web's Alert.alert is an
 * empty function, so on the web build every confirmation built on it
 * (Delete account, Block, Unfriend, report sent) silently did nothing. The
 * web falls back to the browser's own confirm/alert dialogs.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  destructive = true,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return Promise.resolve(false);
    }
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
