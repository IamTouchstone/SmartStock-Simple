import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { getAuthSession, saveAuthSession } from '../services/inventoryService';

export default function EntryScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!isMounted) return;

        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          let profile = null;

          try {
            const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userSnap.exists()) {
              profile = userSnap.data();
            }
          } catch (docErr) {
            console.warn('[Entry] Could not fetch Firestore user doc:', docErr);
          }

          const fallbackSession = await getAuthSession();
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: profile?.name || fallbackSession.user?.name || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User'),
            role: profile?.role || fallbackSession.user?.role || 'Owner',
            org_id: profile?.org_id || fallbackSession.user?.org_id || `ORG-${firebaseUser.uid.slice(0, 6)}`,
            org_name: profile?.org_name || fallbackSession.user?.org_name || 'SmartStock Retail',
            currency: profile?.currency || fallbackSession.user?.currency || 'USD',
            currency_symbol: profile?.currency_symbol || fallbackSession.user?.currency_symbol || '$',
            emailVerified: firebaseUser.emailVerified
          };

          await saveAuthSession(idToken, userData);
          if (isMounted) {
            router.replace('/(tabs)/dashboard');
          }
        } else {
          // If no firebaseUser, check if valid stored session exists
          const session = await getAuthSession();
          if (session.user && session.token) {
            if (isMounted) {
              router.replace('/(tabs)/dashboard');
            }
          } else {
            if (isMounted) {
              router.replace('/login');
            }
          }
        }
      } catch (err) {
        console.error('[Entry] Auth validation error:', err);
        if (isMounted) {
          router.replace('/login');
        }
      } finally {
        if (isMounted) setChecking(false);
      }
    });

    const fallbackTimeout = setTimeout(async () => {
      if (!isMounted) return;
      const session = await getAuthSession();
      if (session.user) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    }, 2500);

    return () => {
      isMounted = false;
      unsub();
      clearTimeout(fallbackTimeout);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../public/icons/icon-192.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>SmartStock</Text>
      <Text style={styles.subtitle}>Version 1.0.1</Text>
      <ActivityIndicator size="large" color="#64ffda" style={styles.spinner} />
      <Text style={styles.checkingText}>Verifying secure session...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 20,
    marginBottom: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 28,
  },
  spinner: {
    marginBottom: 12,
  },
  checkingText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
});
