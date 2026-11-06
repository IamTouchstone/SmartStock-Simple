import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getAuthSession } from '../services/inventoryService';
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // ✅ FIXED: Check real session before deciding where to go
        const { user } = await getAuthSession();
        setIsLoggedIn(!!user);
      } catch {
        setIsLoggedIn(false);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const inTabs = segments[0] === '(tabs)';
    // Not logged in + trying to go to tabs -> send to login
    if (!isLoggedIn && inTabs) {
      router.replace('/login');
    }
    // Logged in + on index/login -> send to dashboard
    if (isLoggedIn && !inTabs && (segments[0] === 'login' || segments[0] === 'index' || segments[0] === undefined)) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isReady, isLoggedIn, segments, router]);

  if (!isReady) return null;

  return (
    <SafeAreaProvider>
      <>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="phone-login" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </>
    </SafeAreaProvider>
  );
}