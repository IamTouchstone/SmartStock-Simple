import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  RefreshControl,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAuthSession, getDashboardSummary } from '../../services/inventoryService';

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgName, setOrgName] = useState('SmartStock');
  const [userRole, setUserRole] = useState('Staff');
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockAlerts: 0,
    totalUnits: 0,
  });

  const loadData = useCallback(async () => {
    try {
      const { user } = await getAuthSession();
      if (!user) {
        router.replace('/login');
        return;
      }
      setOrgName(user.org_name || 'SmartStock Retail');
      setUserRole(user.role || 'Staff');

      const summary = await getDashboardSummary(user.org_id || 'ORG-DEMO-001');
      setStats(summary);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.orgTitle}>{orgName}</Text>
          <Text style={styles.roleSubtitle}>Logged in as {userRole}</Text>
        </View>
        <TouchableOpacity 
          style={styles.refreshBadge} 
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Text style={styles.refreshBadgeText}>🔄 Sync</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
      >
        <Text style={styles.sectionTitle}>Overview</Text>

        {/* 3 CARDS ONLY */}
        {/* Card 1: Total Products */}
        <View style={[styles.card, styles.cardBlue]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>TOTAL PRODUCTS</Text>
            <Text style={styles.cardEmoji}>📦</Text>
          </View>
          <Text style={styles.cardNumber}>{stats.totalProducts}</Text>
          <Text style={styles.cardCaption}>Active items registered in catalog</Text>
        </View>

        {/* Card 2: Low Stock Alerts */}
        <View style={[styles.card, styles.cardAmber]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>LOW STOCK ALERTS</Text>
            <Text style={styles.cardEmoji}>⚠️</Text>
          </View>
          <Text style={[styles.cardNumber, { color: stats.lowStockAlerts > 0 ? '#F59E0B' : '#10B981' }]}>
            {stats.lowStockAlerts}
          </Text>
          <Text style={styles.cardCaption}>
            {stats.lowStockAlerts > 0 ? 'Items below minimum safety threshold' : 'All stock levels healthy'}
          </Text>
        </View>

        {/* Card 3: Total Stock Units */}
        <View style={[styles.card, styles.cardGreen]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>TOTAL INVENTORY UNITS</Text>
            <Text style={styles.cardEmoji}>🏢</Text>
          </View>
          <Text style={styles.cardNumber}>{stats.totalUnits}</Text>
          <Text style={styles.cardCaption}>Units stored across all active branches</Text>
        </View>

        {/* Quick Action Buttons */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Quick Actions</Text>
        
        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.actionPrimary]}
            onPress={() => router.push('/(tabs)/add-item')}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={styles.actionText}>Add Item</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, styles.actionSecondary]}
            onPress={() => router.push('/(tabs)/inventory')}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionText}>View Catalog</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090D16',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 16,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  orgTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  roleSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  refreshBadge: {
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  refreshBadgeText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  // 3 Cards Styling
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardBlue: {
    backgroundColor: '#0F172A',
    borderColor: '#312E81',
  },
  cardAmber: {
    backgroundColor: '#1C1917',
    borderColor: '#78350F',
  },
  cardGreen: {
    backgroundColor: '#06281D',
    borderColor: '#065F46',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardEmoji: {
    fontSize: 20,
  },
  cardNumber: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardCaption: {
    color: '#64748B',
    fontSize: 12,
  },
  // Quick Actions
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionPrimary: {
    backgroundColor: '#4F46E5',
  },
  actionSecondary: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
