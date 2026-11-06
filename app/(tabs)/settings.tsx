import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession } from '../../services/inventoryService';

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session: any = await getAuthSession();
        setUser(session?.user || session || null);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Log Out?', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => router.replace('/login') },
    ]);
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color="#FDF6E9" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}><Ionicons name="person-outline" size={28} color="#FDF6E9" /></View>
        <Text style={styles.name}>{user?.org_name || 'SmartStock Retail'}</Text>
        <Text style={styles.sub}>{user?.email || 'No email'}</Text>
        <Text style={styles.sub}>{user?.phone || ''}</Text>
        <View style={styles.roleBadge}><Text style={styles.roleText}>{user?.role || 'Staff'}</Text></View>
      </View>

      <Text style={styles.section}>ACCOUNT</Text>
      <View style={styles.card}>
        <Row icon="business-outline" label="Organization" value={user?.org_id || 'ORG-DEMO-001'} />
        <Row icon="cash-outline" label="Currency" value={user?.currency_symbol || '₦'} />
        <Row icon="person-outline" label="Role" value={user?.role || 'Staff'} last />
      </View>

      <Text style={styles.section}>APP</Text>
      <View style={styles.card}>
        <Row icon="information-circle-outline" label="Version" value="1.0.0" />
        <Row icon="globe-outline" label="Website" value="smartstock-main.vercel.app" last />
      </View>

      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
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
  logoutBtn: { backgroundColor: '#7F1D1D', paddingVertical: 15, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 24, borderWidth: 1, borderColor: '#EF4444' },
  logoutText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});