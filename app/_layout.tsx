import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
      if (!isReady) {
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    });
    // Timeout fallback in case Firebase is slow
    const timer = setTimeout(() => {
      if (!isReady) {
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 4000);
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!isReady || isLoggedIn === null) return;
    const inTabs = segments[0] === '(tabs)';
    if (!isLoggedIn && inTabs) {
      router.replace('/phone-login');
    }
    if (isLoggedIn && !inTabs) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isReady, isLoggedIn, segments]);

  if (!isReady) return null;

  return (
    <SafeAreaProvider>
      <>
        <StatusBar style="light" />
        <Stack id="root" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="phone-login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </>
    </SafeAreaProvider>
  );
}
