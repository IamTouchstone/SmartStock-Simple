import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession, getInventory } from '../../services/inventoryService';
import { placeOnShelf, getShelfHistory, getLiveShelf, SHELF_LOCATIONS, ShelfPlacement } from '../../services/shelfService';

function fmt(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function ShelfScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [history, setHistory] = useState<ShelfPlacement[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [qty, setQty] = useState('1');
  const [staffName, setStaffName] = useState('');
  const [location, setLocation] = useState(SHELF_LOCATIONS[0]);
  const [notes, setNotes] = useState('');
  const [tab, setTab] = useState<'place' | 'live' | 'history'>('place');
  const [historyFilter, setHistoryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState('₦');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getAuthSession();
      const orgId = (s as any)?.user?.org_id;
      setCurrency((s as any)?.user?.currency_symbol || '₦');
      if (!orgId) return;
      const [inv, hist] = await Promise.all([getInventory(orgId), getShelfHistory(orgId)]);
      setProducts(inv); setHistory(hist);
    } catch (e) { console.log('SHELF LOAD', e); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredProducts = products.filter((p: any) => p.name?.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  const live = getLiveShelf(history);
  const filteredHistory = history.filter(h =>
    (!historyFilter || h.staffName?.toLowerCase().includes(historyFilter.toLowerCase()) || h.productName?.toLowerCase().includes(historyFilter.toLowerCase()))
  );
  const todayCount = history.filter(h => h.type === 'PLACED' && new Date(h.placedAt).toDateString() === new Date().toDateString()).reduce((a, h) => a + Number(h.qty || 0), 0);
  const staffToday = [...new Set(history.filter(h => new Date(h.placedAt).toDateString() === new Date().toDateString()).map(h => h.staffName))];

  const onPlace = async () => {
    if (!selected) return Alert.alert('Select product', 'Search and tap a product first.');
    if (!staffName.trim()) return Alert.alert('Staff name required', 'Enter the name of the staff who placed it on the shelf. E.g. Aisha, Musa.');
    if ((parseInt(qty) || 0) <= 0) return Alert.alert('Quantity required', 'Enter quantity above 0.');
    setSaving(true);
    try {
      const s = await getAuthSession();
      const orgId = (s as any)?.user?.org_id;
      const res = await placeOnShelf({
        org_id: orgId, productId: selected.id || '', productName: selected.name, sku: selected.sku || '', barcode: selected.barcode || '',
        qty: parseInt(qty), shelfLocation: location, staffName: staffName.trim(), notes: notes.trim(),
      });
      if (!res.success) throw new Error(res.error);
      Alert.alert('Placed on shelf', `${qty} x ${selected.name} placed on ${location} by ${staffName.trim()}.`);
      setQty('1'); setNotes(''); setSelected(null); setSearch('');
      await load(); setTab('live');
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shelf Display</Text>
        <Text style={styles.sub}>Who placed what, where, when</Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statNum}>{live.reduce((a, x) => a + x.qty, 0)}</Text><Text style={styles.statLabel}>On Shelf Now</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{todayCount}</Text><Text style={styles.statLabel}>Placed Today</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{staffToday.length}</Text><Text style={styles.statLabel}>Staff Today</Text></View>
      </View>
      <View style={styles.tabs}>
        {(['place', 'live', 'history'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'place' ? 'Place on Shelf' : t === 'live' ? 'Live Shelf' : 'History'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'place' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={styles.label}>1. Search product *</Text>
          <TextInput value={search} onChangeText={(t) => { setSearch(t); setSelected(null); }} placeholder="Type product name..." placeholderTextColor="#8AA99B" style={styles.input} />
          {search.trim() && !selected ? filteredProducts.map((p: any) => (
            <TouchableOpacity key={p.id || p.name} onPress={() => { setSelected(p); setSearch(p.name); }} style={styles.pick}>
              <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>{p.name}</Text>
              <Text style={{ color: '#8AA99B', fontSize: 12 }}>Stock: {p.total_stock} • {currency}{p.price} • Exp {p.expiry_date || 'Not set'}</Text>
            </TouchableOpacity>
          )) : null}
          {selected ? <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 6 }}>Selected: {selected.name} • In stock: {selected.total_stock}</Text> : null}

          <Text style={styles.label}>2. Quantity *</Text>
          <TextInput value={qty} onChangeText={setQty} keyboardType="numeric" style={styles.input} placeholder="1" placeholderTextColor="#8AA99B" />

          <Text style={styles.label}>3. Shelf / Display location *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SHELF_LOCATIONS.map(l => (
              <TouchableOpacity key={l} onPress={() => setLocation(l)} style={[styles.chip, location === l && styles.chipActive]}>
                <Text style={[styles.chipText, location === l && styles.chipTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>4. Staff who placed it *</Text>
          <TextInput value={staffName} onChangeText={setStaffName} placeholder="E.g. Aisha, Musa, Fatima" placeholderTextColor="#8AA99B" style={styles.input} autoCapitalize="words" />
          <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 4 }}>One account, so we ask for the name each time. It is saved in history forever.</Text>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput value={notes} onChangeText={setNotes} placeholder="E.g. Promo display, front facing" placeholderTextColor="#8AA99B" style={styles.input} />

          <TouchableOpacity onPress={onPlace} disabled={saving} style={[styles.btn, { backgroundColor: '#0B3B2E' }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Place on Shelf</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : tab === 'live' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {loading ? <ActivityIndicator color="#FDF6E9" /> : live.length === 0 ? <Text style={{ color: '#8AA99B', textAlign: 'center', marginTop: 40 }}>Nothing on shelf yet. Use Place on Shelf.</Text> : live.map((x, i) => (
            <View key={i} style={styles.card}>
              <Text style={{ color: '#FDF6E9', fontWeight: '800' }}>{x.productName}</Text>
              <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 4 }}>{x.shelfLocation} • {x.qty} units on display</Text>
              <Text style={{ color: '#8AA99B', fontSize: 12 }}>Last placed by {x.lastStaff} • {fmt(x.lastPlacedAt)}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <TextInput value={historyFilter} onChangeText={setHistoryFilter} placeholder="Filter history by staff or product..." placeholderTextColor="#8AA99B" style={styles.input} />
          <Text style={{ color: '#8AA99B', fontSize: 12, marginBottom: 10 }}>{filteredHistory.length} records • Full audit trail, never deleted</Text>
          {filteredHistory.map(h => (
            <View key={h.id} style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#FDF6E9', fontWeight: '800', flex: 1 }}>{h.productName}</Text>
                <Text style={{ color: h.type === 'PLACED' ? '#4ADE80' : '#FCA5A5', fontWeight: '800', fontSize: 12 }}>{h.type === 'PLACED' ? `+${h.qty}` : `-${h.qty}`}</Text>
              </View>
              <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 4 }}>{h.shelfLocation} • Placed by <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>{h.staffName}</Text></Text>
              <Text style={{ color: '#8AA99B', fontSize: 12 }}>{fmt(h.placedAt)}{h.notes ? ` • ${h.notes}` : ''}</Text>
              {h.barcode ? <Text style={{ color: '#8AA99B', fontSize: 11 }}>Barcode: {h.barcode}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  header: { padding: 16, backgroundColor: '#0B3B2E' },
  title: { color: '#FDF6E9', fontSize: 18, fontWeight: '800' },
  sub: { color: '#8AA99B', fontSize: 12, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 10, padding: 16 },
  stat: { flex: 1, backgroundColor: '#1E3A30', borderRadius: 12, padding: 12, alignItems: 'center' },
  statNum: { color: '#FDF6E9', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#8AA99B', fontSize: 11, marginTop: 2, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1E3A30', alignItems: 'center' },
  tabActive: { backgroundColor: '#FDF6E9' },
  tabText: { color: '#8AA99B', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#0B3B2E' },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: '#1E3A30', color: '#fff', padding: 12, borderRadius: 10 },
  pick: { backgroundColor: '#1E3A30', padding: 12, borderRadius: 10, marginTop: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#1E3A30', borderWidth: 1, borderColor: '#2A4A3E' },
  chipActive: { backgroundColor: '#FDF6E9', borderColor: '#FDF6E9' },
  chipText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#0B3B2E' },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#1E3A30', borderRadius: 12, padding: 14, marginBottom: 10 },
});