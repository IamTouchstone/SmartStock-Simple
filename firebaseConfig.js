// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA4ErNyQ6L6gexLHi80wF8tsVMg-ZOdcHU",
  authDomain: "smartstock-11549.firebaseapp.com",
  projectId: "smartstock-11549",
  storageBucket: "smartstock-11549.firebasestorage.app",
  messagingSenderId: "249981475952",
  appId: "1:249981475952:web:2dc7d616440eaa9a7ae8b5",
  measurementId: "G-HEMML4KP5X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Initialize Auth safely (prevent errors during Expo hot-reloads)
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  // If it's already initialized during a hot reload, just get the existing instance
  if (error.code === 'auth/already-initialized') {
    authInstance = getAuth(app);
  } else {
    console.error("Auth initialization error:", error);
  }
}
export const auth = authInstance;



export default app;
