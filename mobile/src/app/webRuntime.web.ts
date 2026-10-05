/**
 * Web only. Installs Metro's on-demand code loader. Without it every lazy
 * `import()` in the web build fails at once (no "__loadBundleAsync"),
 * which broke Google/Facebook sign-in and the profile fetch after a reload.
 * Imported first thing in App.tsx; the native twin (webRuntime.ts) is empty.
 */
import '@expo/metro-runtime';
