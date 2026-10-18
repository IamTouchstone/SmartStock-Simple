import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyDouC2zVQ3lRDONRJJFootUbKVU9YkiJ0g",
  authDomain: "smartstock-424c3.firebaseapp.com",
  projectId: "smartstock-424c3",
  storageBucket: "smartstock-424c3.firebasestorage.app",
  messagingSenderId: "283866117860",
  appId: "1:283866117860:web:14d344ed21d7d2a4d6def1",
  measurementId: "G-K4PKPPESB2"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export default app;