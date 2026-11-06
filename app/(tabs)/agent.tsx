import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Image, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addProduct, generateUniqueBarcode, getAuthSession } from '../../services/inventoryService';

type Msg = { role: 'user' | 'agent', text: string, image?: string, time?: string };

export default function AgentScreen() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'agent', text: 'Hi! I am SmartStock Agent. Tap SCAN below to register a product, or tap SCAN ME above to visit the website.', time: new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true }) }
  ]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastParsed, setLastParsed] = useState<{ name: string, imageUri?: string, qty?: string, detectedText?: string, nafdacNo?: string } | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [scanMode, setScanMode] = useState<'website' | 'register'>('register');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [scannedLink, setScannedLink] = useState('');
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editSize, setEditSize] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const speak = (t: string) => { Speech.stop(); Speech.speak(t, { language: 'en', rate: 0.95 }); };
  const addMsg = (role: 'user' | 'agent', text: string, image?: string, shouldSpeak = false) => {
    const time = new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
    setMsgs(p => [...p, { role, text, image, time }]);
    if (shouldSpeak && role === 'agent') speak(text);
  };

  const handleTopScanMe = () => {
    setScanMode('website');
    openScanner();
  };

  const handleBottomScanMe = () => {
    setScanMode('register');
    openScanner();
  };

  const openScanner = async () => {
    if (!permission?.granted) { await requestPermission(); }
    scannedRef.current = false;
    setShowBarcode(true);
  };

  const pickImageFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera permission needed');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
    if (!res.canceled) { const uri = res.assets[0].uri; const b64 = res.assets[0].base64!; addMsg('user', 'Label photo captured', uri); readLabel(b64, uri); }
  };
  const pickImageFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });
    if (!res.canceled) { const uri = res.assets[0].uri; const b64 = res.assets[0].base64!; addMsg('user', 'Label photo selected', uri); readLabel(b64, uri); }
  };

  const readLabel = async (base64: string, uri: string) => {
    setOcrLoading(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_OCR_API_KEY;
      if (!apiKey) throw new Error('OCR key not configured');
      const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', headers: { 'apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `base64Image=data:image/jpeg;base64,${base64}&language=eng` });
      const data = await response.json();
      const text = data?.ParsedResults?.[0]?.ParsedText || '';
      const lines = text.split('\n').filter((l: string) => l.trim().length > 2);
      const nameGuess = lines[0]?.slice(0, 60)?.trim() || '';
      const qtyMatch = text.match(/(\d+)\s*(g|kg|ml|l|pcs)/i);
      const sizeGuess = qtyMatch ? `${qtyMatch[1]}${qtyMatch[2].toLowerCase()}` : '';
      const nafdacMatch = text.match(/NAFDAC[^0-9A-Z]*([A-Z0-9-]{4,})/i);
      const nafdacNo = nafdacMatch ? nafdacMatch[1] : '';
      setLastParsed({ name: nameGuess, imageUri: uri, qty: '1', detectedText: text, nafdacNo });
      setEditName(nameGuess); setEditQty('1'); setEditSize(sizeGuess);
      addMsg('agent', `I read ${nameGuess || 'label'}. Approve to save.`, undefined, true); setShowApproveModal(true);
    } catch (e) { addMsg('agent', 'Could not read label. Type name.', undefined, true); setLastParsed({ name: '', imageUri: uri, detectedText: '' }); setEditName(''); setEditSize(''); setShowApproveModal(true); }
    setOcrLoading(false);
  };

  const isLink = (data: string) => {
    const d = data.toLowerCase();
    return data.startsWith('http://') || data.startsWith('https://') || data.startsWith('www.') || data.includes('://') || d.includes('qrco.de') || d.includes('qru.') || d.includes('rfc.frl');
  };

  const onBarcodeScanned = (result: any) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    const data = result?.data || result?.raw || '';
    if (!data) { scannedRef.current = false; return; }
    setShowBarcode(false);
    const cleanData = data.trim();

    if (scanMode === 'website') {
      if (isLink(cleanData)) {
        const url = cleanData.startsWith('www.') ? `https://${cleanData}` : cleanData;
        setScannedLink(url);
        setShowVerifyModal(true);
        addMsg('user', `Scanned link`);
        addMsg('agent', `Link found. Tap Open Website below to visit the website.`, undefined, true);
      } else {
        addMsg('agent', 'That is not a website QR. Scan a website QR code.', undefined, true);
      }
      setTimeout(() => { scannedRef.current = false; }, 1000);
      return;
    }

    if (isLink(cleanData)) {
      addMsg('agent', 'That is a website link, not a product barcode. Use the top SCAN ME for links.', undefined, true);
      setTimeout(() => { scannedRef.current = false; }, 1000);
      return;
    }

    addMsg('user', `Barcode: ${cleanData}`);
    setEditName(`Product ${cleanData.slice(-6)}`); setEditQty('1'); setEditSize('');
    setLastParsed({ name: `Product ${cleanData.slice(-6)}`, qty: '1', detectedText: `Barcode ${cleanData}`, imageUri: '' });
    addMsg('agent', `Barcode ${cleanData} scanned.`, undefined, true);
    setShowApproveModal(true);
    setTimeout(() => { scannedRef.current = false; }, 1000);
  };

  const handleApproveAndRegister = async () => {
    if (!editName.trim()) { setNameError(true); Alert.alert('Name Required', 'Type name'); return; }
    setNameError(false); setSaving(true);
    try {
      const session = await getAuthSession();
      const user = (session as any)?.user || null;
      const orgId = user?.org_id;
      if (!orgId || !user) {
        Alert.alert('Login required', 'Please log in again to register products.');
        router.replace('/phone-login');
        return;
      }
      const barcode = await generateUniqueBarcode(orgId);
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });

      const result = await addProduct({
        org_id: orgId,
        name: editName.trim(),
        sku: `SKU-${Date.now()}`,
        barcode,
        item_size: editSize || '',
        quantity: parseInt(editQty) || 1,
        category: 'General',
        price: 0,
        cost: 0,
        safety_stock: 10,
        image_url: lastParsed?.imageUri || null,
      });
      if (!result.success) throw new Error(result.error || 'Failed to save product');
      addMsg('agent', `Registered "${editName}" at ${timeString}!`, undefined, true);
      setShowApproveModal(false); setEditName(''); setEditQty('1'); setEditSize(''); setLastParsed(null);
    } catch (err: any) { Alert.alert('Register failed', err?.message || 'Error'); }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View><Text style={styles.headerTitle}>SmartStock Agent</Text><Text style={styles.headerSub}>{scannedLink ? 'Link ready - tap Open Website below' : 'Scan below to register a product'}</Text></View>
        <TouchableOpacity onPress={handleTopScanMe} style={styles.onBadge}>
          <Ionicons name="globe-outline" size={14} color="#FDF6E9" />
          <Text style={styles.onText}>SCAN ME</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.chat} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {msgs.map((m, i) => (
          <TouchableOpacity key={i} onPress={() => m.role === 'agent' && speak(m.text)} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.agentBubble]}>
            {m.image ? <Image source={{ uri: m.image }} style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 8 }} /> : null}
            <Text style={styles.bubbleText}>{m.text}</Text>
            <Text style={{ color: '#8AA99B', fontSize: 10, marginTop: 6, textAlign: 'right' }}>{m.time}</Text>
          </TouchableOpacity>
        ))}
        {ocrLoading && <View style={[styles.bubble, styles.agentBubble]}><ActivityIndicator color="#FDF6E9" /><Text style={styles.bubbleText}>Reading label...</Text></View>}
      </ScrollView>
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={pickImageFromGallery} style={styles.iconBtn}><Ionicons name="image-outline" size={20} color="#FDF6E9" /></TouchableOpacity>
        <TouchableOpacity onPress={pickImageFromCamera} style={styles.iconBtn}><Ionicons name="camera-outline" size={20} color="#FDF6E9" /></TouchableOpacity>
        <TouchableOpacity onPress={handleBottomScanMe} style={styles.scanBtn}><Ionicons name="barcode-outline" size={16} color="#0B3B2E" /><Text style={{ color: '#0B3B2E', fontSize: 8, fontWeight: '800' }}>SCAN</Text></TouchableOpacity>
        <TextInput value={input} onChangeText={setInput} placeholder="Type a message..." placeholderTextColor="#8AA99B" style={styles.input} />
        <TouchableOpacity onPress={() => { if (!input.trim()) return; addMsg('user', input); setEditName(input); setEditQty('1'); setEditSize(''); setLastParsed({ name: input, qty: '1' }); addMsg('agent', `Got ${input}, approve to save`, undefined, true); setShowApproveModal(true); setInput(''); }} style={styles.sendBtn}><Ionicons name="send" size={18} color="#fff" /></TouchableOpacity>
      </View>

      <Modal visible={showVerifyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="globe-outline" size={28} color="#FDF6E9" /></View>
              <Text style={{ color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginTop: 12 }}>Website Link Found</Text>
              <Text style={{ color: '#8AA99B', fontSize: 13, marginTop: 6, textAlign: 'center' }}>Tap below to open it in your browser</Text>
              <TouchableOpacity onPress={() => { Linking.openURL(scannedLink); setScannedLink(''); setShowVerifyModal(false); }} style={{ backgroundColor: '#0B3B2E', paddingVertical: 16, width: '100%', borderRadius: 12, marginTop: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="open-outline" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Open Website</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setScannedLink(''); setShowVerifyModal(false); }} style={{ backgroundColor: '#1E3A30', paddingVertical: 14, width: '100%', borderRadius: 12, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showApproveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Review & Approve</Text>
            <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 6 }}>{new Date().toLocaleString('en-NG')}</Text>
            {lastParsed?.imageUri ? <Image source={{ uri: lastParsed.imageUri }} style={{ width: '100%', height: 150, borderRadius: 10, marginTop: 12 }} /> : null}
            <Text style={styles.label}>PRODUCT NAME *</Text>
            <TextInput value={editName} onChangeText={(t) => { setEditName(t); if (t.trim()) setNameError(false); }} style={[styles.editInput, nameError ? { borderColor: '#EF4444', borderWidth: 2 } : {}]} placeholder="Product name" placeholderTextColor="#8AA99B" />
            <Text style={styles.label}>QUANTITY</Text><TextInput value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={styles.editInput} placeholder="1" placeholderTextColor="#8AA99B" />
            <Text style={styles.label}>SIZE (e.g. 900g, 1L)</Text><TextInput value={editSize} onChangeText={setEditSize} style={styles.editInput} placeholder="900g" placeholderTextColor="#8AA99B" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity onPress={() => setShowApproveModal(false)} style={[styles.primaryBtn, { flex: 1, backgroundColor: '#1E3A30' }]}><Text style={styles.primaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleApproveAndRegister} style={[styles.primaryBtn, { flex: 1, backgroundColor: editName.trim() ? '#0B3B2E' : '#334155' }]} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Approve</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showBarcode} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }} onBarcodeScanned={onBarcodeScanned} />
          <View style={{ position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, backgroundColor: '#0B3B2E', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}>{scanMode === 'website' ? 'Scan website QR' : 'Scan product barcode'}</Text></View>
          <TouchableOpacity onPress={() => setShowBarcode(false)} style={{ position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24 }}><Text style={{ fontWeight: '800' }}>Close</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#0B3B2E' },
  headerTitle: { color: '#FDF6E9', fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#8AA99B', fontSize: 11, marginTop: 2 },
  onBadge: { backgroundColor: '#1E3A30', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#2A4A3E' },
  onText: { color: '#FDF6E9', fontSize: 11, fontWeight: '700' },
  chat: { flex: 1 },
  bubble: { padding: 14, borderRadius: 14, marginBottom: 10, maxWidth: '85%' },
  agentBubble: { backgroundColor: '#1E3A30', alignSelf: 'flex-start' },
  userBubble: { backgroundColor: '#0B3B2E', alignSelf: 'flex-end', borderWidth: 1, borderColor: '#2A4A3E' },
  bubbleText: { color: '#FDF6E9', fontSize: 14, lineHeight: 20 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#0B3B2E', paddingBottom: 28 },
  iconBtn: { backgroundColor: '#1E3A30', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scanBtn: { backgroundColor: '#FDF6E9', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: '#1E3A30', color: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  sendBtn: { backgroundColor: '#1E3A30', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A4A3E' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  editInput: { backgroundColor: '#1E3A30', color: '#fff', padding: 12, borderRadius: 10 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});