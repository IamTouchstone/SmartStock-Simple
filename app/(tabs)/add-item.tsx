import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  ActivityIndicator, 
  Modal, 
  StatusBar 
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { addProduct, getAuthSession, extractInvoiceWithOCR } from '../../services/inventoryService';

export default function AddItemScreen() {
  const router = useRouter();
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General Retail');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [branch, setBranch] = useState('Main Warehouse');
  const [saving, setSaving] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  useEffect(() => {
    (async () => {
      const { user } = await getAuthSession();
      if (user && user.currency_symbol) {
        setCurrencySymbol(user.currency_symbol);
      }
    })();
  }, []);

  // FIXED: Added facing and scanned
  const [scannerVisible, setScannerVisible] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ocrLoading, setOcrLoading] = useState(false);

  const handleOpenScanner = async () => {
    setScanned(false);
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan barcodes.');
        return;
      }
    }
    setScannerVisible(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScannerVisible(false);
    if (data) {
      setSku(data.trim().toUpperCase());
      Alert.alert('Barcode Scanned', `SKU set to: ${data}`);
    }
  };

  const handleTriggerOCR = async () => {
    Alert.alert('OCR Helper', 'Upload an invoice or type product info directly.');
  };

  const handleSubmit = async () => {
    if (!sku.trim()) { Alert.alert('Validation Error', 'Please enter or scan a product SKU.'); return; }
    if (!name.trim()) { Alert.alert('Validation Error', 'Please enter a product name.'); return; }
    if (!price || isNaN(Number(price))) { Alert.alert('Validation Error', 'Please enter a valid selling price.'); return; }

    setSaving(true);
    try {
      const { user } = await getAuthSession();
      const orgId = user?.org_id || 'ORG-DEMO-001';
      const result = await addProduct({
        sku: sku.trim(), name: name.trim(), category,
        price: parseFloat(price) || 0, cost: parseFloat(cost) || 0,
        quantity: parseInt(quantity, 10) || 0, branch, org_id: orgId
      });
      if (result.success) {
        Alert.alert('Success', `Product ${sku.toUpperCase()} registered successfully!`, [
          { text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }
        ]);
      } else { Alert.alert('Save Error', result.error || 'Failed to save product.'); }
    } catch (e: any) { Alert.alert('Error', e.message || 'An unexpected error occurred.'); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />
      <View style={styles.header}>
        <Text style={styles.title}>Add New Item</Text>
        <Text style={styles.subtitle}>Register product to catalog and set branch stock</Text>
      </View>

      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.label}>PRODUCT SKU *</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="e.g. ELEC-9902" placeholderTextColor="#64748B" value={sku} onChangeText={setSku} autoCapitalize="characters" />
          <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner} activeOpacity={0.8}>
            <Text style={styles.scanBtnText}>📷 Scan</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>PRODUCT NAME *</Text>
        <TextInput style={styles.input} placeholder="e.g. Wireless Smart Speaker" placeholderTextColor="#64748B" value={name} onChangeText={setName} />

        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.categoryRow}>
          {['General Retail', 'Electronics', 'Groceries', 'Packaging'].map((cat) => (
            <TouchableOpacity key={cat} style={[styles.catPill, category === cat && styles.catPillActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.catPillText, category === cat && styles.catPillTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}><Text style={styles.label}>SELLING PRICE ({currencySymbol}) *</Text><TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#64748B" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /></View>
          <View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.label}>UNIT COST ({currencySymbol})</Text><TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#64748B" keyboardType="decimal-pad" value={cost} onChangeText={setCost} /></View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}><Text style={styles.label}>INITIAL QUANTITY</Text><TextInput style={styles.input} placeholder="10" placeholderTextColor="#64748B" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} /></View>
          <View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.label}>INITIAL BRANCH</Text><TextInput style={styles.input} placeholder="Main Warehouse" placeholderTextColor="#64748B" value={branch} onChangeText={setBranch} /></View>
        </View>

        <TouchableOpacity style={styles.ocrHelperBtn} onPress={handleTriggerOCR} disabled={ocrLoading} activeOpacity={0.7}>
          {ocrLoading ? <ActivityIndicator size="small" color="#A5B4FC" /> : <Text style={styles.ocrHelperText}>📄 Optional: Extract from Invoice (Tesseract.js)</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSubmit} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save Product to Inventory</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* FIXED MODAL - Real camera preview like phone camera */}
      <Modal visible={scannerVisible} animationType="fullScreen" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView
            style={{ flex: 1 }}
            facing={facing}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
          >
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Point at Barcode</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>You will see product like camera photo</Text>
            </View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: 300, height: 200, borderWidth: 2, borderColor: '#64ffda', borderRadius: 12, backgroundColor: 'transparent' }} />
            </View>
            <View style={{ paddingBottom: 50, alignItems: 'center', gap: 15 }}>
              <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={{ backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#64ffda', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 25 }}>
                <Text style={{ color: '#64ffda', fontWeight: 'bold' }}>🔄 Flip to {facing === 'back' ? 'Front' : 'Back'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setScannerVisible(false)} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 }}>
                <Text style={{ color: 'white', fontWeight: '600' }}>Cancel</Text>
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
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  formContainer: { padding: 20, paddingBottom: 40 },
  label: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#0F172A', color: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  scanBtn: { backgroundColor: '#312E81', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  scanBtnText: { color: '#A5B4FC', fontWeight: '700', fontSize: 14 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catPill: { backgroundColor: '#1E293B', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  catPillActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  catPillText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  catPillTextActive: { color: '#FFFFFF' },
  ocrHelperBtn: { marginTop: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#312E81', backgroundColor: 'rgba(49, 46, 129, 0.2)' },
  ocrHelperText: { color: '#A5B4FC', fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: '#10B981', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});