import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { ApiError } from './errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        }
      },
      mutations: { retry: false }
    }
  });
}

/** Refetch stale queries when the app comes back to the foreground. */
export function bindAppFocus(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const sub = AppState.addEventListener('change', s => focusManager.setFocused(s === 'active'));
  return () => sub.remove();
}
