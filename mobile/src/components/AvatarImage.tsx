import { useEffect, useState, type ReactNode } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

interface Props {
  uri: string;
  style: StyleProp<ImageStyle>;
  /** Shown instead when the picture can't be loaded (expired link, offline). */
  fallback: ReactNode;
  /** Called once per failed link, e.g. to fetch a fresh one. */
  onFail?: () => void;
}

/** A profile picture that falls back to `fallback` rather than an empty circle. */
export function AvatarImage({ uri, style, fallback, onFail }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => setFailedUri(null), [uri]);
  if (failedUri === uri) return <>{fallback}</>;
  return (
    <Image
      source={{ uri }}
      style={style}
      onError={() => {
        setFailedUri(uri);
        onFail?.();
      }}
    />
  );
}
