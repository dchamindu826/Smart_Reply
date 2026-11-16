import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { conversationIdOf, registerForPush } from './push';

/** Registers the device once per sign-in and opens the chat when a notification is tapped. */
export function usePushNotifications(enabled: boolean): void {
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    void registerForPush().catch(() => undefined);

    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const conversationId = conversationIdOf(response.notification.request.content.data);
      if (conversationId) router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
    };

    // A tap that launched the app from closed.
    void Notifications.getLastNotificationResponseAsync().then(r => {
      if (r) open(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [enabled, router]);
}
