import { useTheme } from './theme';

/** Shared header look: brand-dark bar with white text, like the web app's top bar. */
export function useStackOptions() {
  const t = useTheme();
  return {
    headerStyle: { backgroundColor: t.header },
    headerTintColor: t.onHeader,
    headerTitleStyle: { fontWeight: '700' as const },
    contentStyle: { backgroundColor: t.bg },
    headerBackButtonDisplayMode: 'minimal' as const
  };
}
