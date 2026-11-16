import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { bindAppFocus, createQueryClient } from '@/lib/queryClient';
import { configureNotifications } from '@/push/push';
import { ToastProvider } from '@/ui/Toast';
import { useStackOptions } from '@/ui/navigation';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void configureNotifications().catch(() => undefined);

function RootStack() {
  const { status } = useAuth();
  const options = useStackOptions();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  if (status === 'loading') return null;
  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={options}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => bindAppFocus(), []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <RootStack />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
