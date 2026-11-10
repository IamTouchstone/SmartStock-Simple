import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { getAuthSession, generateUniqueBarcode, addProduct } from '../../services/inventoryService';

export default function AddRequestScreen() {
  const router = useRouter();
  const [orgId, setOrgId] = useState('');
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [targetDate, setTargetDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [marketDates, setMarketDates] = useState<string[]>([]);
  const [barcode, setBarcode] = useState('');

  useEffect(() => {
    (async () => {
      const { user } = await getAuthSession();
      if (!user?.org_id) {
        router.replace('/phone-login');
        return;
      }
      setOrgId(user.org_id);
      setBarcode(await generateUniqueBarcode(user.org_id));
    })();
  }, []);

  const addDate = () => {
    const iso = targetDate.toISOString();
    if (marketDates.some(d => new Date(d).toDateString() === targetDate.toDateString())) {
      Alert.alert('Already added'); return;
    }
    setMarketDates([...marketDates, iso]);
  };

  const handleSave = async () => {
    if (!productName.trim()) return Alert.alert('Enter product name');
    if (!customerName.trim()) return Alert.alert('Enter customer name');
    const sku = `${productName.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase()}-${barcode.slice(-4)}`;
    const res = await addProduct({
      sku,
      name: productName,
      item_size: '',
      category: 'Customer Request',
      price: 0, cost: 0, quantity: 0,
      branch: 'Main Warehouse',
      org_id: orgId,
      barcode,
      expiry_date: null,
      safety_stock: 10,
      sales_count: 0,
      image_url: null,
      customer_requested: true,
      customer_name: customerName,
      customer_description: description,
      market_dates: marketDates,
    } as any);

    if (res.success) {
      Alert.alert('Saved', `${productName} requested by ${customerName}`, [
        { text: 'View Requests', onPress: () => router.replace('/(tabs)/requests') },
      ]);
      router.replace('/(tabs)/requests');
    } else {
      Alert.alert('Error', res.error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Add Customer Request</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>CUSTOMER NAME *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Mrs. Adebayo"
          placeholderTextColor="#64748B"
          value={customerName}
          onChangeText={setCustomerName}
        />
        <Text style={styles.label}>PRODUCT NAME *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Golden Morn 900g"
          placeholderTextColor="#64748B"
          value={productName}
          onChangeText={setProductName}
        />
        <Text style={styles.label}>DESCRIPTION / DETAILS</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          multiline
          placeholder="Size, brand, qty customer wants"
          placeholderTextColor="#64748B"
          value={description}
          onChangeText={setDescription}
        />
        <Text style={styles.label}>TARGET MARKET DATE</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)}>
          <Text style={{ color: '#FFF' }}>{targetDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker
            value={targetDate}
            mode="date"
            minimumDate={new Date()}
            display="default"
            onChange={(e, d) => {
              if (Platform.OS === 'android') setShowPicker(false);
              if (d) setTargetDate(d);
            }}
          />
        )}
        <TouchableOpacity onPress={addDate} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>+ Add Date to Planner</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {marketDates.map((d, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setMarketDates(marketDates.filter(x => x !== d))}
              style={styles.datePill}
            >
              <Text style={styles.datePillText}>{new Date(d).toLocaleDateString()}  ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveText}>Save Customer Request</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16' },
  header: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 16, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: '#0F172A', color: '#FFF', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  secondaryBtn: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#F59E0B', padding: 12, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  secondaryText: { color: '#FBBF24', fontWeight: '700' },
  datePill: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  datePillText: { color: '#000', fontWeight: '700', fontSize: 12 },
  saveBtn: { backgroundColor: '#4F46E5', padding: 16, borderRadius: 12, marginTop: 24, alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
