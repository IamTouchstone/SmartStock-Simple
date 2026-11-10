import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { saveAuthSession } from '../services/inventoryService';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Missing', 'Enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Missing', 'Enter your password (at least 6 characters).');
      return;
    }
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const uid = cred.user.uid;

      let profile: any = null;
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) profile = snap.data();
      } catch (e) {
        console.warn('Could not fetch user profile:', e);
      }

      const org_id = profile?.org_id || `ORG-${uid.slice(0, 6).toUpperCase()}`;
      const userData = {
        uid,
        email: cred.user.email,
        name: profile?.fullName || profile?.name || cred.user.displayName || cleanEmail.split('@')[0],
        fullName: profile?.fullName || profile?.name || '',
        role: profile?.role || 'Owner',
        org_id: org_id.toUpperCase(),
        org_name: profile?.org_name || '',
        phone: profile?.phone || '',
        currency: profile?.currency || 'NGN',
        currency_symbol: profile?.currency_symbol || '₦',
        emailVerified: cred.user.emailVerified,
      };

      const idToken = await cred.user.getIdToken();
      await saveAuthSession(idToken, userData);
      // _layout.tsx onAuthStateChanged will redirect to dashboard
    } catch (e: any) {
      let msg = e.message || 'Login failed.';
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        msg = 'Email or password is incorrect. Please try again.';
      } else if (e.code === 'auth/invalid-email') {
        msg = 'Enter a valid email address.';
      } else if (e.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please wait a few minutes and try again.';
      }
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Enter Email', 'Type your email address first, then tap Forgot Password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      Alert.alert('Email Sent', `Password reset link sent to ${email.trim()}. Check your inbox.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not send reset email.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            <Ionicons name="cube-outline" size={32} color="#FDF6E9" />
          </View>
          <Text style={styles.title}>SmartStock</Text>
          <Text style={styles.sub}>Log in to manage your inventory</Text>
        </View>

        <Text style={styles.label}>EMAIL *</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@email.com"
          placeholderTextColor="#8AA99B"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>PASSWORD *</Text>
        <View style={[styles.input, styles.passRow]}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor="#8AA99B"
            style={{ flex: 1, color: '#fff', fontSize: 15 }}
            secureTextEntry={!showPass}
          />
          <TouchableOpacity onPress={() => setShowPass(!showPass)}>
            <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8AA99B" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleForgotPassword} style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Text style={{ color: '#8AA99B', fontSize: 13 }}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          style={[styles.loginBtn, loading && { opacity: 0.6 }]}
        >
          {loading
            ? <ActivityIndicator color="#0B3B2E" />
            : <Text style={styles.loginText}>Log In</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              'Phone Verification Notice',
              'Phone verification unavailable - verify by email link.',
              [
                { text: 'Verify by Email Link', onPress: handleForgotPassword },
                { text: 'OK', style: 'default' }
              ]
            );
          }}
          style={{ alignItems: 'center', marginTop: 16 }}
        >
          <Text style={{ color: '#8AA99B', fontSize: 13, textDecorationLine: 'underline' }}>
            Looking for Phone SMS OTP?
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/register')} style={{ alignItems: 'center', marginTop: 20 }}>
          <Text style={{ color: '#8AA99B' }}>
            New to SmartStock?{' '}
            <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>Create Account</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  header: { alignItems: 'center', marginVertical: 32 },
  logoWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2A4A3E',
  },
  title: { color: '#FDF6E9', fontSize: 28, fontWeight: '800', marginTop: 14 },
  sub: { color: '#8AA99B', fontSize: 13, marginTop: 6, textAlign: 'center' },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 6, letterSpacing: 0.5 },
  input: {
    backgroundColor: '#1E3A30', color: '#fff', padding: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E', fontSize: 15,
  },
  passRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loginBtn: {
    backgroundColor: '#FDF6E9', padding: 16, borderRadius: 14,
    alignItems: 'center', marginTop: 28,
  },
  loginText: { color: '#0B3B2E', fontWeight: '800', fontSize: 16 },
});
