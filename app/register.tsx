import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleRegister = async () => {
    if (!orgName.trim()) return Alert.alert('Missing', 'Enter your shop / business name.');
    if (!fullName.trim()) return Alert.alert('Missing', 'Enter your full name.');
    if (!email.trim() || !email.includes('@')) return Alert.alert('Missing', 'Enter a valid email.');
    if (!phone.trim()) return Alert.alert('Phone required', 'Enter your WhatsApp number e.g. +234 801 234 5678');
    if (phone.replace(/[^0-9+]/g, '').length < 10) return Alert.alert('Phone required', 'Enter a valid WhatsApp number.');
    if (!password || password.length < 6) return Alert.alert('Missing', 'Password must be at least 6 characters.');
    if (password !== confirm) return Alert.alert('Mismatch', 'Passwords do not match.');

    setSaving(true);
    try {
      const cleanPhone = phone.trim();
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const uid = cred.user.uid;
      const org_id = `ORG-${uid.slice(0, 6).toUpperCase()}`;

      // Save with ALL field names so old code finds it
      await setDoc(doc(db, 'users', uid), {
        uid,
        org_id,
        org_name: orgName.trim(),
        name: fullName.trim(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        phone_number: cleanPhone,
        phoneNumber: cleanPhone,
        whatsapp: cleanPhone,
        role: 'Owner',
        currency_symbol: '₦',
        created_at: new Date().toISOString(),
      });

      Alert.alert('Success', 'Account created! Please log in.', [
        { text: 'Go to Login', onPress: () => router.replace('/login') }
      ]);
    } catch (e: any) {
      let msg = e.message;
      if (e.code === 'auth/email-already-in-use') msg = 'This email is already registered. Please log in.';
      Alert.alert('Register failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
      <View style={styles.header}>
        <View style={styles.logo}><Ionicons name="cube-outline" size={30} color="#FDF6E9" /></View>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.sub}>Start managing your shop with SmartStock</Text>
      </View>

      <Text style={styles.label}>SHOP / BUSINESS NAME *</Text>
      <TextInput value={orgName} onChangeText={setOrgName} placeholder="e.g. TM Supermarket" placeholderTextColor="#8AA99B" style={styles.input} />

      <Text style={styles.label}>YOUR FULL NAME *</Text>
      <TextInput value={fullName} onChangeText={setFullName} placeholder="e.g. Tobi Martins" placeholderTextColor="#8AA99B" style={styles.input} />

      <Text style={styles.label}>EMAIL *</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor="#8AA99B" style={styles.input} keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.label}>WHATSAPP / PHONE NUMBER *</Text>
      <TextInput value={phone} onChangeText={setPhone} placeholder="+234 801 234 5678" placeholderTextColor="#8AA99B" style={styles.input} keyboardType="phone-pad" />
      <Text style={styles.hint}>Required - used for WhatsApp alerts. This fixes the "No phone" popup.</Text>

      <Text style={styles.label}>PASSWORD *</Text>
      <View style={[styles.input, styles.passRow]}>
        <TextInput value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor="#8AA99B" style={{ flex: 1, color: '#fff' }} secureTextEntry={!showPass} />
        <TouchableOpacity onPress={() => setShowPass(!showPass)}><Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8AA99B" /></TouchableOpacity>
      </View>

      <Text style={styles.label}>CONFIRM PASSWORD *</Text>
      <TextInput value={confirm} onChangeText={setConfirm} placeholder="Repeat password" placeholderTextColor="#8AA99B" style={styles.input} secureTextEntry={!showPass} />

      <TouchableOpacity onPress={handleRegister} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
        {saving ? <ActivityIndicator color="#0B3B2E" /> : <Text style={styles.saveText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')} style={{ alignItems: 'center', marginTop: 18 }}>
        <Text style={{ color: '#8AA99B' }}>Already have an account? <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>Log In</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  header: { alignItems: 'center', marginVertical: 20 },
  logo: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A4A3E' },
  title: { color: '#FDF6E9', fontSize: 24, fontWeight: '800', marginTop: 12 },
  sub: { color: '#8AA99B', fontSize: 13, marginTop: 4, textAlign: 'center' },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: '#1E3A30', color: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E' },
  passRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { color: '#8AA99B', fontSize: 11, marginTop: 6, lineHeight: 16 },
  saveBtn: { backgroundColor: '#FDF6E9', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#0B3B2E', fontWeight: '800', fontSize: 16 },
});