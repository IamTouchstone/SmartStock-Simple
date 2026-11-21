import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, Modal, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
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
  const [saving, setSaving] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

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

  const handleOpenScanner = async () => {
    setScanned(false);
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { Alert.alert('Permission Denied', 'Camera permission required.'); return; }
    }
    setScannerVisible(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScannerVisible(false);
    if (!data) return;
    const trimmed = data.trim();
    // If barcode is numeric, treat as barcode. Otherwise treat as scanned name/code.
    if (/^\d+$/.test(trimmed)) {
      setBarcode(trimmed);
    } else {
      setBarcode(trimmed);
      if (!productName.trim()) setProductName(trimmed);
    }
    // If product name is still empty, let user type it - Scan does not block Type
    if (!productName.trim()) {
      Alert.alert('Scanned', `Barcode: ${trimmed}\nType the product name below if needed.`);
    }
  };

  const addDate = () => {
    const iso = targetDate.toISOString();
    if (marketDates.some(d => new Date(d).toDateString() === targetDate.toDateString())) {
      Alert.alert('Already added'); return;
    }
    setMarketDates([...marketDates, iso]);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!productName.trim()) return Alert.alert('Enter product name');
    if (!customerName.trim()) return Alert.alert('Enter customer name');
    if (!orgId) return Alert.alert('Not Logged In', 'Please log in again.');
    setSaving(true);
    try {
      const sku = `${productName.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase()}-${barcode.slice(-4)}`;
      const res = await Promise.race([
        addProduct({
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
        } as any),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Save timed out after 15s. Check internet / Firestore rules.')), 15000)),
      ]);
      if (res.success) {
        Alert.alert('Saved', `${productName} requested by ${customerName}`, [
          { text: 'View Requests', onPress: () => router.replace('/(tabs)/requests') },
        ]);
      } else {
        Alert.alert('Error', res.error || 'Failed to save request.');
      }
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Save failed. Check internet and try again.');
    } finally {
      setSaving(false);
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
        <Text style={styles.label}>PRODUCT NAME * - SCAN OR TYPE</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="e.g. Golden Morn 900g - type or scan"
            placeholderTextColor="#64748B"
            value={productName}
            onChangeText={setProductName}
          />
          <TouchableOpacity onPress={handleOpenScanner} style={styles.scanBtn}>
            <Ionicons name="barcode-outline" size={15} color="#FFF" />
            <Text style={styles.scanBtnText}>Scan</Text>
          </TouchableOpacity>
        </View>
        {barcode ? (
          <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 6 }}>Barcode: {barcode}</Text>
        ) : null}
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
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save Customer Request</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={scannerVisible} animationType="slide" statusBarTranslucent={true}>
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}>
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Point at Barcode</Text>
              <Text style={{ color: '#CBD5E1', fontSize: 13, marginTop: 6 }}>Or close and type the product name</Text>
            </View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: 300, height: 200, borderWidth: 2, borderColor: '#FFF', borderRadius: 12 }} />
            </View>
            <View style={{ paddingBottom: 40, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setScannerVisible(false)} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 }}>
                <Text style={{ color: 'white', fontWeight: '600' }}>Cancel - Type Instead</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>
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
  scanBtn: { backgroundColor: '#1E293B', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#334155' },
  scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});