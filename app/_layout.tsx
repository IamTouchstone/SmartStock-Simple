import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import app, { auth } from '../firebaseConfig';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const authCheckedRef = useRef(false);

  useEffect(() => {
    // Immediately hide native splash so splash never blocks on network/Firebase
    SplashScreen.hideAsync().catch(() => {});

    console.log('[RootLayout] Firebase app loaded, initializing auth listener...');
    let unsub = () => {};

    try {
      if (!auth) {
        throw new Error('Firebase Auth instance is not available');
      }
      unsub = onAuthStateChanged(
        auth,
        (user) => {
          console.log('[RootLayout] onAuthStateChanged fired, loggedIn:', !!user);
          authCheckedRef.current = true;
          setIsLoggedIn(!!user);
        },
        (error) => {
          console.error('[RootLayout] onAuthStateChanged error:', error);
          authCheckedRef.current = true;
          setIsLoggedIn(false);
        }
      );
    } catch (e) {
      console.error('[RootLayout] Failed to subscribe to onAuthStateChanged:', e);
      authCheckedRef.current = true;
      setIsLoggedIn(false);
    }

    // Safety timeout: if auth hasn't responded in 3.5s, don't trap the user
    const timer = setTimeout(() => {
      if (!authCheckedRef.current) {
        console.warn('[RootLayout] Auth check timed out after 3.5s, defaulting to loggedOut');
        authCheckedRef.current = true;
        setIsLoggedIn(false);
      }
    }, 3500);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (isLoggedIn === null) return;
    const currentRoute = segments[0] || 'index';
    const isAuthRoute = currentRoute === 'phone-login' || currentRoute === 'register';

    console.log(`[RootLayout] Routing check: route=${currentRoute}, loggedIn=${isLoggedIn}`);

    if (!isLoggedIn && !isAuthRoute) {
      router.replace('/phone-login');
    } else if (isLoggedIn && (isAuthRoute || currentRoute === 'index')) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isLoggedIn, segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack id="root" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="phone-login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
