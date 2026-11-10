import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { getAuthSession } from '../../services/inventoryService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type MarketItem = { id: string, name: string, market_dates: string[], quantity: number, customer_name?: string, item_size?: string };

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw?.toDate === 'function') return raw.toDate();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MarketPlannerScreen() {
  const insets = useSafeAreaInsets();
  const [grouped, setGrouped] = useState<Record<string, MarketItem[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { user } = await getAuthSession();
      const org_id = user?.org_id;
      if (!org_id) return;
      if (cancelled) return;

      const q = query(collection(db, 'products'), where('org_id', '==', org_id));
      unsub = onSnapshot(q, (snap) => {
        const map: Record<string, MarketItem[]> = {};
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const dates: string[] = d.market_dates || d.marketDates || [];
          if (dates && dates.length > 0) {
            dates.forEach((dateStr: string) => {
              const parsed = parseDate(dateStr);
              if (!parsed) return;
              const key = dateKey(parsed);
              if (!map[key]) map[key] = [];
              map[key].push({
                id: docSnap.id,
                name: d.name,
                market_dates: dates,
                quantity: d.total_stock ?? d.quantity ?? 0,
                customer_name: d.customer_name || d.customerName,
                item_size: d.item_size,
              });
            });
          }
        });
        const sorted: Record<string, MarketItem[]> = {};
        Object.keys(map).sort().forEach(k => sorted[k] = map[k]);
        setGrouped(sorted);
        setLoading(false);
      }, (err) => {
        console.log('Market planner error', err);
        setLoading(false);
      });
    })();

    return () => { cancelled = true; unsub?.(); };
  }, []);

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color="#FDF6E9" /><Text style={{ color: '#FDF6E9', padding: 20 }}>Loading market plans...</Text></View>;

  const dates = Object.keys(grouped);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.headerIcon}><Ionicons name="storefront-outline" size={22} color="#FDF6E9" /></View>
          <View>
            <Text style={styles.title}>Market Purchase Planner</Text>
            <Text style={styles.sub}>{dates.length} market days planned</Text>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {dates.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={48} color="#8AA99B" />
            <Text style={styles.empty}>No market dates yet.</Text>
            <Text style={styles.emptySub}>Add items from Customer Request tab with Add Market Date.</Text>
          </View>
        )}
        {dates.map(date => {
          const pretty = parseDate(date)?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) || date;
          return (
            <View key={date} style={styles.dateCard}>
              <View style={styles.dateHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="calendar-outline" size={18} color="#FDF6E9" />
                  <Text style={styles.dateText}>{pretty}</Text>
                </View>
                <View style={styles.countBadge}><Text style={styles.countBadgeText}>{grouped[date].length} items</Text></View>
              </View>
              {grouped[date].map(item => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name} {item.item_size ? `• ${item.item_size}` : ''}</Text>
                    <Text style={styles.itemSub}>Qty: {item.quantity} • For: {item.customer_name || 'Customer'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Market Item', `${item.name}\nDate: ${pretty}\nQty: ${item.quantity}`)} style={styles.viewBtn}>
                    <Ionicons name="eye-outline" size={14} color="#fff" />
                    <Text style={styles.viewBtnText}>View</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  )
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#0B3B2E' },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E3A30', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FDF6E9', fontSize: 20, fontWeight: '800' },
  sub: { color: '#8AA99B', marginTop: 2, fontSize: 12 },
  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  empty: { color: '#FDF6E9', textAlign: 'center', marginTop: 12, fontSize: 16, fontWeight: '700' },
  emptySub: { color: '#8AA99B', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 19 },
  dateCard: { backgroundColor: '#1E3A30', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2A4A3E' },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateText: { color: '#FDF6E9', fontWeight: '800', fontSize: 15, flex: 1 },
  countBadge: { backgroundColor: '#0B3B2E', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E' },
  countBadgeText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B3B2E', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2A4A3E' },
  itemName: { color: '#FDF6E9', fontWeight: '700', fontSize: 14 },
  itemSub: { color: '#8AA99B', fontSize: 11, marginTop: 3 },
  viewBtn: { backgroundColor: '#1E3A30', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#2A4A3E' },
  viewBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' }
});