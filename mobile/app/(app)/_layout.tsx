import { Stack } from 'expo-router';
import { CallProvider } from '@/calls/CallProvider';
import { usePushNotifications } from '@/push/usePush';
import { SocketProvider } from '@/realtime/SocketProvider';
import { useStackOptions } from '@/ui/navigation';

function SignedInStack() {
  usePushNotifications(true);
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: '' }} />
      <Stack.Screen name="contact/[id]" options={{ title: 'Customer' }} />
      <Stack.Screen name="contact/new" options={{ title: 'New customer', presentation: 'modal' }} />
      <Stack.Screen name="template" options={{ title: 'Send template', presentation: 'modal' }} />
      <Stack.Screen name="schedule-call" options={{ title: 'Schedule a call', presentation: 'modal' }} />
      <Stack.Screen name="me/status" options={{ title: 'My status' }} />
      <Stack.Screen name="me/breaks" options={{ title: 'My breaks' }} />
      <Stack.Screen name="me/performance" options={{ title: 'My performance' }} />
      <Stack.Screen name="me/profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="me/password" options={{ title: 'Change password' }} />
      <Stack.Screen name="me/team" options={{ title: 'Team' }} />
    </Stack>
  );
}

export default function SignedInLayout() {
  return (
    <SocketProvider enabled>
      <CallProvider>
        <SignedInStack />
      </CallProvider>
    </SocketProvider>
  );
}
