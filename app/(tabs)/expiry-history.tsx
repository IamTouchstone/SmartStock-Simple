import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession } from '../../services/inventoryService';
import { getExpiryHistory, calcTotals, actionLabel, ExpiryHistoryItem } from '../../services/expiryHistoryService';

const fmtN = (n: number) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const fmtDate = (iso: string) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso.slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso.slice(0, 10); }
};

export default function ExpiryHistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ExpiryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('month');
  const [actionFilter, setActionFilter] = useState<'all' | 'exchanged' | 'replaced' | 'thrown_away'>('all');
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { user } = await getAuthSession();
      if (!user?.org_id) { setItems([]); return; }
      setItems(await getExpiryHistory(user.org_id));
    } catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const now = new Date();
  const curMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const curYear = now.getFullYear() + yearOffset;
  const monthKey = `${curMonth.getFullYear()}-${String(curMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = curMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Always show This Month + This Year, no matter what filter you are on
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthItems = items.filter((it) => String(it.disposed_at || '').startsWith(thisMonthKey));
  const thisYearItems = items.filter((it) => String(it.disposed_at || '').startsWith(String(now.getFullYear())));
  const thisMonthTotals = calcTotals(thisMonthItems);
  const thisYearTotals = calcTotals(thisYearItems);

  const filtered = items.filter((it) => {
    if (actionFilter !== 'all' && it.action !== actionFilter) return false;
    const d = String(it.disposed_at || '').slice(0, 10);
    if (period === 'month') return d.startsWith(monthKey);
    if (period === 'year') return d.startsWith(String(curYear));
    return true;
  });
  const totals = calcTotals(filtered);

  if (loading) return (<View style={styles.center}><ActivityIndicator size="large" color="#FDF6E9" /><Text style={styles.loadingText}>Loading Expiry History...</Text></View>);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Back button */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={18} color="#FDF6E9" /><Text style={styles.backText}>Back</Text></TouchableOpacity>

      {/* Where expired items for Month and Year are seen - always visible */}
      <Text style={styles.sectionTitle}>Expired Items - At a Glance</Text>
      <View style={styles.glanceRow}>
        <View style={[styles.glanceCard, { borderColor: '#F59E0B' }]}>
          <Text style={styles.glanceLabel}>This Month</Text>
          <Text style={styles.glanceMonth}>{now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.glanceValue}>{fmtN(thisMonthTotals.totalExpiredValue)}</Text>
          <Text style={styles.glanceSub}>{thisMonthTotals.totalUnitsExpired} units expired</Text>
          <Text style={styles.glanceSub}>Recovered: {fmtN(thisMonthTotals.totalRecoveredValue)} ({thisMonthTotals.totalUnitsExchanged + thisMonthTotals.totalUnitsReplaced} units)</Text>
          <Text style={[styles.glanceSub, { color: '#F87171' }]}>Net Loss: {fmtN(thisMonthTotals.netLoss)}</Text>
          <Text style={styles.glanceSub}>{thisMonthTotals.count} records</Text>
        </View>
        <View style={[styles.glanceCard, { borderColor: '#4ADE80' }]}>
          <Text style={styles.glanceLabel}>This Year</Text>
          <Text style={styles.glanceMonth}>{now.getFullYear()}</Text>
          <Text style={styles.glanceValue}>{fmtN(thisYearTotals.totalExpiredValue)}</Text>
          <Text style={styles.glanceSub}>{thisYearTotals.totalUnitsExpired} units expired</Text>
          <Text style={styles.glanceSub}>Recovered: {fmtN(thisYearTotals.totalRecoveredValue)} ({thisYearTotals.totalUnitsExchanged + thisYearTotals.totalUnitsReplaced} units)</Text>
          <Text style={[styles.glanceSub, { color: '#F87171' }]}>Net Loss: {fmtN(thisYearTotals.netLoss)}</Text>
          <Text style={styles.glanceSub}>{thisYearTotals.count} records</Text>
        </View>
      </View>

      <View style={styles.segRow}>
        <TouchableOpacity onPress={() => setPeriod('month')} style={[styles.segBtn, period === 'month' && styles.segActive]}><Text style={[styles.segText, period === 'month' && styles.segTextActive]}>Month</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setPeriod('year')} style={[styles.segBtn, period === 'year' && styles.segActive]}><Text style={[styles.segText, period === 'year' && styles.segTextActive]}>Year</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setPeriod('all')} style={[styles.segBtn, period === 'all' && styles.segActive]}><Text style={[styles.segText, period === 'all' && styles.segTextActive]}>All Time</Text></TouchableOpacity>
      </View>
      {period === 'month' && (
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => setMonthOffset(monthOffset - 1)} style={styles.navBtn}><Text style={styles.navBtnText}>‹ Prev</Text></TouchableOpacity>
          <Text style={styles.navLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => setMonthOffset(monthOffset + 1)} disabled={monthOffset >= 0} style={[styles.navBtn, monthOffset >= 0 && { opacity: 0.4 }]}><Text style={styles.navBtnText}>Next ›</Text></TouchableOpacity>
        </View>
      )}
      {period === 'year' && (
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => setYearOffset(yearOffset - 1)} style={styles.navBtn}><Text style={styles.navBtnText}>‹ Prev</Text></TouchableOpacity>
          <Text style={styles.navLabel}>{curYear}</Text>
          <TouchableOpacity onPress={() => setYearOffset(yearOffset + 1)} disabled={yearOffset >= 0} style={[styles.navBtn, yearOffset >= 0 && { opacity: 0.4 }]}><Text style={styles.navBtnText}>Next ›</Text></TouchableOpacity>
        </View>
      )}
      {/* 3 options, calendar-style pills - same style as Market Dates */}
      <View style={styles.pillRow}>
        <TouchableOpacity onPress={() => setActionFilter('all')} style={[styles.pill, actionFilter === 'all' && styles.pillActive]}><Text style={[styles.pillText, actionFilter === 'all' && styles.pillTextActive]}>All</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActionFilter('exchanged')} style={[styles.pill, actionFilter === 'exchanged' && styles.pillActive]}><Text style={[styles.pillText, actionFilter === 'exchanged' && styles.pillTextActive]}>Exchanged</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActionFilter('replaced')} style={[styles.pill, actionFilter === 'replaced' && styles.pillActive]}><Text style={[styles.pillText, actionFilter === 'replaced' && styles.pillTextActive]}>Replaced</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActionFilter('thrown_away')} style={[styles.pill, actionFilter === 'thrown_away' && styles.pillActive]}><Text style={[styles.pillText, actionFilter === 'thrown_away' && styles.pillTextActive]}>Thrown Away</Text></TouchableOpacity>
      </View>

      <View style={styles.totalsCard}>
        <Text style={styles.totalsTitle}>{period === 'month' ? monthLabel : period === 'year' ? `Year ${curYear}` : 'All Time'} - Expiry Value</Text>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total Expired Value</Text><Text style={styles.totalValue}>{fmtN(totals.totalExpiredValue)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Exchanged (recovered)</Text><Text style={[styles.totalValue, { color: '#4ADE80' }]}>{fmtN(totals.totalExchangedValue)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Replaced (recovered)</Text><Text style={[styles.totalValue, { color: '#4ADE80' }]}>{fmtN(totals.totalReplacedValue)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total Recovered</Text><Text style={[styles.totalValue, { color: '#4ADE80' }]}>{fmtN(totals.totalRecoveredValue)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Thrown Away Value</Text><Text style={[styles.totalValue, { color: '#F87171' }]}>{fmtN(totals.totalThrownAwayValue)}</Text></View>
        <View style={[styles.totalRow, styles.netRow]}><Text style={styles.netLabel}>Net Loss (Thrown Away only)</Text><Text style={styles.netValue}>{fmtN(totals.netLoss)}</Text></View>
        <Text style={styles.totalSub}>{totals.totalUnitsExpired} units expired - {totals.totalUnitsExchanged} exchanged - {totals.totalUnitsReplaced} replaced - {totals.totalUnitsThrownAway} thrown - {totals.count} records</Text>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>No expiry records for this period.{'\n'}Go to Inventory - tap an expired product - Mark Expired.</Text></View>
      ) : filtered.map((it) => {
        const isThrown = it.action === 'thrown_away';
        const isReplaced = it.action === 'replaced';
        return (
          <View key={it.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.itemName}>{it.productName}</Text>
              <View style={[styles.badge, isThrown ? styles.badgeRed : isReplaced ? styles.badgeYellow : styles.badgeGreen]}>
                <Text style={[styles.badgeText, isReplaced ? { color: '#000' } : {}]}>{actionLabel(it.action)}</Text>
              </View>
            </View>
            <Text style={styles.itemSub}>SKU: {it.sku} {it.barcode ? `| Barcode: ${it.barcode}` : ''}</Text>
            <Text style={styles.itemSub}>Supplier: {it.supplier}</Text>
            <Text style={styles.itemSub}>Sold: {it.qty_sold}  |  Expired: {it.qty_expired}</Text>
            <Text style={styles.itemSub}>Expired on: {fmtDate(it.expiry_date)}  |  Disposed: {fmtDate(it.disposed_at)}</Text>
            <Text style={styles.unitLine}>Unit Cost: {fmtN(it.unit_cost)}  |  Unit Price: {fmtN(it.unit_price)}</Text>
            <Text style={styles.totalLine}>Total Value: {fmtN(it.total_value)}  ({it.qty_expired} x {fmtN(it.unit_cost)})</Text>
            {it.notes ? <Text style={styles.note}>Note: {it.notes}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B3B2E' },
  center: { flex: 1, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#FDF6E9', marginTop: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { color: '#FDF6E9', fontWeight: '800', fontSize: 15 },
  sectionTitle: { color: '#FDF6E9', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  glanceRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  glanceCard: { flex: 1, backgroundColor: '#134E3D', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#1E5A48' },
  glanceLabel: { color: '#FBBF24', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  glanceMonth: { color: '#FDF6E9', fontSize: 13, fontWeight: '700', marginTop: 2 },
  glanceValue: { color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginTop: 6 },
  glanceSub: { color: '#CBD5E1', fontSize: 11, marginTop: 3, lineHeight: 15 },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segBtn: { flex: 1, backgroundColor: '#134E3D', paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1E5A48' },
  segActive: { backgroundColor: '#FDF6E9' },
  segText: { color: '#FDF6E9', fontWeight: '700', fontSize: 13 },
  segTextActive: { color: '#0B3B2E' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { backgroundColor: '#134E3D', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  navBtnText: { color: '#FDF6E9', fontWeight: '700' },
  navLabel: { color: '#FDF6E9', fontWeight: '800', fontSize: 16 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  pill: { backgroundColor: '#1E3A30', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2A4A3E' },
  pillActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  pillText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  pillTextActive: { color: '#000', fontWeight: '800' },
  totalsCard: { backgroundColor: '#134E3D', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1E5A48' },
  totalsTitle: { color: '#FDF6E9', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { color: '#CBD5E1', fontSize: 13 },
  totalValue: { color: '#FDF6E9', fontWeight: '800', fontSize: 14 },
  netRow: { borderTopWidth: 1, borderTopColor: '#1E5A48', marginTop: 8, paddingTop: 10 },
  netLabel: { color: '#FDF6E9', fontWeight: '800', fontSize: 14 },
  netValue: { color: '#F87171', fontWeight: '800', fontSize: 16 },
  totalSub: { color: '#94A3B8', fontSize: 12, marginTop: 8 },
  emptyBox: { backgroundColor: '#134E3D', padding: 20, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  emptyText: { color: '#FDF6E9', textAlign: 'center', lineHeight: 22 },
  card: { backgroundColor: '#134E3D', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1E5A48' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  itemName: { color: '#FDF6E9', fontSize: 16, fontWeight: '800', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeGreen: { backgroundColor: '#14532D' },
  badgeYellow: { backgroundColor: '#F59E0B' },
  badgeRed: { backgroundColor: '#7F1D1D' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  itemSub: { color: '#CBD5E1', fontSize: 13, marginTop: 3 },
  unitLine: { color: '#FDE68A', fontSize: 13, fontWeight: '700', marginTop: 8 },
  totalLine: { color: '#FDF6E9', fontSize: 14, fontWeight: '800', marginTop: 3 },
  note: { color: '#94A3B8', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
});