import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Platform, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { addProduct, getAuthSession, generateUniqueBarcode } from '../../services/inventoryService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function AddItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as any;
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [itemSize, setItemSize] = useState('');
  const [category, setCategory] = useState('General Retail');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [branch, setBranch] = useState('Main Warehouse');
  const [saving, setSaving] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [orgId, setOrgId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [safetyStock, setSafetyStock] = useState('10');
  const [salesCount, setSalesCount] = useState('0');
  const [productImage, setProductImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // OCR Expiry Scan state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [scannedExpiryDate, setScannedExpiryDate] = useState<string | null>(null);
  const [showExpiryConfirm, setShowExpiryConfirm] = useState(false);
  const [expiryDateString, setExpiryDateString] = useState(''); // YYYY-MM-DD

  useEffect(() => {
    (async () => {
      try {
        const { user } = await getAuthSession();
        if (!user?.org_id) {
          // Not logged in - redirect
          router.replace('/phone-login');
          return;
        }
        if (user?.currency_symbol) setCurrencySymbol(user.currency_symbol);
        const finalOrg = `ORG-${user.uid.slice(0, 6).toUpperCase()}`;
        const realOrgId = user.org_id || finalOrg;
        setOrgId(realOrgId);
        if (params?.barcode) {
          setBarcode(String(params.barcode).trim());
        } else {
          const newBarcode = await generateUniqueBarcode(realOrgId);
          setBarcode(newBarcode);
        }
      } catch (e) {
        console.log('auth load error', e);
        router.replace('/phone-login');
      }
    })();
  }, []);

  const regenerateBarcode = async () => {
    if (!orgId) return;
    const newBarcode = await generateUniqueBarcode(orgId);
    setBarcode(newBarcode);
  };

  const [scannerVisible, setScannerVisible] = useState(false);
  const [facing] = useState<'back' | 'front'>('back');
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

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
    if (data) {
      if (data.length >= 8 && /^\d+$/.test(data)) {
        setBarcode(data);
      } else {
        setSku(data.trim().toUpperCase());
      }
    }
  };

  const takeProductPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Need camera permission'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) setProductImage(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) setProductImage(result.assets[0].uri);
  };

  const makeStandard = async () => {
    Alert.alert('Standard Mode', 'This will auto-enhance your photo to white background studio look.\n\nIn v2, we will search web for official product image.');
  };

  const uploadImageIfNeeded = async (): Promise<string | null> => {
    if (!productImage) return null;
    if (productImage.startsWith('http')) return productImage;
    setUploading(true);
    try {
      const storage = getStorage();
      const response = await fetch(productImage);
      const blob = await response.blob();
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'product';
      const fileName = `products/${orgId}/${Date.now()}_${safeName}.jpg`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (e: any) {
      console.log('upload failed', e);
      Alert.alert('Photo upload failed', 'Product will save without photo. Check Storage rules.');
      return null;
    } finally { setUploading(false); }
  };

  // OCR helpers
  function parseExpiryAndProduction(text: string): { expiryDate: string | null; productionDate: string | null; onlyPD: boolean } {
    const months: Record<string, string> = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
      'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const toIsoDate = (d: string, m: string, y: string): string => {
      let year = y;
      if (year.length === 2) {
        year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
      }
      const month = months[m.toLowerCase()] || m.padStart(2, '0');
      const day = d.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    let expDate: string | null = null;
    let prodDate: string | null = null;

    // Explicit BB / EXP
    const expMatch = text.match(/(?:BB|EXP|EXPIRY|BEST BEFORE|USE BY)[:\s]*([0-3]?\d)[\s\-\/\.]([0-1]?\d|[A-Za-z]{3})[\s\-\/\.](\d{2,4})\b/i);
    if (expMatch) expDate = toIsoDate(expMatch[1], expMatch[2], expMatch[3]);

    // Explicit PD / MFG
    const pdMatch = text.match(/(?:PD|MFG|PROD|PRODUCTION|PACKED)[:\s]*([0-3]?\d)[\s\-\/\.]([0-1]?\d|[A-Za-z]{3})[\s\-\/\.](\d{2,4})\b/i);
    if (pdMatch) prodDate = toIsoDate(pdMatch[1], pdMatch[2], pdMatch[3]);

    // If no explicit prefix found, check standard formats for expiry
    if (!expDate && !prodDate) {
      // YYYY-MM-DD
      const ymd = text.match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])\b/);
      if (ymd) expDate = `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

      // DD/MM/YYYY
      if (!expDate) {
        const dmyNum = text.match(/\b(0?[1-9]|[12]\d|3[01])[-\/](0?[1-9]|1[0-2])[-\/](20\d{2})\b/);
        if (dmyNum) expDate = toIsoDate(dmyNum[1], dmyNum[2], dmyNum[3]);
      }

      // DD MMM YYYY
      if (!expDate) {
        const dmyText = text.match(/\b(0?[1-9]|[12]\d|3[01])\s+([A-Za-z]{3})\s+(20\d{2})\b/);
        if (dmyText && months[dmyText[2].toLowerCase()]) expDate = toIsoDate(dmyText[1], dmyText[2], dmyText[3]);
      }

      // DDMMYY (6 digits e.g. 031126)
      if (!expDate) {
        const ddmmyy = text.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})\b/);
        if (ddmmyy) expDate = toIsoDate(ddmmyy[1], ddmmyy[2], ddmmyy[3]);
      }
    }

    const onlyPD = !expDate && !!prodDate;
    return { expiryDate: expDate, productionDate: prodDate, onlyPD };
  }

  function formatExpiryForDisplay(dateStr: string): string {
    const [y, mo, d] = dateStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(d)} ${monthNames[parseInt(mo) - 1]} ${y}`;
  }

  const scanExpiryDate = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Web', 'Please type the expiry date manually on web.');
      setShowDatePicker(true);
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera permission required to scan expiry date.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0].base64) return;

    setOcrLoading(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_OCR_API_KEY || 'K88349281388957';
      if (!apiKey) throw new Error('OCR API key not configured. Please type date manually.');

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { 'apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `base64Image=data:image/jpeg;base64,${result.assets[0].base64}&language=eng&OCREngine=2`,
      });
      const data = await response.json();
      const text = data?.ParsedResults?.[0]?.ParsedText || '';

      if (!text.trim()) {
        Alert.alert('Could Not Read', 'Could not read date clearly. Please type it.');
        return;
      }

      const resultDates = parseExpiryAndProduction(text);
      if (resultDates.onlyPD) {
        Alert.alert('Only Production Date Found', 'Only Production Date (PD) was detected on label. Please type the expiry date manually.');
        setShowDatePicker(true);
        return;
      }

      const parsed = resultDates.expiryDate;
      if (!parsed) {
        Alert.alert('Could Not Read', 'Could not read date clearly. Please type it.');
        return;
      }

      // Check if it's a future date
      const expDate = new Date(parsed);
      if (expDate < new Date()) {
        Alert.alert('Date Check', `Scanned date ${formatExpiryForDisplay(parsed)} is in the past. Please verify.`);
      }

      setScannedExpiryDate(parsed);
      setShowExpiryConfirm(true);
    } catch (e: any) {
      Alert.alert('Scan Failed', e.message || 'Could not read date. Please type it manually.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Enter product name.'); return; }
    if (!price || isNaN(Number(price))) { Alert.alert('Validation', 'Enter valid price.'); return; }
    if (!orgId) {
      Alert.alert('Not Logged In', 'Please log in again to save products.');
      router.replace('/phone-login');
      return;
    }
    setSaving(true);
    try {
      let finalSku = sku.trim();
      if (!finalSku) {
        const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'PRD';
        finalSku = `${cleanName}-${barcode.slice(-4)}`;
      }
      const imageUrl = await uploadImageIfNeeded();
      const result = await addProduct({
        sku: finalSku,
        name: name.trim(),
        item_size: itemSize.trim() || null,
        category,
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        quantity: parseInt(quantity, 10) || 0,
        branch,
        org_id: orgId,
        barcode,
        expiry_date: expiryDate ? expiryDate.toISOString().split('T')[0] : (expiryDateString || null),
        safety_stock: parseInt(safetyStock, 10) || 10,
        sales_count: parseInt(salesCount, 10) || 0,
        last_sold_date: salesCount !== '0' ? new Date().toISOString() : null,
        image_url: imageUrl,
        customer_requested: false,
        customer_name: null,
        market_dates: [],
      } as any);
      if (result.success) {
        Alert.alert('Success', `Saved!\n${name}${itemSize ? ` (${itemSize})` : ''}\nSKU: ${result.sku || finalSku}`, [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }]);
      } else { Alert.alert('Error', result.error || 'Failed'); }
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}><Text style={styles.title}>Add New Item</Text><Text style={styles.subtitle}>Photo + Size enabled</Text></View>
      <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>

        <Text style={styles.label}>PRODUCT PHOTO</Text>
        {productImage ? (
          <View style={styles.photoPreviewCard}>
            <Image source={{ uri: productImage }} style={styles.photoPreview} />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => setProductImage(null)} style={[styles.pillBtn, { backgroundColor: '#7F1D1D', borderColor: '#EF4444' }]}><Ionicons name="trash-outline" size={13} color="#fff" /><Text style={styles.pillText}>Delete</Text></TouchableOpacity>
              <TouchableOpacity onPress={takeProductPhoto} style={styles.pillBtn}><Ionicons name="camera-outline" size={13} color="#FDF6E9" /><Text style={styles.pillText}>Retake</Text></TouchableOpacity>
              <TouchableOpacity onPress={makeStandard} style={[styles.pillBtn, { backgroundColor: '#0B3B2E' }]}><Ionicons name="sparkles-outline" size={13} color="#FDF6E9" /><Text style={styles.pillText}>Make Standard</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={takeProductPhoto} style={styles.photoBtn}><Ionicons name="camera-outline" size={16} color="#FDF6E9" /><Text style={styles.photoBtnText}>Take Photo</Text></TouchableOpacity>
            <TouchableOpacity onPress={pickFromGallery} style={[styles.photoBtn, { backgroundColor: '#1E3A30' }]}><Ionicons name="image-outline" size={16} color="#FDF6E9" /><Text style={styles.photoBtnText}>Gallery</Text></TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>PRODUCT SKU (Optional)</Text>
        <View style={styles.row}><TextInput style={[styles.input, { flex: 1 }]} placeholder="Auto if blank" placeholderTextColor="#8AA99B" value={sku} onChangeText={setSku} autoCapitalize="characters" /><TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}><Ionicons name="barcode-outline" size={15} color="#FDF6E9" /><Text style={styles.scanBtnText}>Scan</Text></TouchableOpacity></View>

        <View style={styles.barcodeCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.barcodeLabel}>BARCODE (EAN-13)</Text><TouchableOpacity onPress={regenerateBarcode}><Text style={styles.regenText}>Regenerate</Text></TouchableOpacity></View>
          <Text style={styles.barcodeNumber}>{barcode || '...'}</Text>
        </View>

        <Text style={styles.label}>PRODUCT NAME *</Text><TextInput style={styles.input} placeholder="e.g. Milo" placeholderTextColor="#8AA99B" value={name} onChangeText={setName} />

        <Text style={styles.label}>ITEM SIZE / WEIGHT (Optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. 18g, 400ml, 1kg" placeholderTextColor="#8AA99B" value={itemSize} onChangeText={setItemSize} />

        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.categoryRow}>{['General Retail', 'Electronics', 'Groceries', 'Packaging'].map((cat) => (<TouchableOpacity key={cat} style={[styles.catPill, category === cat && styles.catPillActive]} onPress={() => setCategory(cat)}><Text style={[styles.catPillText, category === cat && styles.catPillTextActive]}>{cat}</Text></TouchableOpacity>))}</View>

        <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.label}>SELLING PRICE ({currencySymbol}) *</Text><TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#8AA99B" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.label}>UNIT COST ({currencySymbol})</Text><TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#8AA99B" keyboardType="decimal-pad" value={cost} onChangeText={setCost} /></View></View>

        <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.label}>INITIAL QTY</Text><TextInput style={styles.input} keyboardType="number-pad" value={quantity} onChangeText={setQuantity} /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.label}>SAFETY STOCK</Text><TextInput style={styles.input} keyboardType="number-pad" value={safetyStock} onChangeText={setSafetyStock} /></View></View>

        <Text style={styles.label}>EXPIRY DATE</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.scanBtn, { flex: 1 }]}
            onPress={scanExpiryDate}
            disabled={ocrLoading}
          >
            {ocrLoading
              ? <ActivityIndicator size="small" color="#FDF6E9" />
              : <><Ionicons name="camera-outline" size={15} color="#FDF6E9" /><Text style={styles.scanBtnText}>📷 Scan Expiry</Text></>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanBtn, { flex: 1 }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="create-outline" size={15} color="#FDF6E9" />
            <Text style={styles.scanBtnText}>⌨️ Type Manually</Text>
          </TouchableOpacity>
        </View>
        {(expiryDate || expiryDateString) && (
          <View style={{ backgroundColor: '#1E3A30', padding: 10, borderRadius: 8, marginTop: 6 }}>
            <Text style={{ color: '#FDF6E9', fontSize: 13 }}>
              Expiry: {expiryDate ? expiryDate.toLocaleDateString('en-GB') : expiryDateString}
            </Text>
            <TouchableOpacity onPress={() => { setExpiryDate(null); setExpiryDateString(''); }}>
              <Text style={{ color: '#EF4444', fontSize: 11, marginTop: 4 }}>Clear date</Text>
            </TouchableOpacity>
          </View>
        )}
        {showDatePicker && (
          <DateTimePicker
            value={expiryDate || new Date()}
            mode="date"
            minimumDate={new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(e, d) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (d) { setExpiryDate(d); setExpiryDateString(''); }
            }}
          />
        )}

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSubmit} disabled={saving || uploading}>
          {saving || uploading ? <ActivityIndicator color="#0B3B2E" /> : <Text style={styles.saveBtnText}>{uploading ? 'Uploading Photo...' : 'Save Product'}</Text>}
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>

      <Modal visible={scannerVisible} animationType="slide" statusBarTranslucent={true}>
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView style={{ flex: 1 }} facing={facing} onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}>
            <View style={{ paddingTop: 60, alignItems: 'center' }}><Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Point at Barcode</Text></View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><View style={{ width: 300, height: 200, borderWidth: 2, borderColor: '#FDF6E9', borderRadius: 12 }} /></View>
            <View style={{ paddingBottom: 40, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setScannerVisible(false)} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 }}><Text style={{ color: 'white', fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>

      <Modal visible={showExpiryConfirm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={{ color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Scanned Expiry Date</Text>
            <Text style={{ color: '#8AA99B', fontSize: 13, marginBottom: 16 }}>Please confirm this is correct before saving.</Text>
            <View style={{ backgroundColor: '#1E3A30', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#FDF6E9', fontSize: 28, fontWeight: '800' }}>
                {scannedExpiryDate ? formatExpiryForDisplay(scannedExpiryDate) : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#FDF6E9', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 }}
              onPress={() => {
                if (scannedExpiryDate) {
                  setExpiryDateString(scannedExpiryDate);
                  setExpiryDate(null);
                }
                setShowExpiryConfirm(false);
                setScannedExpiryDate(null);
              }}
            >
              <Text style={{ color: '#0B3B2E', fontWeight: '800', fontSize: 15 }}>Use This Date</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#2A4A3E' }}
              onPress={() => { setShowExpiryConfirm(false); setScannedExpiryDate(null); scanExpiryDate(); }}
            >
              <Text style={{ color: '#FDF6E9', fontWeight: '700', fontSize: 15 }}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2A4A3E' }}
              onPress={() => { setShowExpiryConfirm(false); setScannedExpiryDate(null); setShowDatePicker(true); }}
            >
              <Text style={{ color: '#FDF6E9', fontWeight: '700', fontSize: 15 }}>⌨️ Type Manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, backgroundColor: '#0B3B2E' },
  title: { color: '#FDF6E9', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#8AA99B', fontSize: 12, marginTop: 2 },
  formContainer: { padding: 20, paddingBottom: 160 },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#1E3A30', color: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A4A3E', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  scanBtn: { backgroundColor: '#1E3A30', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#2A4A3E' },
  scanBtnText: { color: '#FDF6E9', fontWeight: '700', fontSize: 14 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  catPill: { backgroundColor: '#1E3A30', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#2A4A3E', marginRight: 8, marginBottom: 8 },
  catPillActive: { backgroundColor: '#FDF6E9', borderColor: '#FDF6E9' },
  catPillText: { color: '#8AA99B', fontSize: 12, fontWeight: '600' },
  catPillTextActive: { color: '#0B3B2E' },
  saveBtn: { backgroundColor: '#FDF6E9', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#0B3B2E', fontSize: 16, fontWeight: '800' },
  barcodeCard: { backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E', marginTop: 12 },
  barcodeLabel: { color: '#8AA99B', fontSize: 10, fontWeight: '700' },
  regenText: { color: '#FDF6E9', fontSize: 11, fontWeight: '700' },
  barcodeNumber: { color: '#FDF6E9', fontSize: 18, fontWeight: '800', letterSpacing: 2, marginTop: 6, textAlign: 'center' },
  photoBtn: { backgroundColor: '#0B3B2E', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#2A4A3E', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  photoBtnText: { color: '#FDF6E9', fontWeight: '700', fontSize: 13 },
  photoPreviewCard: { backgroundColor: '#1E3A30', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E', alignItems: 'center' },
  photoPreview: { width: 160, height: 160, borderRadius: 12 },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  pillBtn: { backgroundColor: '#1E3A30', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#2A4A3E', flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillText: { color: '#FDF6E9', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
});
