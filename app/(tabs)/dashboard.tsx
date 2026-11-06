import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Image,
  Modal,
  Linking,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession, getDashboardSummary } from '../../services/inventoryService';
import { snoozeAlert, SnoozeOption, filterVisibleAlerts } from '../../services/alertsService';

type AlertItem = {
  id: string;
  type: 'LOW_STOCK' | 'EXPIRING_3_MONTHS' | 'EXPIRED' | 'MARKET_DAY';
  message: string;
  itemName?: string;
};

type Stats = {
  totalProducts: number;
  lowStockAlerts: number;
  totalUnits: number;
  expiredCount: number;
  expiring3MonthsCount: number;
};

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [orgName, setOrgName] = useState<string>('SmartStock');
  const [userRole, setUserRole] = useState<string>('Staff');
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    lowStockAlerts: 0,
    totalUnits: 0,
    expiredCount: 0,
    expiring3MonthsCount: 0,
  });
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [showSnooze, setShowSnooze] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userPhone, setUserPhone] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      const { user } = await getAuthSession();
      if (!user) {
        router.replace('/login');
        return;
      }
      setOrgName(user.org_name || 'SmartStock Retail');
      setUserRole(user.role || 'Staff');
      setUserEmail(user.email || '');
      setUserPhone(user.phone || '');

      const summary: any = await getDashboardSummary(user.org_id || 'ORG-DEMO-001');
      setStats({
        totalProducts: summary?.totalProducts ?? 0,
        lowStockAlerts: summary?.lowStockAlerts ?? 0,
        totalUnits: summary?.totalUnits ?? 0,
        expiredCount: summary?.expiredCount ?? 0,
        expiring3MonthsCount: summary?.expiring3MonthsCount ?? 0,
      });

      const newAlerts: AlertItem[] = [];
      if ((summary?.lowStockAlerts ?? 0) > 0) {
        newAlerts.push({
          id: 'low-1',
          type: 'LOW_STOCK',
          message: `${summary.lowStockAlerts} items are low on stock - reorder now!`,
        });
      }
      if ((summary?.expiredCount ?? 0) > 0) {
        newAlerts.push({
          id: 'exp-1',
          type: 'EXPIRED',
          message: `${summary.expiredCount} items EXPIRED - remove from shelf now!`,
        });
      }
      if ((summary?.expiring3MonthsCount ?? 0) > 0) {
        newAlerts.push({
          id: 'exp-3m',
          type: 'EXPIRING_3_MONTHS',
          message: `${summary.expiring3MonthsCount} items expire in next 3 months - sell first!`,
        });
      }
      newAlerts.push({
        id: 'market-1',
        type: 'MARKET_DAY',
        message: 'Tomorrow is Market Day! Check low stock & expired items.',
      });
      const visibleAlerts = await filterVisibleAlerts(newAlerts);
      setAlerts(visibleAlerts);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openSnooze = (alert: AlertItem) => {
    setSelectedAlert(alert);
    setShowSnooze(true);
  };

  const handleSnooze = async (option: SnoozeOption, label: string) => {
    if (!selectedAlert) return;
    try {
      await snoozeAlert(selectedAlert.id, option);
    } catch {}
    setAlerts((prev) => prev.filter((a) => a.id !== selectedAlert.id));
    setShowSnooze(false);
    setSelectedAlert(null);
    Alert.alert(
      'Done',
      option === 'DISMISS' ? 'Alert dismissed - will not show again' : `Remind in ${label}`
    );
  };

  const sendWhatsApp = (alert: AlertItem) => {
    if (!userPhone) {
      Alert.alert('No phone', 'No phone number found for this user.');
      return;
    }
    const text = encodeURIComponent(`SmartStock Alert: ${alert.message}`);
    const cleanPhone = userPhone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${text}`);
  };

  const sendEmail = (alert: AlertItem) => {
    if (!userEmail) {
      Alert.alert('No email', 'No email found for this user.');
      return;
    }
    Linking.openURL(
      `mailto:${userEmail}?subject=SmartStock Alert - ${alert.type}&body=${encodeURIComponent(alert.message)}`
    );
  };

  const getAlertColor = (type: AlertItem['type']): string => {
    if (type === 'EXPIRED') return '#EF4444';
    if (type === 'LOW_STOCK') return '#F59E0B';
    if (type === 'EXPIRING_3_MONTHS') return '#F97316';
    return '#0B3B2E';
  };

  const getAlertIcon = (type: AlertItem['type']): any => {
    if (type === 'EXPIRED') return 'close-circle';
    if (type === 'LOW_STOCK') return 'warning';
    if (type === 'EXPIRING_3_MONTHS') return 'time';
    return 'storefront';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FDF6E9" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image
            source={require('../../assets/images/icon-72.png')}
            style={{ width: 40, height: 40, borderRadius: 9, marginRight: 12 }}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.orgTitle}>{orgName}</Text>
            <Text style={styles.roleSubtitle}>Logged in as {userRole}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshBadge} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={14} color="#FDF6E9" />
          <Text style={styles.refreshBadgeText}>Sync</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FDF6E9" />
        }
      >
        {alerts.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Ionicons name="notifications-outline" size={16} color="#8AA99B" />
              <Text style={styles.sectionTitle}>Alerts - {alerts.length}</Text>
            </View>
            {alerts.map((alert) => (
              <View
                key={alert.id}
                style={[styles.alertCard, { borderLeftColor: getAlertColor(alert.type) }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={[styles.alertIconWrap, { backgroundColor: getAlertColor(alert.type) + '22' }]}>
                    <Ionicons name={getAlertIcon(alert.type)} size={18} color={getAlertColor(alert.type)} />
                  </View>
                  <View style={[styles.alertBadge, { backgroundColor: getAlertColor(alert.type) }]}>
                    <Text style={styles.alertBadgeText}>{alert.type.replace('_', ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.alertMessage}>{alert.message}</Text>
                <View style={styles.alertActions}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => sendEmail(alert)}>
                    <Ionicons name="mail-outline" size={14} color="#fff" />
                    <Text style={styles.smallBtnText}>Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#25D366' }]}
                    onPress={() => sendWhatsApp(alert)}
                  >
                    <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                    <Text style={styles.smallBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#0B3B2E', borderWidth: 1, borderColor: '#2A4A3E' }]}
                    onPress={() => openSnooze(alert)}
                  >
                    <Ionicons name="time-outline" size={14} color="#fff" />
                    <Text style={styles.smallBtnText}>Snooze</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Overview</Text>

        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/inventory', params: { filter: 'all' } })} activeOpacity={0.7}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>TOTAL PRODUCTS</Text>
              <View style={styles.cardIconWrap}><Ionicons name="cube-outline" size={20} color="#FDF6E9" /></View>
            </View>
            <Text style={styles.cardNumber}>{stats.totalProducts}</Text>
            <Text style={styles.cardCaption}>Active items registered in catalog - Tap to view</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/inventory', params: { filter: 'lowstock' } })} activeOpacity={0.7}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>LOW STOCK ALERTS</Text>
              <View style={styles.cardIconWrap}><Ionicons name="warning-outline" size={20} color="#F59E0B" /></View>
            </View>
            <Text style={[styles.cardNumber, { color: stats.lowStockAlerts > 0 ? '#F59E0B' : '#FDF6E9' }]}>{stats.lowStockAlerts}</Text>
            <Text style={styles.cardCaption}>{stats.lowStockAlerts > 0 ? 'Items below minimum safety threshold - Tap to see' : 'All stock levels healthy'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/inventory', params: { filter: 'expired' } })} activeOpacity={0.7}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>EXPIRED ITEMS</Text>
              <View style={styles.cardIconWrap}><Ionicons name="close-circle-outline" size={20} color="#EF4444" /></View>
            </View>
            <Text style={[styles.cardNumber, { color: stats.expiredCount > 0 ? '#EF4444' : '#FDF6E9' }]}>{stats.expiredCount}</Text>
            <Text style={styles.cardCaption}>{stats.expiredCount > 0 ? 'Remove from shelf now - Tap to see' : 'No expired items'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/inventory', params: { filter: 'expiring' } })} activeOpacity={0.7}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>EXPIRING IN 3 MONTHS</Text>
              <View style={styles.cardIconWrap}><Ionicons name="time-outline" size={20} color="#F97316" /></View>
            </View>
            <Text style={[styles.cardNumber, { color: stats.expiring3MonthsCount > 0 ? '#F97316' : '#FDF6E9' }]}>{stats.expiring3MonthsCount}</Text>
            <Text style={styles.cardCaption}>{stats.expiring3MonthsCount > 0 ? 'Sell these first - Tap to see' : 'No items expiring soon'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/inventory', params: { filter: 'units' } })} activeOpacity={0.7}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>TOTAL INVENTORY UNITS</Text>
              <View style={styles.cardIconWrap}><Ionicons name="business-outline" size={20} color="#FDF6E9" /></View>
            </View>
            <Text style={styles.cardNumber}>{stats.totalUnits}</Text>
            <Text style={styles.cardCaption}>Units stored across all active branches - Tap to view details</Text>
          </View>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Quick Actions</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => router.push('/(tabs)/add-item')} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color="#0B3B2E" />
            <Text style={[styles.actionText, { color: '#0B3B2E' }]}>Add Item</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => router.push('/(tabs)/inventory')} activeOpacity={0.8}>
            <Ionicons name="list-outline" size={18} color="#FDF6E9" />
            <Text style={styles.actionText}>View Catalog</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showSnooze} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Snooze Alert?</Text>
            <Text style={styles.modalMsg}>{selectedAlert?.message}</Text>
            <TouchableOpacity style={[styles.snoozeBtn, { backgroundColor: '#EF4444' }]} onPress={() => handleSnooze('DISMISS', 'never')}>
              <Text style={styles.snoozeText}>Do not show again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.snoozeBtn} onPress={() => handleSnooze('30MIN', '30 mins')}>
              <Text style={styles.snoozeText}>Remind in 30 mins</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.snoozeBtn} onPress={() => handleSnooze('2HRS', '2 hours')}>
              <Text style={styles.snoozeText}>Remind in 2 hours</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.snoozeBtn} onPress={() => handleSnooze('3HRS', '3 hours')}>
              <Text style={styles.snoozeText}>Remind in 3 hours</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.snoozeBtn} onPress={() => handleSnooze('4HRS', '4 hours')}>
              <Text style={styles.snoozeText}>Remind in 4 hours</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.snoozeBtn} onPress={() => handleSnooze('24HRS', '24 hours')}>
              <Text style={styles.snoozeText}>Remind in 24 hours</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSnooze(false)}>
              <Text style={{ color: '#8AA99B', textAlign: 'center', marginTop: 10 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F241D' },
  loadingText: { color: '#8AA99B', marginTop: 12, fontSize: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, backgroundColor: '#0B3B2E' },
  orgTitle: { color: '#FDF6E9', fontSize: 20, fontWeight: '800' },
  roleSubtitle: { color: '#8AA99B', fontSize: 12, marginTop: 2 },
  refreshBadge: { backgroundColor: '#1E3A30', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#2A4A3E' },
  refreshBadgeText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { color: '#8AA99B', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  card: { borderRadius: 16, padding: 20, marginBottom: 14, backgroundColor: '#1E3A30', borderWidth: 1, borderColor: '#2A4A3E' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardLabel: { color: '#8AA99B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' },
  cardNumber: { color: '#FDF6E9', fontSize: 36, fontWeight: '800', marginBottom: 4 },
  cardCaption: { color: '#8AA99B', fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 8 },
  actionPrimary: { backgroundColor: '#FDF6E9' },
  actionSecondary: { backgroundColor: '#1E3A30', borderWidth: 1, borderColor: '#2A4A3E' },
  actionText: { color: '#FDF6E9', fontSize: 15, fontWeight: '700' },
  alertCard: { backgroundColor: '#1E3A30', borderWidth: 1, borderColor: '#2A4A3E', borderLeftWidth: 4, borderRadius: 16, padding: 16, marginBottom: 12 },
  alertIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  alertBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  alertBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  alertMessage: { color: '#FDF6E9', fontSize: 14, fontWeight: '600', marginVertical: 10, lineHeight: 20 },
  alertActions: { flexDirection: 'row', gap: 8 },
  smallBtn: { backgroundColor: '#0B3B2E', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#2A4A3E' },
  smallBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalMsg: { color: '#8AA99B', fontSize: 13, marginBottom: 16, lineHeight: 19 },
  snoozeBtn: { backgroundColor: '#1E3A30', paddingVertical: 13, borderRadius: 10, marginBottom: 8, alignItems: 'center' },
  snoozeText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});