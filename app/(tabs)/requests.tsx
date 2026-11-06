import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { addProduct, generateUniqueBarcode, getAuthSession } from '../../services/inventoryService';

export default function CustomerRequestsScreen() {
  const [name, setName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [qty, setQty] = useState('10');
  const [safety, setSafety] = useState('10');
  const [expiry, setExpiry] = useState('');
  const [customerRequested, setCustomerRequested] = useState(true);
  const [marketDates, setMarketDates] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const addDate = (e: any, date?: Date) => {
    setShowPicker(false);
    if (e?.type === 'dismissed') return;
    if (date) {
      const d = date.toISOString().split('T')[0];
      if (!marketDates.includes(d)) setMarketDates([...marketDates, d]);
    }
  };

  const addExpiryDate = (e: any, date?: Date) => {
    setShowExpiryPicker(false);
    if (e?.type === 'dismissed') return;
    if (date) setExpiry(date.toISOString().split('T')[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Missing Name', 'Enter product name.');
    if (!sellingPrice || Number(sellingPrice) <= 0) return Alert.alert('Missing Price', 'Enter selling price.');
    if (unitCost && Number(unitCost) > Number(sellingPrice)) {
      Alert.alert('Check Price', `Unit cost ₦${unitCost} is higher than selling price ₦${sellingPrice}. You will lose money on this item.`);
    }
    setSaving(true);
    try {
      const { user } = await getAuthSession();
      const org_id = user?.org_id || 'ORG-DEMO-001';
      const barcode = await generateUniqueBarcode(org_id);
      await addProduct({
        name: name.trim(), barcode, sku: `REQ-${barcode.slice(-4)}`, category: 'Customer Request',
        price: Number(sellingPrice) || 0, cost: Number(unitCost) || 0,
        quantity: Number(qty) || 10, total_stock: Number(qty) || 10, safety_stock: Number(safety) || 10,
        expiry_date: expiry || '',
        org_id, branch: 'Main Warehouse',
        customer_requested: customerRequested, market_dates: marketDates,
        customer_name: customerName.trim() || 'Walk-in Customer', item_size: '',
        branches: [{ branch: 'Main Warehouse', quantity: Number(qty) || 10 }]
      } as any);
      Alert.alert('Saved', 'Product + Market Plan saved to Customer Requests → Check Market tab');
      setMarketDates([]); setName(''); setCustomerName(''); setSellingPrice(''); setUnitCost(''); setQty('10'); setSafety('10'); setExpiry('');
    } catch (e: any) {
      Alert.alert('Save failed - check Firestore Rules', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={styles.title}>Customer Request</Text>
      <Text style={styles.sub}>Add item a customer asked for + plan market trip</Text>

      <Text style={styles.label}>PRODUCT NAME *</Text>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. AptaJunior" style={styles.input} placeholderTextColor="#8AA99B" />

      <Text style={styles.label}>CUSTOMER NAME</Text>
      <TextInput value={customerName} onChangeText={setCustomerName} placeholder="Walk-in Customer" style={styles.input} placeholderTextColor="#8AA99B" />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>SELLING PRICE (₦) *</Text>
          <TextInput value={sellingPrice} onChangeText={setSellingPrice} keyboardType="numeric" style={styles.input} placeholder="8000" placeholderTextColor="#8AA99B" />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>UNIT COST (₦)</Text>
          <TextInput value={unitCost} onChangeText={setUnitCost} keyboardType="numeric" style={styles.input} placeholder="11000" placeholderTextColor="#8AA99B" />
        </View>
      </View>

      <View style={styles.plannerBox}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="storefront-outline" size={18} color="#FDF6E9" />
          <Text style={styles.plannerTitle}>MARKET PURCHASE PLANNER</Text>
        </View>
        <Text style={styles.plannerSub}>Select dates you want to go to market to buy this for customers</Text>

        <TouchableOpacity onPress={() => setCustomerRequested(!customerRequested)} style={styles.checkRow}>
          <View style={[styles.checkbox, customerRequested && styles.checkedBox]}>
            {customerRequested && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
          <Text style={styles.checkText}>Customer requested this item</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.addDateBtn}>
          <Ionicons name="calendar-outline" size={16} color="#FDF6E9" />
          <Text style={styles.addDateText}>Add Market Date</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {marketDates.map(d => (
            <TouchableOpacity key={d} onPress={() => setMarketDates(marketDates.filter(x => x !== d))} style={styles.datePill}>
              <Text style={styles.datePillText}>{d}</Text>
              <Ionicons name="close" size={13} color="#fff" />
            </TouchableOpacity>
          ))}
        </View>
        {marketDates.length === 0 && <Text style={styles.hint}>No dates added yet. Tap above to add.</Text>}
        {marketDates.length > 0 && <Text style={styles.hint}>Tap date pill to remove. You can add multiple dates.</Text>}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>INITIAL QTY</Text>
          <TextInput value={qty} onChangeText={setQty} keyboardType="numeric" style={styles.input} />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>SAFETY STOCK</Text>
          <TextInput value={safety} onChangeText={setSafety} keyboardType="numeric" style={styles.input} />
        </View>
      </View>

      <Text style={styles.label}>EXPIRY DATE (optional)</Text>
      <TouchableOpacity onPress={() => setShowExpiryPicker(true)} style={styles.input}>
        <Text style={{ color: expiry ? '#fff' : '#8AA99B' }}>{expiry || 'Tap to pick expiry date'}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Leave empty if no expiry. Saved as YYYY-MM-DD so Inventory can detect expiry.</Text>

      <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
        {saving ? <ActivityIndicator color="#0B3B2E" /> : <Text style={styles.saveText}>Save Product + Market Plan</Text>}
      </TouchableOpacity>

      {showPicker && <DateTimePicker value={new Date()} mode="date" display="default" onChange={addDate} />}
      {showExpiryPicker && <DateTimePicker value={new Date()} mode="date" display="default" onChange={addExpiryDate} />}
    </ScrollView>
  )
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  title: { color: '#FDF6E9', fontSize: 26, fontWeight: '800' },
  sub: { color: '#8AA99B', marginBottom: 16, marginTop: 4, fontSize: 13 },
  label: { color: '#8AA99B', fontSize: 11, marginTop: 14, marginBottom: 6, fontWeight: '700', letterSpacing: 0.5 },
  input: { backgroundColor: '#1E3A30', color: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E' },
  row: { flexDirection: 'row', marginTop: 4 },
  plannerBox: { borderWidth: 1, borderColor: '#2A4A3E', backgroundColor: '#1E3A30', borderRadius: 16, padding: 16, marginTop: 18 },
  plannerTitle: { color: '#FDF6E9', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  plannerSub: { color: '#8AA99B', fontSize: 12, marginTop: 6, lineHeight: 17 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: '#8AA99B', alignItems: 'center', justifyContent: 'center' },
  checkedBox: { backgroundColor: '#0B3B2E', borderColor: '#0B3B2E' },
  checkText: { color: '#FDF6E9', fontSize: 14 },
  addDateBtn: { backgroundColor: '#0B3B2E', borderWidth: 1, borderColor: '#2A4A3E', padding: 14, borderRadius: 12, marginTop: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  addDateText: { color: '#FDF6E9', fontWeight: '700' },
  hint: { color: '#8AA99B', fontSize: 11, marginTop: 8, lineHeight: 16 },
  datePill: { backgroundColor: '#0B3B2E', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#2A4A3E' },
  datePillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#FDF6E9', padding: 18, borderRadius: 16, marginTop: 24, alignItems: 'center' },
  saveText: { color: '#0B3B2E', fontWeight: '800', fontSize: 16 }
});