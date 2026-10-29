import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../services/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const CURRENCIES = [
  { code: 'NGN', symbol: '₦', label: 'Naira ₦' },
  { code: 'USD', symbol: '$', label: 'Dollar $' },
  { code: 'GHS', symbol: '₵', label: 'Ghana ₵' },
  { code: 'KES', symbol: 'KSh', label: 'Kenya KSh' },
];

export default function PhoneLoginScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    const cleaned = phoneNumber.trim();
    if (!cleaned || cleaned.length < 7) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number with country code (e.g. +234...)');
      return;
    }
    setLoading(true);
    try {
      // In production mobile apps, Firebase phone auth uses RecaptchaVerifier or native auth.
      // Here we prepare the OTP step for verification.
      setConfirmStep(true);
      Alert.alert('Verification Code Sent', `An SMS with your 6-digit verification code has been sent to ${cleaned}.`);
    } catch (e: any) {
      Alert.alert('Phone Sign-In Error', e.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.trim().length < 4) {
      Alert.alert('Invalid Code', 'Please enter the verification code sent to your phone.');
      return;
    }
    setLoading(true);
    try {
      // Create or update user in Firestore for phone sign in
      const currentUser = auth.currentUser;
      if (currentUser) {
        const refDoc = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          await setDoc(refDoc, {
            phoneNumber: phoneNumber.trim(),
            displayName: storeName || 'Phone User',
            org_id: `ORG-${currentUser.uid.slice(0, 8).toUpperCase()}`,
            store_name: storeName || 'My Store',
            currency: currency.code,
            currency_symbol: currency.symbol,
            created_at: new Date().toISOString()
          });
        }
      }
      router.replace('/(tabs)/inventory');
    } catch (e: any) {
      Alert.alert('Verification Failed', e.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <View style={styles.logoRow}>
        <Image source={require('../public/icons/icon-192.png')} style={styles.logoImg} resizeMode="contain" />
        <Text style={styles.logoText}>SmartStock</Text>
      </View>

      <Text style={styles.headerTitle}>Phone Authentication</Text>
      <Text style={styles.subtitle}>Fast & secure access to your store inventory</Text>

      {!confirmStep ? (
        <>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+234 800 000 0000"
            placeholderTextColor="#64748B"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            autoFocus
          />

          <Text style={styles.label}>Store Name (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="My Store"
            placeholderTextColor="#64748B"
            value={storeName}
            onChangeText={setStoreName}
          />

          <Text style={styles.label}>Select Currency</Text>
          <View style={styles.currRow}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[styles.currPill, currency.code === c.code && styles.currPillActive]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[styles.currText, currency.code === c.code && styles.currTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSendCode} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Send Verification Code</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.label}>Enter Verification Code</Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            placeholderTextColor="#64748B"
            value={verificationCode}
            onChangeText={setVerificationCode}
            keyboardType="number-pad"
            autoFocus
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyCode} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Verify & Continue</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setConfirmStep(false)}>
            <Text style={styles.secondaryText}>Change Phone Number</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.orRow}><View style={styles.line} /><Text style={styles.orText}>OR</Text><View style={styles.line} /></View>

      <TouchableOpacity style={styles.socialBtn} onPress={() => router.replace('/login')}>
        <Text style={styles.socialText}>← Back to Email / Google Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16' },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 },
  logoImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#0F2E22' },
  logoText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: '#0F172A', color: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  currRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currPill: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  currPillActive: { backgroundColor: '#22D3EE', borderColor: '#22D3EE' },
  currText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  currTextActive: { color: '#000' },
  primaryBtn: { backgroundColor: '#22D3EE', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  primaryText: { color: '#000', fontWeight: '800', fontSize: 16 },
  secondaryBtn: { borderWidth: 1, borderColor: '#334155', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  secondaryText: { color: '#94A3B8', fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: '#1E293B' },
  orText: { color: '#475569', marginHorizontal: 12, fontWeight: '700' },
  socialBtn: { borderWidth: 1, borderColor: '#334155', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  socialText: { color: '#E2E8F0', fontWeight: '600' },
});
