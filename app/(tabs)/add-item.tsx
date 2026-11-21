import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Platform, Image, Switch } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { startRecording, stopRecording, playRecording, transcribeRecording, useVoiceService } from '../../services/voiceService';
import { parseVoiceText } from '../../services/voiceParser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { parseExpiryFromText } from '../../services/expiryParser';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { addProduct, getAuthSession, generateUniqueBarcode } from '../../services/inventoryService';
import { logProductHistory } from '../../services/historyService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function extractJson(text: string): any {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

async function readExpiryWithGemini(base64: string): Promise<{ expiryDate: string | null; productionDate: string | null; batchNo: string | null; rawText: string }> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart.');
  const prompt = `Read this product label photo. Return ONLY valid JSON, no markdown:
{"expiryDate":"", "productionDate":"", "batchNo":"", "rawText":""}
Rules:
- expiryDate: EXPIRY / BEST BEFORE / BB / B.B. / USE BY date as YYYY-MM-DD. If only MM/YYYY, use last day of month. PD / MFD is NOT expiry.
- productionDate: PD / MFD date as YYYY-MM-DD, empty if not visible.
- batchNo: BN / BTH No / Batch / Lot, empty if not visible.
- rawText: all text you can read on the label, one line.
Never guess a date. If not visible, return empty string.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }], generationConfig: { temperature: 0.2 } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Could not read label.');
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const parsed = extractJson(text);
  if (!parsed) throw new Error('Could not read label clearly.');
  return { expiryDate: parsed.expiryDate || null, productionDate: parsed.productionDate || null, batchNo: parsed.batchNo || null, rawText: parsed.rawText || text };
}

export default function AddItemScreen() {
  const router = useRouter();
  useVoiceService();
  const params = useLocalSearchParams() as any;
  const [orgId, setOrgId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [parsed, setParsed] = useState<any>({});
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const val = await AsyncStorage.getItem('voiceEnabled');
      if (val !== null) setVoiceEnabled(val === 'true');
    })();
  }, []);

  const toggleVoice = async (val: boolean) => {
    setVoiceEnabled(val);
    await AsyncStorage.setItem('voiceEnabled', val ? 'true' : 'false');
  };

  const handleStart = async () => {
    setTranscribeError(null);
    await startRecording();
    setIsRecording(true);
    setRecordedUri(null);
    setTranscript('');
  };

  const handleStop = async () => {
    const uri = await stopRecording();
    setIsRecording(false);
    setRecordedUri(uri);
    if (!uri) return;
    setIsTranscribing(true);
    try {
      const text = await transcribeRecording(uri);
      if (text && text.trim()) setTranscript(text.trim());
      else setTranscribeError('Could not auto-transcribe. Type what you said below.');
    } catch (e) {
      setTranscribeError('Could not auto-transcribe. Type what you said below.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handlePlay = async () => {
    if (recordedUri) await playRecording(recordedUri);
  };

  const handleFill = () => {
    const res = parseVoiceText(transcript);
    setParsed(res);
    if (res.name) setName(res.name);
    if (res.qty !== undefined) setQuantity(res.qty.toString());
    if (res.price !== undefined) setPrice(res.price.toString());
    if (res.expiryDate) setExpiryDate(new Date(res.expiryDate));
    setShowConfirm(true);
  };

  const handleConfirm = () => setShowConfirm(false);

  const [name, setName] = useState('');
  const [itemSize, setItemSize] = useState('');
  const [category, setCategory] = useState('General Retail');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [branch, setBranch] = useState('Main Warehouse');
  const [saving, setSaving] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [safetyStock, setSafetyStock] = useState('10');
  const [salesCount, setSalesCount] = useState('0');
  const [productImage, setProductImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [scannedExpiryDate, setScannedExpiryDate] = useState<string | null>(null);
  const [showExpiryConfirm, setShowExpiryConfirm] = useState(false);
  const [expiryDateString, setExpiryDateString] = useState('');
  const [scannedProduction, setScannedProduction] = useState<string | null>(null);
  const [scannedRawText, setScannedRawText] = useState('');

  const [customerRequested, setCustomerRequested] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [marketDates, setMarketDates] = useState<string[]>([]);
  const [targetMarketDate, setTargetMarketDate] = useState(new Date());
  const [showMarketPicker, setShowMarketPicker] = useState(false);

  const addMarketDate = () => {
    const iso = targetMarketDate.toISOString();
    if (marketDates.some(d => new Date(d).toDateString() === targetMarketDate.toDateString())) {
      Alert.alert('Already added', 'That market date is already in the planner.');
      return;
    }
    setMarketDates([...marketDates, iso]);
  };

  const isExpiryPast = (() => {
    const d = expiryDate || (expiryDateString ? new Date(expiryDateString) : null);
    if (!d || isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(d);
    check.setHours(0, 0, 0, 0);
    return check < today;
  })();

  useEffect(() => {
    (async () => {
      try {
        const { user } = await getAuthSession();
        if (!user?.org_id) { router.replace('/phone-login'); return; }
        if (user?.currency_symbol) setCurrencySymbol(user.currency_symbol);
        const finalOrg = `ORG-${user.uid.slice(0, 6).toUpperCase()}`;
        const realOrgId = user.org_id || finalOrg;
        setOrgId(realOrgId);
        if (params?.barcode) setBarcode(String(params.barcode).trim());
        else {
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
      if (data.length >= 8 && /^\d+$/.test(data)) setBarcode(data);
      else setSku(data.trim().toUpperCase());
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

  const uploadImageIfNeeded = async (): Promise<string | null> => {
    if (!productImage) return null;
    if (productImage.startsWith('http')) return productImage;
    setUploading(true);
    try {
      const storage = getStorage();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let blob: Blob;
      try {
        const response = await fetch(productImage, { signal: controller.signal });
        blob = await response.blob();
      } finally { clearTimeout(timeoutId); }
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'product';
      const fileName = `products/${orgId}/${Date.now()}_${safeName}.jpg`;
      const storageRef = ref(storage, fileName);
      const url = await Promise.race([
        (async () => {
          await uploadBytes(storageRef, blob);
          return await getDownloadURL(storageRef);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Photo upload timed out after 15s.')), 15000)
        ),
      ]);
      return url;
    } catch (e: any) {
      console.log('upload failed', e);
      Alert.alert('Photo upload failed', 'Product will save without photo. Check Storage rules.');
      return null;
    } finally { setUploading(false); }
  };

  const formatExpiryForDisplay = (dateStr: string) => {
    const [y, mo, d] = dateStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(d)} ${monthNames[parseInt(mo) - 1]} ${y}`;
  };

  // FIXED: Gemini Vision - replaces OCR.space. Reads BB / B.B. / EXP in any format.
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
      const gemini = await readExpiryWithGemini(result.assets[0].base64);
      // Fallback: also run local parser on Gemini raw text, in case JSON missed a date
      const local = gemini.expiryDate ? null : parseExpiryFromText(gemini.rawText || '');
      const expiry = gemini.expiryDate || local?.expiryDate || null;
      if (!expiry) {
        Alert.alert('No Date Detected', 'No expiry date found. You can type it manually.');
        setShowDatePicker(true);
        return;
      }
      const year = Number(expiry.split('-')[0]);
      const nowYear = new Date().getFullYear();
      if (year < nowYear - 30 || year > nowYear + 30) {
        Alert.alert('Year Issue', `Detected year ${year} seems incorrect. Please retake.`);
        return;
      }
      setScannedExpiryDate(expiry);
      setScannedProduction(gemini.productionDate || local?.productionDate || null);
      setScannedRawText(gemini.rawText || '');
      setShowExpiryConfirm(true);
    } catch (e: any) {
      if (e.message?.includes('Gemini API key')) {
        Alert.alert('Not Configured', 'Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart, then type the date manually.');
        setShowDatePicker(true);
      } else {
        Alert.alert('Scan Failed', e.message || 'Could not read date. Please try again.');
      }
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (saving || uploading) return;
    if (!name.trim()) { Alert.alert('Validation', 'Enter product name.'); return; }
    if (!price || isNaN(Number(price))) { Alert.alert('Validation', 'Enter valid price.'); return; }
    if (customerRequested && !customerName.trim()) { Alert.alert('Validation', 'Enter customer name for customer request.'); return; }
    if (!orgId) { Alert.alert('Not Logged In', 'Please log in again to save products.'); router.replace('/phone-login'); return; }
    setSaving(true);
    try {
      let finalSku = sku.trim();
      if (!finalSku) {
        const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'PRD';
        finalSku = `${cleanName}-${barcode.slice(-4)}`;
      }
      const imageUrl = await uploadImageIfNeeded();
      const hasMarketPlan = customerRequested || marketDates.length > 0;
      const result = await Promise.race([
        addProduct({
          sku: finalSku, name: name.trim(), item_size: itemSize.trim() || null, category,
          price: parseFloat(price) || 0, cost: parseFloat(cost) || 0,
          quantity: parseInt(quantity, 10) || 0, branch, org_id: orgId, barcode,
          expiry_date: expiryDate ? expiryDate.toISOString().split('T')[0] : (expiryDateString || null),
          safety_stock: parseInt(safetyStock, 10) || 10, sales_count: parseInt(salesCount, 10) || 0,
          last_sold_date: salesCount !== '0' ? new Date().toISOString() : null,
          image_url: imageUrl, customer_requested: customerRequested, customer_name: customerRequested ? customerName.trim() : null, market_dates: marketDates,
        } as any),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Save timed out after 15s. Check internet / Firestore rules.')), 15000)),
      ]);
      if (result.success) {
        if (hasMarketPlan) {
          Alert.alert('Success', `Product + Market Plan saved to Customer Requests\n${name}${itemSize ? ` (${itemSize})` : ''}\nSKU: ${result.sku || finalSku}\nCheck Market tab.`, [
            { text: 'View Market', onPress: () => router.replace('/(tabs)/market') },
            { text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') },
          ]);
        } else {
          Alert.alert('Success', `Saved!\n${name}${itemSize ? ` (${itemSize})` : ''}\nSKU: ${result.sku || finalSku}`, [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }]);
        }
      } else { Alert.alert('Error', result.error || 'Failed'); }
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Save failed. Check internet and try again.');
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Add New Item</Text>
        <Text style={styles.subtitle}>Photo + Size enabled</Text>
      </View>
      <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>PRODUCT PHOTO</Text>
        {productImage ? (
          <View style={styles.photoPreviewCard}>
            <Image source={{ uri: productImage }} style={styles.photoPreview} />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => setProductImage(null)} style={[styles.pillBtn, { backgroundColor: '#7F1D1D', borderColor: '#EF4444' }]}>
                <Ionicons name="trash-outline" size={13} color="#fff" />
                <Text style={styles.pillText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={takeProductPhoto} style={styles.pillBtn}>
                <Ionicons name="camera-outline" size={13} color="#FDF6E9" />
                <Text style={styles.pillText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={takeProductPhoto} style={styles.photoBtn}>
              <Ionicons name="camera-outline" size={16} color="#FDF6E9" />
              <Text style={styles.photoBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickFromGallery} style={[styles.photoBtn, { backgroundColor: '#1E3A30' }]}>
              <Ionicons name="image-outline" size={16} color="#FDF6E9" />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.voiceCard}>
          <View style={styles.voiceHeader}>
            <Text style={styles.label}>VOICE INPUT</Text>
            <View style={styles.voiceToggleRow}>
              <Text style={styles.voiceToggleText}>{voiceEnabled ? 'On' : 'Off'}</Text>
              <Switch value={voiceEnabled} onValueChange={toggleVoice} trackColor={{ false: '#2A4A3E', true: '#FDF6E9' }} thumbColor={voiceEnabled ? '#0B3B2E' : '#8AA99B'} />
            </View>
          </View>
          {voiceEnabled ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!isRecording ? (
                  <TouchableOpacity onPress={handleStart} style={[styles.voiceBtn, { backgroundColor: '#EF4444' }]}>
                    <Ionicons name="mic-outline" size={16} color="#fff" />
                    <Text style={styles.voiceBtnText}>Start Recording</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={handleStop} style={[styles.voiceBtn, { backgroundColor: '#FDF6E9' }]}>
                    <Ionicons name="stop-outline" size={16} color="#0B3B2E" />
                    <Text style={[styles.voiceBtnText, { color: '#0B3B2E' }]}>Stop &amp; Transcribe</Text>
                  </TouchableOpacity>
                )}
                {recordedUri && !isRecording && (
                  <TouchableOpacity onPress={handlePlay} style={[styles.voiceBtn, { backgroundColor: '#1E3A30', borderWidth: 1, borderColor: '#2A4A3E' }]}>
                    <Ionicons name="play-outline" size={16} color="#FDF6E9" />
                    <Text style={styles.voiceBtnText}>Play</Text>
                  </TouchableOpacity>
                )}
              </View>
              {isRecording && <Text style={styles.recordingText}>● Recording... tap Stop when done</Text>}
              {isTranscribing && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <ActivityIndicator size="small" color="#FDF6E9" />
                  <Text style={{ color: '#8AA99B', fontSize: 12 }}>Transcribing...</Text>
                </View>
              )}
              {!!transcribeError && <Text style={styles.voiceHint}>{transcribeError}</Text>}
              <Text style={[styles.label, { marginTop: 12 }]}>TRANSCRIPT - TYPE OR EDIT</Text>
              <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="e.g. Milo 400g 10 pieces 2500 naira" placeholderTextColor="#8AA99B" value={transcript} onChangeText={setTranscript} multiline />
              <TouchableOpacity onPress={handleFill} disabled={!transcript.trim()} style={[styles.voiceFillBtn, !transcript.trim() && { opacity: 0.5 }]}>
                <Text style={styles.voiceFillText}>Fill Form From Voice / Text</Text>
              </TouchableOpacity>
              <Text style={styles.voiceHint}>Auto-transcribe will fill this box. You can always type or correct it before filling.</Text>
            </>
          ) : (<Text style={styles.voiceHint}>Turn voice on to record, auto-transcribe, or type your product details.</Text>)}
        </View>
        <Text style={styles.label}>PRODUCT SKU (Optional)</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Auto if blank" placeholderTextColor="#8AA99B" value={sku} onChangeText={setSku} autoCapitalize="characters" />
          <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}>
            <Ionicons name="barcode-outline" size={15} color="#FDF6E9" />
            <Text style={styles.scanBtnText}>Scan</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.barcodeCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.barcodeLabel}>BARCODE (EAN-13)</Text>
            <TouchableOpacity onPress={regenerateBarcode}><Text style={styles.regenText}>Regenerate</Text></TouchableOpacity>
          </View>
          <Text style={styles.barcodeNumber}>{barcode || '...'}</Text>
        </View>
        <Text style={styles.label}>PRODUCT NAME *</Text>
        <TextInput style={styles.input} placeholder="e.g. Milo" placeholderTextColor="#8AA99B" value={name} onChangeText={setName} />
        <Text style={styles.label}>ITEM SIZE / WEIGHT (Optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. 18g, 400ml, 1kg" placeholderTextColor="#8AA99B" value={itemSize} onChangeText={setItemSize} />
        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.categoryRow}>
          {['General Retail', 'Electronics', 'Groceries', 'Packaging'].map(cat => (
            <TouchableOpacity key={cat} style={[styles.catPill, category === cat && styles.catPillActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.catPillText, category === cat && styles.catPillTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>SELLING PRICE ({currencySymbol}) *</Text>
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#8AA99B" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.label}>ESTIMATED MARKET UNIT COST ({currencySymbol})</Text>
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#8AA99B" keyboardType="decimal-pad" value={cost} onChangeText={setCost} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>INITIAL QTY</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={quantity} onChangeText={setQuantity} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.label}>SAFETY STOCK</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={safetyStock} onChangeText={setSafetyStock} />
          </View>
        </View>
        <Text style={styles.label}>EXPIRY DATE</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.scanBtn, { flex: 1, marginLeft: 0 }]} onPress={scanExpiryDate} disabled={ocrLoading}>
            {ocrLoading ? <ActivityIndicator size="small" color="#FDF6E9" /> : <><Ionicons name="camera-outline" size={15} color="#FDF6E9" /><Text style={styles.scanBtnText}>Scan Expiry</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.scanBtn, { flex: 1 }]} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="create-outline" size={15} color="#FDF6E9" />
            <Text style={styles.scanBtnText}>Type Manually</Text>
          </TouchableOpacity>
        </View>
        {(expiryDate || expiryDateString) && (
          <View style={{ backgroundColor: '#1E3A30', padding: 10, borderRadius: 8, marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#FDF6E9', fontSize: 13 }}>Expiry: {expiryDate ? expiryDate.toLocaleDateString('en-GB') : expiryDateString}</Text>
            {isExpiryPast && <Text style={{ color: '#fff', backgroundColor: '#EF4444', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' }}>Expired</Text>}
            <TouchableOpacity onPress={() => { setExpiryDate(null); setExpiryDateString(''); }}><Text style={{ color: '#EF4444', fontSize: 11, marginTop: 4 }}>Clear date</Text></TouchableOpacity>
          </View>
        )}
        {showDatePicker && (
          <DateTimePicker value={expiryDate || new Date()} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={new Date(2000, 0, 1)} maximumDate={new Date(2100, 11, 31)} onChange={(e, d) => { if (Platform.OS === 'android') setShowDatePicker(false); if (d) { setExpiryDate(d); setExpiryDateString(''); } }} />
        )}

        <View style={styles.marketCard}>
          <Text style={styles.label}>MARKET PURCHASE PLANNER</Text>
          <TouchableOpacity onPress={() => setCustomerRequested(!customerRequested)} style={styles.checkRow}>
            <View style={[styles.checkBox, customerRequested && styles.checkBoxActive]}>
              {customerRequested ? <Ionicons name="checkmark" size={16} color="#0B3B2E" /> : null}
            </View>
            <Text style={styles.checkText}>Customer requested this item</Text>
          </TouchableOpacity>
          {customerRequested && (
            <>
              <Text style={styles.label}>CUSTOMER NAME *</Text>
              <TextInput style={styles.input} placeholder="e.g. Mrs. Adebayo" placeholderTextColor="#8AA99B" value={customerName} onChangeText={setCustomerName} />
            </>
          )}
          <Text style={styles.label}>TARGET MARKET DATE</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowMarketPicker(true)}>
            <Text style={{ color: '#FFF' }}>{targetMarketDate.toLocaleDateString('en-GB')}</Text>
          </TouchableOpacity>
          {showMarketPicker && (
            <DateTimePicker value={targetMarketDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(e, d) => { if (Platform.OS === 'android') setShowMarketPicker(false); if (d) setTargetMarketDate(d); }} />
          )}
          <TouchableOpacity onPress={addMarketDate} style={styles.marketBtn}>
            <Text style={styles.marketBtnText}>+ Add Date to Planner</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {marketDates.map((d, i) => (
              <TouchableOpacity key={i} onPress={() => setMarketDates(marketDates.filter(x => x !== d))} style={styles.datePill}>
                <Text style={styles.datePillText}>{new Date(d).toLocaleDateString('en-GB')}  ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSubmit} disabled={saving || uploading}>
          {saving || uploading ? <ActivityIndicator color="#0B3B2E" /> : <Text style={styles.saveBtnText}>{uploading ? 'Uploading Photo...' : (customerRequested || marketDates.length > 0 ? 'Save Product + Market Plan' : 'Save Product')}</Text>}
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
      <Modal visible={showConfirm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={{ color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Check Voice Details</Text>
            <Text style={{ color: '#8AA99B', fontSize: 13, marginBottom: 16 }}>We filled the form from your voice / text. Confirm or edit in the form.</Text>
            <View style={{ backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, marginBottom: 16 }}>
              <Text style={{ color: '#FDF6E9', fontSize: 13 }}>Name: {parsed?.name || name || '-'}</Text>
              <Text style={{ color: '#FDF6E9', fontSize: 13, marginTop: 4 }}>Qty: {parsed?.qty ?? quantity}</Text>
              <Text style={{ color: '#FDF6E9', fontSize: 13, marginTop: 4 }}>Price: {parsed?.price ?? price}</Text>
              <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 8 }}>Heard: {transcript}</Text>
            </View>
            <TouchableOpacity style={{ backgroundColor: '#FDF6E9', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 }} onPress={handleConfirm}><Text style={{ color: '#0B3B2E', fontWeight: '800', fontSize: 15 }}>Use These Values</Text></TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2A4A3E' }} onPress={() => setShowConfirm(false)}><Text style={{ color: '#FDF6E9', fontWeight: '700', fontSize: 15 }}>Edit Manually</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showExpiryConfirm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={{ color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Scanned Expiry Date</Text>
            <Text style={{ color: '#8AA99B', fontSize: 13, marginBottom: 16 }}>Please confirm this is correct before saving.</Text>
            <View style={{ backgroundColor: '#1E3A30', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#FDF6E9', fontSize: 28, fontWeight: '800' }}>{scannedExpiryDate ? formatExpiryForDisplay(scannedExpiryDate) : ''}</Text>
              {scannedProduction && <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 6 }}>Production: {formatExpiryForDisplay(scannedProduction)}</Text>}
            </View>
            {scannedRawText ? <Text style={{ color: '#8AA99B', fontSize: 11, marginBottom: 12 }}>Label text: "{scannedRawText.slice(0, 120)}"</Text> : null}
            <TouchableOpacity style={{ backgroundColor: '#FDF6E9', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 }} onPress={() => { if (scannedExpiryDate) { setExpiryDateString(scannedExpiryDate); setExpiryDate(null); } setShowExpiryConfirm(false); setScannedExpiryDate(null); }}><Text style={{ color: '#0B3B2E', fontWeight: '800', fontSize: 15 }}>Use This Date</Text></TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#2A4A3E' }} onPress={() => { setShowExpiryConfirm(false); setScannedExpiryDate(null); scanExpiryDate(); }}><Text style={{ color: '#FDF6E9', fontWeight: '700', fontSize: 15 }}>Retake</Text></TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2A4A3E' }} onPress={() => { setShowExpiryConfirm(false); setScannedExpiryDate(null); setShowDatePicker(true); }}><Text style={{ color: '#FDF6E9', fontWeight: '700', fontSize: 15 }}>Type Manually</Text></TouchableOpacity>
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
  voiceCard: { backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E', marginTop: 16 },
  voiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voiceToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceToggleText: { color: '#FDF6E9', fontSize: 12, fontWeight: '700' },
  voiceBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  voiceBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  recordingText: { color: '#EF4444', fontSize: 12, fontWeight: '700', marginTop: 10 },
  voiceFillBtn: { backgroundColor: '#FDF6E9', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  voiceFillText: { color: '#0B3B2E', fontWeight: '800', fontSize: 14 },
  voiceHint: { color: '#8AA99B', fontSize: 11, marginTop: 8, lineHeight: 16 },
  marketCard: { backgroundColor: '#1E3A30', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E', marginTop: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#8AA99B', backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: '#FDF6E9', borderColor: '#FDF6E9' },
  checkText: { color: '#FDF6E9', fontSize: 13, fontWeight: '700' },
  marketBtn: { backgroundColor: '#1E3A30', borderWidth: 1, borderColor: '#F59E0B', padding: 12, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  marketBtnText: { color: '#FBBF24', fontWeight: '700' },
  datePill: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  datePillText: { color: '#000', fontWeight: '700', fontSize: 12 },
});