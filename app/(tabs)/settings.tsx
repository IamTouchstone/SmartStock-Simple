import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession, clearAuthSession } from '../../services/inventoryService';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';
import { signOut } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);

  const loadData = async () => {
    try {
      const session: any = await getAuthSession();
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser?.org_id) {
        const q = query(
          collection(db, 'users'),
          where('org_id', '==', currentUser.org_id),
          where('role', '==', 'Staff')
        );
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setStaffList(list);
      }
    } catch (e) {
      console.warn('Settings load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = () => {
    Alert.alert('Log Out?', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch {}
          await clearAuthSession();
          router.replace('/phone-login');
        }
      },
    ]);
  };

  const handleAddStaff = async () => {
    if (!staffName.trim()) return Alert.alert('Missing Name', 'Enter staff full name.');
    if (!staffEmail.trim() || !staffEmail.includes('@')) return Alert.alert('Missing Email', 'Enter valid email.');
    if (!staffPassword || staffPassword.length < 6) return Alert.alert('Weak Password', 'Password must be at least 6 characters.');
    if (!user?.org_id) return Alert.alert('Error', 'No organization found.');

    setSavingStaff(true);
    try {
      const firebaseConfig = {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDouC2zVQ3lRDONRJJFootUbKVU9YKiJ0g",
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "smartstock-424c3.firebaseapp.com",
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "smartstock-424c3",
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "smartstock-424c3.firebasestorage.app",
        messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "283866117860",
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:283866117860:web:14d344ed21d7d2a4d6def1",
      };

      // Use a secondary App instance so the current Owner is not logged out
      const secondaryAppName = 'SecondaryAuthApp_' + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      const cred = await createUserWithEmailAndPassword(secondaryAuth, staffEmail.trim().toLowerCase(), staffPassword);
      const staffUid = cred.user.uid;

      const staffData = {
        uid: staffUid,
        fullName: staffName.trim(),
        name: staffName.trim(),
        email: staffEmail.trim().toLowerCase(),
        phone: staffPhone.trim(),
        org_id: user.org_id,
        org_name: user.org_name || '',
        role: 'Staff',
        currency: user.currency || 'NGN',
        currency_symbol: user.currency_symbol || '₦',
        created_at: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', staffUid), staffData);
      await secondarySignOut(secondaryAuth);

      Alert.alert(
        'Staff Account Created',
        `${staffName.trim()} can now log in using ${staffEmail.trim()} and access ${user.org_name || 'your store'}.`
      );

      setShowStaffModal(false);
      setStaffName('');
      setStaffEmail('');
      setStaffPhone('');
      setStaffPassword('');
      loadData();
    } catch (err: any) {
      Alert.alert('Create Staff Failed', err.message || 'Could not create staff account.');
    } finally {
      setSavingStaff(false);
    }
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color="#FDF6E9" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}><Ionicons name="person-outline" size={28} color="#FDF6E9" /></View>
        <Text style={styles.name}>{user?.org_name || user?.fullName || 'My Store'}</Text>
        <Text style={styles.sub}>{user?.email || ''}</Text>
        <Text style={styles.sub}>{user?.phone || ''}</Text>
        <View style={styles.roleBadge}><Text style={styles.roleText}>{user?.role || 'Staff'}</Text></View>
      </View>

      <Text style={styles.section}>ACCOUNT</Text>
      <View style={styles.card}>
        <Row icon="business-outline" label="Organization ID" value={user?.org_id || ''} />
        <Row icon="cash-outline" label="Currency" value={`${user?.currency || 'NGN'} (${user?.currency_symbol || '₦'})`} />
        <Row icon="person-outline" label="Role" value={user?.role || 'Staff'} last />
      </View>

      {user?.role === 'Owner' && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
            <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>STAFF ACCOUNTS ({staffList.length})</Text>
            <TouchableOpacity onPress={() => setShowStaffModal(true)} style={styles.addStaffPill}>
              <Ionicons name="add" size={14} color="#0B3B2E" />
              <Text style={styles.addStaffPillText}>Add Staff</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {staffList.length === 0 ? (
              <View style={{ paddingVertical: 14 }}>
                <Text style={{ color: '#8AA99B', fontSize: 13, textAlign: 'center' }}>No staff accounts created yet.</Text>
              </View>
            ) : (
              staffList.map((st, i) => (
                <Row
                  key={st.id || i}
                  icon="people-outline"
                  label={st.fullName || st.name || st.email}
                  value={st.role || 'Staff'}
                  last={i === staffList.length - 1}
                />
              ))
            )}
          </View>
        </>
      )}

      <Text style={styles.section}>APP</Text>
      <View style={styles.card}>
        <Row icon="information-circle-outline" label="Version" value="1.1.4" />
        <Row icon="globe-outline" label="Website" value="smartstock-main.vercel.app" last />
      </View>

      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Modal visible={showStaffModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Staff Member</Text>
            <Text style={styles.modalSub}>Staff will be assigned to your organization ({user?.org_id})</Text>

            <Text style={styles.inputLabel}>FULL NAME *</Text>
            <TextInput
              value={staffName}
              onChangeText={setStaffName}
              placeholder="e.g. Samuel Ade"
              placeholderTextColor="#8AA99B"
              style={styles.modalInput}
            />

            <Text style={styles.inputLabel}>EMAIL *</Text>
            <TextInput
              value={staffEmail}
              onChangeText={setStaffEmail}
              placeholder="staff@store.com"
              placeholderTextColor="#8AA99B"
              style={styles.modalInput}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>PHONE / WHATSAPP</Text>
            <TextInput
              value={staffPhone}
              onChangeText={setStaffPhone}
              placeholder="+234..."
              placeholderTextColor="#8AA99B"
              style={styles.modalInput}
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>TEMPORARY PASSWORD *</Text>
            <TextInput
              value={staffPassword}
              onChangeText={setStaffPassword}
              placeholder="At least 6 characters"
              placeholderTextColor="#8AA99B"
              style={styles.modalInput}
              secureTextEntry
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowStaffModal(false)}
                style={[styles.modalBtn, { backgroundColor: '#1E3A30' }]}
              >
                <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddStaff}
                disabled={savingStaff}
                style={[styles.modalBtn, { backgroundColor: '#FDF6E9' }]}
              >
                {savingStaff ? (
                  <ActivityIndicator color="#0B3B2E" />
                ) : (
                  <Text style={{ color: '#0B3B2E', fontWeight: '800' }}>Save Staff</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Row({ icon, label, value, last }: any) {
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: '#2A4A3E' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={icon} size={18} color="#8AA99B" />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  profileCard: { backgroundColor: '#1E3A30', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#2A4A3E' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  sub: { color: '#8AA99B', fontSize: 13, marginTop: 3 },
  roleBadge: { backgroundColor: '#0B3B2E', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#2A4A3E' },
  roleText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  section: { color: '#8AA99B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: '#1E3A30', borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: '#2A4A3E' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  rowLabel: { color: '#FDF6E9', fontSize: 14, fontWeight: '600' },
  rowValue: { color: '#8AA99B', fontSize: 13, maxWidth: 150, textAlign: 'right' },
  addStaffPill: { backgroundColor: '#FDF6E9', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  addStaffPillText: { color: '#0B3B2E', fontSize: 11, fontWeight: '700' },
  logoutBtn: { backgroundColor: '#7F1D1D', paddingVertical: 15, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 24, borderWidth: 1, borderColor: '#EF4444' },
  logoutText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalTitle: { color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSub: { color: '#8AA99B', fontSize: 12, marginBottom: 14 },
  inputLabel: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  modalInput: { backgroundColor: '#1E3A30', color: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A4A3E', fontSize: 14 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});
