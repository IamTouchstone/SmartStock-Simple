import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDouC2zVQ3lRDONRJJFootUbKVU9YKiJ0g",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "smartstock-424c3.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "smartstock-424c3",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "smartstock-424c3.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "283866117860",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:283866117860:web:14d344ed21d7d2a4d6def1",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-K4PKPPESB2"
};

let app;
try {
  console.log('[Firebase] Initializing Firebase app with projectId:', firebaseConfig.projectId);
  if (getApps().length > 0) {
    app = getApp();
    console.log('[Firebase] Using existing Firebase app instance');
  } else {
    app = initializeApp(firebaseConfig);
    console.log('[Firebase] Firebase app initialized successfully');
  }
} catch (e) {
  console.error('[Firebase] Error initializing Firebase app:', e);
  app = getApps()[0] || initializeApp(firebaseConfig);
}

let auth;
try {
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  console.log('[Firebase] Auth initialized with AsyncStorage persistence');
} catch (e) {
  console.warn('[Firebase] Warning initializing auth persistence, falling back to getAuth:', e?.message || e);
  try {
    auth = getAuth(app);
  } catch (err) {
    console.error('[Firebase] Error in getAuth fallback:', err);
  }
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export { auth };
export default app;
