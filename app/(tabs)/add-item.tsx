import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import { addProduct, getAuthSession, generateUniqueBarcode } from '../../services/inventoryService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function AddItemScreen() {
  const router = useRouter();
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [itemSize, setItemSize] = useState(''); // NEW: optional size
  const [category, setCategory] = useState('General Retail');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [branch, setBranch] = useState('Main Warehouse');
  const [saving, setSaving] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [orgId, setOrgId] = useState('ORG-DEMO-001');
  const [barcode, setBarcode] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [safetyStock, setSafetyStock] = useState('10');
  const [salesCount, setSalesCount] = useState('0');

  // PRODUCT PHOTO
  const [productImage, setProductImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // CUSTOMER REQUEST ONLY (Market dates moved to Customer Requests screen)
  const [customerName, setCustomerName] = useState('');
  const [customerRequested, setCustomerRequested] = useState(false);

  useEffect(() => { 
    (async () => { 
      const { user } = await getAuthSession(); 
      if (user?.currency_symbol) setCurrencySymbol(user.currency_symbol);
      const org = user?.org_id || 'ORG-DEMO-001';
      setOrgId(org);
      const newBarcode = await generateUniqueBarcode(org);
      setBarcode(newBarcode);
    })(); 
  }, []);

  const regenerateBarcode = async () => {
    const newBarcode = await generateUniqueBarcode(orgId);
    setBarcode(newBarcode);
  };

  const [scannerVisible, setScannerVisible] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
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

  // PHOTO LOGIC
  const takeProductPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Need camera permission'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1,1] });
    if (!result.canceled) setProductImage(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1,1] });
    if (!result.canceled) setProductImage(result.assets[0].uri);
  };

  const makeStandard = async () => {
    Alert.alert('✨ Standard Mode', 'This will auto-enhance your photo to white background studio look.\n\nIn v2, we will search web for official product image.');
  };

  const uploadImageIfNeeded = async (): Promise<string | null> => {
    if (!productImage) return null;
    if (productImage.startsWith('http')) return productImage;
    setUploading(true);
    try {
      const storage = getStorage();
      const response = await fetch(productImage);
      const blob = await response.blob();
      const fileName = `products/${orgId}/${Date.now()}_${name.replace(/\s/g,'_')}.jpg`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (e:any) {
      console.log('upload failed', e);
      return null;
    } finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Enter product name.'); return; }
    if (!price || isNaN(Number(price))) { Alert.alert('Validation', 'Enter valid price.'); return; }
    setSaving(true);
    try {
      let finalSku = sku.trim();
      if (!finalSku) {
        const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g,'').substring(0,4).toUpperCase() || 'PRD';
        finalSku = `${cleanName}-${barcode.slice(-4)}`;
      }
      const imageUrl = await uploadImageIfNeeded();

      const result = await addProduct({ 
        sku: finalSku, 
        name: name.trim(),
        item_size: itemSize.trim() || null, // NEW OPTIONAL
        category, 
        price: parseFloat(price) || 0, 
        cost: parseFloat(cost) || 0, 
        quantity: parseInt(quantity, 10) || 0, 
        branch, 
        org_id: orgId,
        barcode,
        expiry_date: expiryDate ? expiryDate.toISOString() : null,
        safety_stock: parseInt(safetyStock, 10) || 10,
        sales_count: parseInt(salesCount, 10) || 0,
        last_sold_date: salesCount !== '0' ? new Date().toISOString() : null,
        image_url: imageUrl,
        customer_requested: customerRequested,
        customer_name: customerName || null,
        // market_dates now handled in Customer Requests screen
        market_dates: [],
      } as any);

      if (result.success) { 
        Alert.alert('Success', `Saved!\n${name}${itemSize ? ` (${itemSize})` : ''}\nSKU: ${result.sku || finalSku}`, [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }]); 
      }
      else { Alert.alert('Error', result.error || 'Failed'); }
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}><Text style={styles.title}>Add New Item</Text><Text style={styles.subtitle}>Photo + Size enabled</Text></View>
      <ScrollView contentContainerStyle={styles.formContainer}>

        {/* PHOTO SECTION */}
        <Text style={styles.label}>PRODUCT PHOTO</Text>
        {productImage ? (
          <View style={styles.photoPreviewCard}>
            <Image source={{uri: productImage}} style={styles.photoPreview} />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={()=>setProductImage(null)} style={[styles.pillBtn, {backgroundColor:'#7F1D1D'}]}><Text style={styles.pillText}>🗑️ Delete</Text></TouchableOpacity>
              <TouchableOpacity onPress={takeProductPhoto} style={styles.pillBtn}><Text style={styles.pillText}>📷 Retake</Text></TouchableOpacity>
              <TouchableOpacity onPress={makeStandard} style={[styles.pillBtn, {backgroundColor:'#065F46'}]}><Text style={styles.pillText}>✨ Make Standard</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{flexDirection:'row', gap:10}}>
            <TouchableOpacity onPress={takeProductPhoto} style={styles.photoBtn}><Text style={styles.photoBtnText}>📸 Take Photo</Text></TouchableOpacity>
            <TouchableOpacity onPress={pickFromGallery} style={[styles.photoBtn, {backgroundColor:'#1E293B'}]}><Text style={styles.photoBtnText}>🖼️ Gallery</Text></TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>PRODUCT SKU (Optional)</Text>
        <View style={styles.row}><TextInput style={[styles.input, { flex: 1 }]} placeholder="Auto if blank" placeholderTextColor="#64748B" value={sku} onChangeText={setSku} autoCapitalize="characters" /><TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}><Text style={styles.scanBtnText}>Scan</Text></TouchableOpacity></View>
        
        <View style={styles.barcodeCard}>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={styles.barcodeLabel}>BARCODE (EAN-13)</Text><TouchableOpacity onPress={regenerateBarcode}><Text style={styles.regenText}>Regenerate</Text></TouchableOpacity></View>
          <Text style={styles.barcodeNumber}>{barcode || '...'}</Text>
        </View>

        <Text style={styles.label}>PRODUCT NAME *</Text><TextInput style={styles.input} placeholder="e.g. Milo" placeholderTextColor="#64748B" value={name} onChangeText={setName} />

        {/* NEW: ITEM SIZE OPTIONAL */}
        <Text style={styles.label}>ITEM SIZE / WEIGHT (Optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. 18g, 400ml, 1kg" placeholderTextColor="#64748B" value={itemSize} onChangeText={setItemSize} />

        {/* CUSTOMER REQUEST SECTION - stays here */}
        <View style={{backgroundColor:'#0F172A', borderWidth:1, borderColor:'#334155', borderRadius:12, padding:14, marginTop:18}}>
          <Text style={{color:'#FBBF24', fontWeight:'800', fontSize:13}}>👤 CUSTOMER REQUEST</Text>
          <View style={{flexDirection:'row', marginTop:12, alignItems:'center'}}>
            <TouchableOpacity style={[styles.checkBox, customerRequested && {backgroundColor:'#F59E0B'}]} onPress={()=>setCustomerRequested(!customerRequested)}><Text style={{color:'#fff'}}>{customerRequested ? '✓' : ''}</Text></TouchableOpacity>
            <Text style={{color:'#E2E8F0', marginLeft:8, fontSize:13}}>Customer requested this item</Text>
          </View>
          {customerRequested && (
            <TextInput style={[styles.input, {marginTop:10}]} placeholder="Customer Name (e.g. Mama Gold - 5 bags)" placeholderTextColor="#64748B" value={customerName} onChangeText={setCustomerName} />
          )}
          <Text style={{color:'#64748B', fontSize:10, marginTop:8}}>Market date will be set inside Customer Requests list.</Text>
        </View>
        
        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.categoryRow}>{['General Retail', 'Electronics', 'Groceries', 'Packaging'].map((cat) => (<TouchableOpacity key={cat} style={[styles.catPill, category === cat && styles.catPillActive]} onPress={() => setCategory(cat)}><Text style={[styles.catPillText, category === cat && styles.catPillTextActive]}>{cat}</Text></TouchableOpacity>))}</View>

        <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.label}>SELLING PRICE ({currencySymbol}) *</Text><TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#64748B" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.label}>UNIT COST ({currencySymbol})</Text><TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#64748B" keyboardType="decimal-pad" value={cost} onChangeText={setCost} /></View></View>

        <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.label}>INITIAL QTY</Text><TextInput style={styles.input} keyboardType="number-pad" value={quantity} onChangeText={setQuantity} /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.label}>SAFETY STOCK</Text><TextInput style={styles.input} keyboardType="number-pad" value={safetyStock} onChangeText={setSafetyStock} /></View></View>

        <Text style={styles.label}>EXPIRY DATE</Text>
        <TouchableOpacity style={styles.input} onPress={()=>setShowDatePicker(true)}>
          <Text style={{color: expiryDate ? '#FFF' : '#64748B'}}>{expiryDate ? expiryDate.toLocaleDateString() : 'Tap to set (optional)'}</Text>
        </TouchableOpacity>
        {showDatePicker && (<DateTimePicker value={expiryDate || new Date()} mode="date" minimumDate={new Date()} display={Platform.OS==='ios' ? 'spinner' : 'default'} onChange={(e, d)=>{ if(Platform.OS==='android') setShowDatePicker(false); if(d) setExpiryDate(d); }} />)}

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSubmit} disabled={saving || uploading}>
          {saving || uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{uploading ? 'Uploading Photo...' : 'Save Product'}</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={scannerVisible} animationType="slide" statusBarTranslucent={true}>
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView style={{ flex: 1 }} facing={facing} onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','upc_a','upc_e','code128','code39','qr'] }}>
            <View style={{ paddingTop: 60, alignItems: 'center' }}><Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Point at Barcode</Text></View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><View style={{ width: 300, height: 200, borderWidth: 2, borderColor: '#64ffda', borderRadius: 12 }} /></View>
            <View style={{ paddingBottom: 40, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setScannerVisible(false)} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 }}><Text style={{ color: 'white', fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
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
  scanBtn: { backgroundColor: '#312E81', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginLeft: 10 },
  scanBtnText: { color: '#A5B4FC', fontWeight: '700', fontSize: 14 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  catPill: { backgroundColor: '#1E293B', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginRight: 8, marginBottom: 8 },
  catPillActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  catPillText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  catPillTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: '#10B981', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  barcodeCard: { backgroundColor: '#0F172A', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#4F46E5', marginTop: 12 },
  barcodeLabel: { color: '#A5B4FC', fontSize: 10, fontWeight: '700' },
  regenText: { color: '#4F46E5', fontSize: 11, fontWeight: '700' },
  barcodeNumber: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', letterSpacing: 2, marginTop: 6, textAlign: 'center' },
  photoBtn: { backgroundColor: '#065F46', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, flex:1, alignItems:'center', borderWidth:1, borderColor:'#10B981' },
  photoBtnText: { color: '#D1FAE5', fontWeight:'700', fontSize:13 },
  photoPreviewCard: { backgroundColor:'#0F172A', padding:10, borderRadius:12, borderWidth:1, borderColor:'#334155', alignItems:'center' },
  photoPreview: { width:160, height:160, borderRadius:12 },
  photoActions: { flexDirection:'row', gap:8, marginTop:10, flexWrap:'wrap', justifyContent:'center' },
  pillBtn: { backgroundColor:'#1E293B', paddingVertical:8, paddingHorizontal:12, borderRadius:20, borderWidth:1, borderColor:'#334155' },
  pillText: { color:'#E2E8F0', fontSize:12, fontWeight:'600' },
  checkBox: { width:22, height:22, borderRadius:6, borderWidth:1, borderColor:'#F59E0B', alignItems:'center', justifyContent:'center' },
});