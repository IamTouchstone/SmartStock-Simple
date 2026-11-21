import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { getAuthSession } from '../../services/inventoryService';
import { logProductHistory } from '../../services/historyService';

type MarketItem = {
  id: string;
  productId: string;
  productName: string;
  qty: string;
  customerName: string;
  marketDate: string;
  rawDate: string;
  org_id?: string;
  sku: string;
  [key: string]: any;
};

const toYYYYMMDD = (iso: string) => String(iso).slice(0, 10);

export default function MarketScreen() {
  const router = useRouter();
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState('');
  const [editItem, setEditItem] = useState<MarketItem | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editCustomer, setEditCustomer] = useState('');
  const [editDate, setEditDate] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // FIX: same pattern as add-request.tsx - getAuthSession() -> user.org_id
      // Old code used auth.currentUser + users doc, which did not match how add-request gets org
      const { user } = await getAuthSession();
      const org = user?.org_id || '';
      setOrgId(org);
      if (!org) { setItems([]); setLoading(false); return; }

      // FIX: add-request writes via addProduct() to products, NOT customer_requests
      // FIX: fields are name / customer_name / market_dates (array), NOT productName / customerName / marketDate
      const q = query(collection(db, 'products'), where('org_id', '==', org));
      const snap = await getDocs(q);
      const list: MarketItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const dates: string[] = Array.isArray(data.market_dates) ? data.market_dates : [];
        if (dates.length === 0) return;
        dates.forEach((rawDate: string) => {
          if (!rawDate) return;
          list.push({
            id: `${d.id}__${toYYYYMMDD(rawDate)}`,
            productId: d.id,
            productName: data.name || 'Item',
            qty: String(data.quantity ?? 0),
            customerName: data.customer_name || '',
            marketDate: toYYYYMMDD(rawDate),
            rawDate: String(rawDate),
            org_id: data.org_id || org,
            sku: data.sku || d.id,
            ...data,
          });
        });
      });
      // Sort by date
      list.sort((a, b) => a.marketDate.localeCompare(b.marketDate));
      setItems(list);
    } catch (e) {
      console.log('market load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const formatDateHeader = (iso: string) => {
    if (!iso) return 'No Date';
    try {
      const d = new Date(iso + 'T00:00:00');
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
  };

  const grouped: { [date: string]: MarketItem[] } = {};
  items.forEach((it) => {
    const key = it.marketDate || 'No Date';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(it);
  });

  const handleView = (item: MarketItem) => {
    router.push({ pathname: '/(tabs)/requests', params: { id: item.productId } } as any);
  };

  const openEdit = (item: MarketItem) => {
    setEditItem(item);
    setEditQty(item.qty);
    setEditCustomer(item.customerName);
    setEditDate(item.marketDate);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    try {
      // Re-read current market_dates, replace only this one date
      const q = query(collection(db, 'products'), where('org_id', '==', orgId));
      const snap = await getDocs(q);
      let currentDates: string[] = [];
      snap.forEach((d) => { if (d.id === editItem.productId) currentDates = Array.isArray(d.data().market_dates) ? d.data().market_dates : []; });
      const newIso = editDate.includes('T') ? editDate : `${editDate}T00:00:00.000Z`;
      const newDates = currentDates.map((d) => (toYYYYMMDD(d) === editItem.marketDate ? newIso : d));
      await updateDoc(doc(db, 'products', editItem.productId), {
        market_dates: newDates,
        customer_name: editCustomer,
        name: editItem.productName,
        quantity: Number(editQty) || 0,
      });
      if (orgId) {
        await logProductHistory(orgId, {
          action: 'EDITED',
          productName: editItem.productName,
          sku: editItem.sku,
          details: `Market item edited: Qty ${editItem.qty} -> ${editQty}, For ${editCustomer}, Date ${editItem.marketDate} -> ${editDate}`,
        });
      }
      setEditItem(null);
      load();
    } catch (e) {
      Alert.alert('Error', 'Could not save edit. Check connection.');
    }
  };

  const handleDelete = (item: MarketItem) => {
    Alert.alert(
      'Delete Market Item?',
      `Remove ${item.productName} for ${item.customerName} from ${formatDateHeader(item.marketDate)}?\n\nThis removes only this Market Date. The product stays in Inventory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const q = query(collection(db, 'products'), where('org_id', '==', orgId));
              const snap = await getDocs(q);
              let currentDates: string[] = [];
              snap.forEach((d) => { if (d.id === item.productId) currentDates = Array.isArray(d.data().market_dates) ? d.data().market_dates : []; });
              const newDates = currentDates.filter((d) => toYYYYMMDD(d) !== item.marketDate);
              await updateDoc(doc(db, 'products', item.productId), {
                market_dates: newDates,
                ...(newDates.length === 0 ? { customer_requested: false } : {}),
              });
              if (orgId) {
                await logProductHistory(orgId, {
                  action: 'DELETED',
                  productName: item.productName,
                  sku: item.sku,
                  details: `Market item deleted: ${item.productName}, For ${item.customerName}, Date ${item.marketDate}`,
                });
              }
              load();
            } catch (e) {
              Alert.alert('Error', 'Could not delete. Check connection / rules.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#FDF6E9" /><Text style={styles.loadingText}>Loading Market...</Text></View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {items.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>No market items yet.{'\n'}Tap + &gt; Take Order to add one.</Text></View>
      ) : (
        Object.keys(grouped).map((dateKey) => (
          <View key={dateKey} style={styles.dateCard}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateTitle}>📅  {formatDateHeader(dateKey)}</Text>
              <View style={styles.countBadge}><Text style={styles.countText}>{grouped[dateKey].length} items</Text></View>
            </View>
            {grouped[dateKey].map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.productName}</Text>
                    <Text style={styles.itemSub}>Qty: {item.qty}  🧊  For: {item.customerName}</Text>
                  </View>
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity onPress={() => handleView(item)} style={[styles.btn, styles.viewBtn]}><Text style={styles.btnText}>👁 View</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(item)} style={[styles.btn, styles.editBtn]}><Text style={styles.btnText}>✏️ Edit</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.btn, styles.deleteBtn]}><Text style={styles.btnText}>🗑 Delete</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      {/* Edit Modal */}
      <Modal visible={!!editItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Market Item</Text>
            <Text style={styles.modalItemName}>{editItem?.productName}</Text>
            <Text style={styles.label}>Quantity</Text>
            <TextInput value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={styles.input} placeholder="Qty" placeholderTextColor="#94A3B8" />
            <Text style={styles.label}>Customer Name (For)</Text>
            <TextInput value={editCustomer} onChangeText={setEditCustomer} style={styles.input} placeholder="Customer name" placeholderTextColor="#94A3B8" />
            <Text style={styles.label}>Market Date (YYYY-MM-DD)</Text>
            <TextInput value={editDate} onChangeText={setEditDate} style={styles.input} placeholder="2026-11-18" placeholderTextColor="#94A3B8" />
            <TouchableOpacity onPress={saveEdit} style={styles.saveBtn}><Text style={styles.saveBtnText}>Save Changes</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditItem(null)} style={styles.cancelBtn}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B3B2E' },
  center: { flex: 1, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#FDF6E9', marginTop: 10 },
  emptyBox: { backgroundColor: '#134E3D', padding: 20, borderRadius: 14, alignItems: 'center', marginTop: 20 },
  emptyText: { color: '#FDF6E9', textAlign: 'center', lineHeight: 22 },
  dateCard: { backgroundColor: '#134E3D', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1E5A48' },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateTitle: { color: '#FDF6E9', fontSize: 17, fontWeight: '800', flex: 1 },
  countBadge: { backgroundColor: '#0B3B2E', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  countText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  itemCard: { backgroundColor: '#0B3B2E', borderRadius: 12, padding: 12, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  itemName: { color: '#FDF6E9', fontSize: 17, fontWeight: '800' },
  itemSub: { color: '#CBD5E1', fontSize: 13, marginTop: 3 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  viewBtn: { backgroundColor: '#1E5A48' },
  editBtn: { backgroundColor: '#B45309' },
  deleteBtn: { backgroundColor: '#B91C1C' },
  btnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#FDF6E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalTitle: { color: '#0B3B2E', fontSize: 20, fontWeight: '800' },
  modalItemName: { color: '#0B3B2E', fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  label: { color: '#0B3B2E', fontWeight: '700', fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, color: '#0B3B2E', fontSize: 15 },
  saveBtn: { backgroundColor: '#0B3B2E', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 18 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  cancelBtnText: { color: '#0B3B2E', fontWeight: '700' },
});