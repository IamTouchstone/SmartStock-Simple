import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';

export default function IndexScreen() {
  const router = useRouter();
  const [takingLong, setTakingLong] = useState(false);
  const navigatedRef = useRef(false);

  const safeNavigate = (path: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace(path as any);
  };

  useEffect(() => {
    let unsub = () => {};

    try {
      if (auth) {
        unsub = onAuthStateChanged(
          auth,
          (user) => {
            if (user) {
              safeNavigate('/(tabs)/dashboard');
            } else {
              safeNavigate('/phone-login');
            }
          },
          (err) => {
            console.warn('[IndexScreen] Auth state error:', err);
            safeNavigate('/phone-login');
          }
        );
      } else {
        safeNavigate('/phone-login');
      }
    } catch (e) {
      console.warn('[IndexScreen] Failed to listen to auth:', e);
      safeNavigate('/phone-login');
    }

    // 5-second timeout: force navigate to /phone-login if still loading
    const timer = setTimeout(() => {
      setTakingLong(true);
      safeNavigate('/phone-login');
    }, 5000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FDF6E9" />
      {takingLong && (
        <View style={styles.fallbackBox}>
          <Text style={styles.fallbackText}>Taking too long to connect</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => router.replace('/phone-login')}
          >
            <Text style={styles.retryText}>Tap to continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F241D',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackBox: {
    marginTop: 24,
    alignItems: 'center',
  },
  fallbackText: {
    color: '#8AA99B',
    fontSize: 14,
    marginBottom: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#0B3B2E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A4A3E',
  },
  retryText: {
    color: '#FDF6E9',
    fontWeight: '700',
    fontSize: 15,
  },
});
