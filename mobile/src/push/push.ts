import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { readSecure, writeSecure } from '@/lib/storage';

const DEVICE_KEY = 'sr.device';

/** The chat on screen right now; its notifications are not shown as banners. */
let openConversationId: string | null = null;
export function setOpenConversation(id: string | null): void {
  openConversationId = id;
}

export function conversationIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const v = (data as Record<string, unknown>).conversationId;
  return typeof v === 'string' && v ? v : null;
}

let configured = false;
/** Foreground behaviour and Android channels. Safe to call more than once. */
export async function configureNotifications(): Promise<void> {
  if (configured || Platform.OS === 'web') return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async n => {
      const inOpenChat = openConversationId !== null && conversationIdOf(n.request.content.data) === openConversationId;
      return { shouldShowBanner: !inOpenChat, shouldShowList: true, shouldPlaySound: !inOpenChat, shouldSetBadge: true };
    }
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      description: 'New messages and chats assigned to you',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#0F9D58'
    });
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      description: 'Incoming customer calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 800, 600, 800, 600, 800],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false
    });
  }
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/** Asks for permission, gets the Expo push token and registers it with `POST /me/devices`. */
export async function registerForPush(): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Push is not available on the web.' };
  await configureNotifications();
  if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a real phone.' };
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { ok: false, reason: 'Push notifications need an EAS build; Expo Go does not receive them on Android.' };
  }
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { ok: false, reason: 'Notifications are turned off for Smart Reply.' };
  const pid = projectId();
  if (!pid) return { ok: false, reason: 'This build has no EAS project id, so it cannot receive push notifications.' };
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
  const res = await api.post<{ id: string }>('/me/devices', { platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken });
  if (res?.id) await writeSecure(DEVICE_KEY, res.id);
  return { ok: true };
}

/** Stops push to this phone. Called before signing out. */
export async function unregisterPush(): Promise<void> {
  const id = await readSecure(DEVICE_KEY);
  await writeSecure(DEVICE_KEY, null);
  if (id) await api.del<void>(`/me/devices/${id}`);
  if (Platform.OS !== 'web') await Notifications.setBadgeCountAsync(0).catch(() => false);
}
