import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Image, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { startRecording, stopRecording, transcribeRecording, useVoiceService } from '../../services/voiceService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addProduct, generateUniqueBarcode, getAuthSession, getInventory } from '../../services/inventoryService';
import { recordExpiry } from '../../services/expiryHistoryService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { logProductHistory } from '../../services/historyService';

type Msg = { role: 'user' | 'agent', text: string, image?: string, time?: string };
type ParsedLabel = {
  name: string; size: string; expiryDate: string; productionDate: string;
  batchNo: string; nafdacNo: string; barcode: string; supplier: string;
  expiryVisible?: boolean; whereToFindExpiry?: string; rawText?: string;
};
type PendingAction =
  | { kind: 'addProduct', data: any }
  | { kind: 'recordDisposal', data: any }
  | null;

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

function formatDate(raw: any): string {
  if (!raw) return '-';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toISODate(input: string): string {
  if (!input) return '';
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dm = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dm) {
    const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
    return `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  }
  const my = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if (my) {
    const y = Number(my[2]); const m = Number(my[1]);
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }
  const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', SEPT: '09', OCT: '10', NOV: '11', DEC: '12' };
  const tm = s.toUpperCase().match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s+(\d{4})$/);
  if (tm) return `${tm[3]}-${months[tm[2]]}-${tm[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}
const GROQ_TEXT_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
const GROQ_VISION_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const norm = (s: any) => String(s || '').toLowerCase().trim();

async function callGemini(prompt: string, imageBase64?: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing in .env');
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const parts: any[] = [{ text: prompt }];
      if (imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2 } }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok) {
        const out = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim() || '';
        if (out) return out;
        lastErr = 'Empty response from Gemini';
        continue;
      }
      lastErr = data?.error?.message || 'Gemini request failed';
      if (/API_KEY_INVALID|invalid api key|unauthenticated/i.test(lastErr)) break;
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? 'Gemini timed out after 25s' : String(e?.message || e);
      break;
    }
  }
  throw new Error(lastErr || 'Gemini request failed');
}

async function callGroq(prompt: string, imageBase64?: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq key missing in .env');
  const models = imageBase64 ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS;
  let lastErr = '';
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: imageBase64
            ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }]
            : prompt }],
          temperature: 0.2,
          ...(imageBase64 ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok) {
        const out = data?.choices?.[0]?.message?.content || '';
        if (out.trim()) return out;
        lastErr = 'Empty response from Groq';
        continue;
      }
      lastErr = data?.error?.message || 'Groq request failed';
      if (String(lastErr).toLowerCase().includes('invalid api key') || String(lastErr).toLowerCase().includes('unauthenticated')) break;
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? 'Groq timed out after 25s' : String(e?.message || e);
      break;
    }
  }
  if (imageBase64) return callGemini(prompt, imageBase64);
  throw new Error(lastErr);
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export default function AgentScreen() {
  const router = useRouter();
  useVoiceService();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'agent', text: 'Hi, I am SmartStock Agent. Send a photo of a product label and I will read the name, expiry date, batch and supplier. Or type a question, for example: What expires in the next 7 days? Or: Record 2 units of Mufa Nala as thrown away.', time: new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true }) }
  ]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastParsed, setLastParsed] = useState<{ name: string, imageUri?: string, qty?: string, detectedText?: string, nafdacNo?: string, barcode?: string } | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [showBarcode, setShowBarcode] = useState(false);
  const [scanMode, setScanMode] = useState<'website' | 'register'>('register');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [scannedLink, setScannedLink] = useState('');
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editSize, setEditSize] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [editBatch, setEditBatch] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editPrice, setEditPrice] = useState('0');
  const [editCost, setEditCost] = useState('0');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [expiryError, setExpiryError] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const chatScrollRef = useRef<any>(null);
  // NEW: duplicate + no-expiry guards
  const [duplicateInfo, setDuplicateInfo] = useState<any | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [noExpiry, setNoExpiry] = useState(false);

  useEffect(() => {
   setTimeout(() => (chatScrollRef.current as any)?.scrollToEnd({ animated: true }), 100);
  }, [msgs, ocrLoading, chatLoading]);

  const speak = useCallback((t: string) => {
    if (muted) return;
    Speech.stop();
    const short = t.length > 400 ? t.slice(0, 400) : t;
    Speech.speak(short, { language: 'en', rate: 0.95 });
  }, [muted]);

  const addMsg = (role: 'user' | 'agent', text: string, image?: string, shouldSpeak = false) => {
    const time = new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
    setMsgs(p => [...p, { role, text, image, time }]);
    if (shouldSpeak && role === 'agent') speak(text);
  };

  const handleTopScanMe = () => { setScanMode('website'); openScanner(); };
  const handleBottomScanMe = () => { setScanMode('register'); openScanner(); };
  const openScanner = async () => {
    if (!permission?.granted) { await requestPermission(); }
    scannedRef.current = false;
    setShowBarcode(true);
  };

  const resetApproveState = () => {
    setDuplicateInfo(null); setAllowDuplicate(false); setNoExpiry(false);
    setNameError(false); setPriceError(false); setExpiryError(false);
  };

  const startListening = async () => {
    if (listening) {
      setListening(false);
      setChatLoading(true);
      try {
        const uri = await stopRecording();
        if (!uri) {
          addMsg('agent', "I didn't capture any audio. Tap the mic, speak 2-3 seconds, tap again.", undefined, true);
          return;
        }
        const heard = await Promise.race([
          transcribeRecording(uri),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('Transcription timed out after 35s - check internet / Groq key')), 35000)),
        ]);
        if (heard?.trim()) {
          await handleSend(heard.trim());
        } else {
          addMsg('agent', "I heard you, but couldn't make out the words. Please type it.", undefined, true);
        }
      } catch (e: any) {
        console.log('VOICE ERROR:', e?.message);
        addMsg('agent', `Voice failed: ${e?.message || e}. Please type it instead.`, undefined, true);
      } finally {
        setChatLoading(false);
      }
      return;
    }
    try {
      await startRecording();
      setListening(true);
    } catch (e: any) {
      Alert.alert('Mic not available', String(e?.message || 'Please type instead.'));
    }
  };

  const pickImageFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission required', 'Allow camera access to capture a label photo.');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (!res.canceled) { const uri = res.assets[0].uri; const b64 = res.assets[0].base64!; addMsg('user', 'Label photo captured', uri); readLabel(b64, uri); }
  };
  const pickImageFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
    if (!res.canceled) { const uri = res.assets[0].uri; const b64 = res.assets[0].base64!; addMsg('user', 'Label photo selected', uri); readLabel(b64, uri); }
  };

  const readLabel = async (base64: string, uri: string) => {
    setOcrLoading(true);
    resetApproveState();
    try {
      const session = await getAuthSession();
      const orgId = session?.user?.org_id;
      setCurrencySymbol(session?.user?.currency_symbol || '₦');
      const prompt = `You are SmartStock label reader. Read this product label photo like a human shopkeeper would - look at the actual print, don't assume what should be there.
Return ONLY valid JSON, no markdown, no explanation:
{"name":"", "size":"", "expiryDate":"", "productionDate":"", "batchNo":"", "nafdacNo":"", "barcode":"", "supplier":"", "expiryVisible":true, "whereToFindExpiry":"", "rawText":""}
Rules:
- name: product brand + product name as printed, e.g. "Mamudia HERO Eau de Parfum", "RC Orange". NEVER leave empty if you can read any brand/product text. This is the most important field.
- size: e.g. "100ml", "500ml", "900g", "1kg". Empty string if NOT visible. Never guess. A perfume is NOT 900g.
- expiryDate: the EXPIRY date. Look for ALL of these, different companies use different ones: EXP / EXPIRY / USE BY / BEST BEFORE / BEST BEFORE END / BBE / BB / B.B. - they all mean expiry. Formats: BB 01/11/26, B.B. 23/04/29, BB 12/2027, BB 06 NOV 2026, EXP 26-10-2026, BEST BEFORE END: 06/11/2026. PD / MFD is NOT expiry. Return as YYYY-MM-DD. If only MM/YYYY, use last day of month. Empty if not visible.
- productionDate: PD / MFD / Production Date only, as YYYY-MM-DD. Empty if not visible. Never put production date in expiryDate.
- batchNo: BN / BTH No / Batch / Lot only. Empty if not visible. A time like 14:33 or a code like 111506639 is NOT a date.
- nafdacNo: NAFDAC Reg No if visible, else empty.
- barcode: numbers under barcode if visible, else empty.
- supplier: manufacturer / producer name if visible, else empty.
- expiryVisible: true if you can see an expiry date in this photo, false if it is not on this side.
- whereToFindExpiry: if expiryVisible is false, say where a shopkeeper would look next, e.g. "Flip bottle - check bottom / back / crimp seal / neck / cap" else empty.
- rawText: all text you can read, one line. Quote what you actually saw, e.g. "BB 01/11/26" - do not clean it up.
- NEVER return all empty because expiry is missing. If you can read the name, return the name.
- Never guess a date or size. Empty is correct when not visible. If it is blurry, cut off, or glared, leave that field empty - do not invent it.`;
      const raw = await callGroq(prompt, base64);
      const parsed = extractJson(raw) as ParsedLabel | null;
      if (!parsed) throw new Error('Could not parse label. AI returned: ' + raw.slice(0, 200));
      const expiryISO = toISODate(parsed.expiryDate || '');
      const prodISO = toISODate(parsed.productionDate || '');
      setLastParsed({ name: parsed.name || '', imageUri: uri, qty: '1', detectedText: parsed.rawText || raw, nafdacNo: parsed.nafdacNo || '', barcode: parsed.barcode || '' });
      setEditName(parsed.name || ''); setEditQty('1'); setEditSize(parsed.size || '');
      setEditExpiry(expiryISO); setEditBatch(parsed.batchNo || ''); setEditSupplier(parsed.supplier || '');
      // Price memory + duplicate check: barcode first, then name
      let matched: any = null;
      try {
        if (orgId) {
          const all = await getInventory(orgId);
          matched = all.find((p: any) => parsed.barcode && norm(p.barcode) === norm(parsed.barcode))
            || all.find((p: any) => parsed.name && norm(p.name) === norm(parsed.name));
          if (matched) {
            setDuplicateInfo(matched);
            setEditPrice(String(matched.price ?? 0));
            setEditCost(String(matched.cost ?? 0));
            if (!parsed.supplier && matched.supplier) setEditSupplier(matched.supplier);
            if (!parsed.size && matched.item_size) setEditSize(matched.item_size);
          } else {
            setEditPrice('0'); setEditCost('0');
          }
        } else { setEditPrice('0'); setEditCost('0'); }
      } catch { setEditPrice('0'); setEditCost('0'); }
      let summary = '';
      if (parsed.name) {
        summary = `${parsed.name}${parsed.size ? ` (${parsed.size})` : ''}`;
        if (expiryISO) summary += `\nExpiry: ${formatDate(expiryISO)}`;
        else summary += `\nExpiry: Not visible on this side. ${parsed.whereToFindExpiry || 'Flip bottle - check bottom / back / crimp seal, then take a 2nd photo or type it.'}`;
        if (prodISO) summary += `\nProduction: ${formatDate(prodISO)}`;
        if (parsed.batchNo) summary += `\nBatch: ${parsed.batchNo}`;
        if (parsed.supplier) summary += `\nSupplier: ${parsed.supplier}`;
        if (parsed.nafdacNo) summary += `\nNAFDAC: ${parsed.nafdacNo}`;
        if (matched) summary += `\n\n⚠️ Already in stock: ${matched.total_stock} units at ${currencySymbol}${matched.price}. Price pre-filled from last sale. Check duplicate banner before approving.`;
        summary += `\n\nReview and confirm to save.`;
      } else {
        summary = 'I could not read a product name from this photo. Please take a clearer, closer photo of the label, or type the name and expiry date, then confirm.';
      }
      addMsg('agent', summary, undefined, true);
      setShowApproveModal(true);
    } catch (e: any) {
      console.log('READLABEL ERROR:', e?.message);
      addMsg('agent', e.message?.includes('API key') ? 'AI is not configured. Add EXPO_PUBLIC_GROQ_API_KEY to .env and restart the app.' : `I could not read this label. AI error: ${e?.message || e}`, undefined, true);
      setLastParsed({ name: '', imageUri: uri, detectedText: '' });
      setEditName(''); setEditSize(''); setEditExpiry(''); setEditBatch(''); setEditSupplier('');
      setEditPrice('0'); setEditCost('0');
      setShowApproveModal(true);
    } finally {
      setOcrLoading(false);
    }
  };

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    if (!overrideText) setInput('');
    addMsg('user', text);
    setChatLoading(true);
    try {
      const session = await getAuthSession();
      const user = session?.user as any;
      const orgId = user?.org_id;
      const symbol = user?.currency_symbol || '₦';
      setCurrencySymbol(symbol);
      if (!orgId) { addMsg('agent', 'Please log in again to use SmartStock Agent.', undefined, true); return; }
      const items = await getInventory(orgId);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfToday.getDate() - 1);
      const in7 = new Date(); in7.setDate(now.getDate() + 7);
      const in30 = new Date(); in30.setDate(now.getDate() + 30);
      const in7End = new Date(in7); in7End.setHours(23, 59, 59, 999);
      const byDate = (d: any) => d ? new Date(d) : null;
      const isYesterday = (p: any) => { const d = byDate(p.expiry_date); return d && d >= startOfYesterday && d < startOfToday; };
      const isToday = (p: any) => { const d = byDate(p.expiry_date); return d && d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000); };
      const expiring7 = items.filter((p: any) => { const d = byDate(p.expiry_date); return d && d >= now && d <= in7End; });
      const expiring30 = items.filter((p: any) => { const d = byDate(p.expiry_date); return d && d >= now && d <= in30; });
      const expired = items.filter((p: any) => { const d = byDate(p.expiry_date); return d && d < now; });
      const expiredYesterday = items.filter(isYesterday);
      const expiredToday = items.filter(isToday);
      const lowStock = items.filter((p: any) => (p.total_stock || 0) <= (p.safety_stock || 10));
      const val = (list: any[]) => list.reduce((a, p) => a + (Number(p.total_stock || 0) * Number(p.cost || 0)), 0);
      const priceVal = (list: any[]) => list.reduce((a, p) => a + (Number(p.total_stock || 0) * Number(p.price || 0)), 0);
      const qty = (list: any[]) => list.reduce((a, p) => a + Number(p.total_stock || 0), 0);
      const lowerWhy = text.toLowerCase();
      if (lowerWhy.includes('why did it fail') || lowerWhy.includes('why did it') || lowerWhy.includes('why fail') || lowerWhy.includes('fail again')) {
        addMsg('agent', `It failed before because the app was trying to use a model Google had shut down. I have now updated it to use Groq, with Gemini as backup. Please try your last question again - type it, or tap the mic and speak it.`, undefined, true);
        return;
      }
      const lower = text.toLowerCase();
      const isExpiryQ = (lower.includes('expir') || lower.includes('yesterday') || lower.includes('today') || lower.includes('tomorrow') || lower.includes('7 days') || lower.includes('30 days')) && !lower.includes('record') && !lower.includes('throw') && !lower.includes('add') && !lower.includes('register');
      if (isExpiryQ) {
        let reply = '';
        if (lower.includes('yesterday')) {
          reply = expiredYesterday.length === 0
            ? `Good news - no products expired yesterday (${formatDate(startOfYesterday)}).`
            : `Yesterday (${formatDate(startOfYesterday)}), ${expiredYesterday.length} product(s) expired, ${qty(expiredYesterday)} units total. Total cost value: ${symbol}${val(expiredYesterday).toLocaleString('en-GB')}. Total selling value: ${symbol}${priceVal(expiredYesterday).toLocaleString('en-GB')}.\n\n${expiredYesterday.map((p: any) => `- ${p.name}: ${p.total_stock} units x ${symbol}${p.cost} = ${symbol}${(Number(p.total_stock || 0) * Number(p.cost || 0)).toLocaleString('en-GB')}`).join('\n')}`;
        } else if (lower.includes('today') && !lower.includes('7 days') && !lower.includes('30 days')) {
          reply = expiredToday.length === 0
            ? `No products expired today (${formatDate(now)}).`
            : `Today, ${expiredToday.length} product(s) expired, ${qty(expiredToday)} units, total cost value ${symbol}${val(expiredToday).toLocaleString('en-GB')}.\n${expiredToday.map((p: any) => `- ${p.name}: ${p.total_stock} units`).join('\n')}`;
        } else if (lower.includes('7 days')) {
          reply = expiring7.length === 0
            ? `Nothing expires in the next 7 days.`
            : `In the next 7 days, ${expiring7.length} product(s) expire, ${qty(expiring7)} units, total cost value ${symbol}${val(expiring7).toLocaleString('en-GB')}.\n${expiring7.map((p: any) => `- ${p.name}: Exp ${formatDate(p.expiry_date)}, ${p.total_stock} units`).join('\n')}`;
        } else if (lower.includes('30 days')) {
          reply = `In the next 30 days, ${expiring30.length} product(s) expire, ${qty(expiring30)} units, total cost value ${symbol}${val(expiring30).toLocaleString('en-GB')}.\n${expiring30.map((p: any) => `- ${p.name}: Exp ${formatDate(p.expiry_date)}, ${p.total_stock} units`).join('\n') || 'None.'}`;
        } else {
          reply = `Expired so far: ${expired.length} products, ${qty(expired)} units, total cost value ${symbol}${val(expired).toLocaleString('en-GB')}.\nExpiring in 7 days: ${expiring7.length} products, ${qty(expiring7)} units.\nExpiring in 30 days: ${expiring30.length} products, ${qty(expiring30)} units.`;
        }
        addMsg('agent', reply, undefined, true);
        return;
      }
      const inventorySummary = `Today is ${formatDate(now)}. Yesterday was ${formatDate(startOfYesterday)}.
Inventory: ${items.length} products. Total stock value (at cost): ${symbol}${val(items).toLocaleString('en-GB')}. Total stock value (at selling price): ${symbol}${priceVal(items).toLocaleString('en-GB')}.
EXPIRED YESTERDAY (${formatDate(startOfYesterday)}): ${expiredYesterday.length} products, ${qty(expiredYesterday)} units total, total cost value ${symbol}${val(expiredYesterday).toLocaleString('en-GB')}, total selling value ${symbol}${priceVal(expiredYesterday).toLocaleString('en-GB')}. List: ${expiredYesterday.map((p: any) => `${p.name} - ${p.total_stock} units x ${symbol}${p.cost} cost = ${symbol}${(Number(p.total_stock || 0) * Number(p.cost || 0)).toLocaleString('en-GB')}`).join('; ') || 'None'}.
EXPIRED TODAY: ${expiredToday.length} products, ${qty(expiredToday)} units, cost value ${symbol}${val(expiredToday).toLocaleString('en-GB')}. List: ${expiredToday.map((p: any) => `${p.name} (${p.total_stock} units)`).join('; ') || 'None'}.
ALL EXPIRED (before today): ${expired.length} products, ${qty(expired)} units, cost value ${symbol}${val(expired).toLocaleString('en-GB')}. List: ${expired.map((p: any) => `${p.name} - Exp ${formatDate(p.expiry_date)} - ${p.total_stock} units`).join('; ') || 'None'}.
EXPIRING IN 7 DAYS: ${expiring7.length} products, ${qty(expiring7)} units, cost value ${symbol}${val(expiring7).toLocaleString('en-GB')}. List: ${expiring7.map((p: any) => `${p.name} (Exp ${formatDate(p.expiry_date)}, ${p.total_stock} units)`).join('; ') || 'None'}.
EXPIRING IN 30 DAYS: ${expiring30.length} products, ${qty(expiring30)} units, cost value ${symbol}${val(expiring30).toLocaleString('en-GB')}.
LOW STOCK: ${lowStock.map((p: any) => `${p.name} (${p.total_stock} units)`).join('; ') || 'None'}.
TOP 20 PRODUCTS: ${items.slice(0, 20).map((p: any) => `${p.name} | Stock ${p.total_stock} | Price ${symbol}${p.price} | Cost ${symbol}${p.cost} | Expiry ${p.expiry_date ? formatDate(p.expiry_date) : 'Not set'} | Supplier ${p.supplier || 'Not set'}`).join('\n')}`;
      let historyText = '';
      try {
        const hq = query(collection(db, 'expiry_history'), where('org_id', '==', orgId));
        const hsnap = await getDocs(hq);
        const hlist = hsnap.docs.map(d => d.data() as any);
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const yearKey = `${now.getFullYear()}`;
        const sum = (list: any[]) => list.reduce((a, r) => a + Number(r.total_value || (Number(r.qty_expired || 0) * Number(r.unit_cost || 0))), 0);
        const mList = hlist.filter(r => String(r.disposed_at || '').startsWith(monthKey));
        const yList = hlist.filter(r => String(r.disposed_at || '').startsWith(yearKey));
        historyText = `Disposals this month (${monthKey}): ${mList.length} entries, total disposed value ${symbol}${sum(mList).toLocaleString('en-GB')}. This year: ${yList.length} entries, ${symbol}${sum(yList).toLocaleString('en-GB')}. Recent: ${hlist.slice(0, 10).map(r => `${r.productName || r.product_name} - ${r.qty_expired} units - ${r.action} - ${symbol}${Number(r.total_value || 0).toLocaleString('en-GB')} - ${r.disposed_at}`).join('; ')}`;
      } catch { historyText = 'Disposal history unavailable.'; }
      const prompt = `You are SmartStock Agent, a professional inventory assistant. Answer in clear, professional English. No emojis. No mention of databases, collections, or APIs. Use currency ${symbol} and dates like 18 Nov 2026.
LIVE INVENTORY (use ONLY this, never invent products):
${inventorySummary}
DISPOSAL HISTORY:
${historyText}
USER: "${text}"
Instructions:
- If user asks about expiry, expiring, expired, low stock, stock level, disposal totals: answer from LIVE data above.
- If user asks to RECORD a disposal / mark expired / throw away / exchange / replace: return ONLY JSON: {"intent":"recordDisposal","productName":"", "qty":0, "action":"exchanged|replaced|thrown_away", "supplier":"", "notes":""}. Infer product by name match. If product or qty missing, ask for it in plain text, do not return JSON.
- If user asks to ADD / REGISTER a new product: return ONLY JSON: {"intent":"addProduct","name":"", "qty":1, "price":0, "cost":0, "expiryDate":"YYYY-MM-DD or empty", "size":"", "supplier":"", "barcode":""}. If name missing, ask in plain text.
- If user asks to FIND a product: answer with its stock, price, expiry, supplier from LIVE data.
- Otherwise answer helpfully in plain text, max 4 sentences, then offer a next step.`;
      const raw = await callGroq(prompt);
      const trimmed = raw.trim();
      let actionJson: any = null;
      if (trimmed.startsWith('{') && trimmed.includes('"intent"')) {
        actionJson = extractJson(trimmed);
      }
      if (actionJson?.intent === 'recordDisposal') {
        const match = items.find((p: any) => p.name.toLowerCase().includes(String(actionJson.productName || '').toLowerCase()) || String(actionJson.productName || '').toLowerCase().includes(p.name.toLowerCase()));
        if (!match || !actionJson.qty) {
          addMsg('agent', `I could not find "${actionJson.productName || ''}" with that quantity. Please confirm the product name and quantity.`, undefined, true);
        } else {
          const total = Number(actionJson.qty) * Number(match.cost || 0);
          setPendingAction({ kind: 'recordDisposal', data: { product: match, qty: Number(actionJson.qty), action: actionJson.action || 'thrown_away', supplier: actionJson.supplier || '', notes: actionJson.notes || '', total } });
          setShowConfirmModal(true);
          addMsg('agent', `Ready to record: ${actionJson.qty} x ${match.name} as ${actionJson.action === 'exchanged' ? 'Exchanged' : actionJson.action === 'replaced' ? 'Replaced' : 'Thrown Away'}. Total value: ${symbol}${total.toLocaleString('en-GB')}. Please confirm below.`, undefined, true);
        }
        return;
      }
      if (actionJson?.intent === 'addProduct') {
        // Price memory for chat-add too
        const existing = items.find((p: any) => norm(p.name) === norm(actionJson.name) || (actionJson.barcode && norm(p.barcode) === norm(actionJson.barcode)));
        const price = Number(actionJson.price) > 0 ? Number(actionJson.price) : Number(existing?.price || 0);
        const cost = Number(actionJson.cost) > 0 ? Number(actionJson.cost) : Number(existing?.cost || 0);
        const merged = { ...actionJson, price, cost, supplier: actionJson.supplier || (existing as any)?.supplier || '' };
        setPendingAction({ kind: 'addProduct', data: merged });
        setEditName(merged.name || ''); setEditQty(String(merged.qty || 1)); setEditSize(merged.size || '');
        setEditExpiry(toISODate(merged.expiryDate || '')); setEditSupplier(merged.supplier || '');
        setEditPrice(String(price)); setEditCost(String(cost));
        setDuplicateInfo(existing || null); setAllowDuplicate(false); setNoExpiry(false);
        setShowConfirmModal(true);
        addMsg('agent', `Ready to add: ${merged.name}${merged.qty ? `, ${merged.qty} units` : ''}${merged.expiryDate ? `, Expiry: ${formatDate(toISODate(merged.expiryDate))}` : ''}${existing ? ` - Note: already in stock (${existing.total_stock} units). Check before confirming.` : ''}. Please confirm below.`, undefined, true);
        return;
      }
      addMsg('agent', raw.trim() || 'I could not understand that. Please try again.', undefined, true);
    } catch (e: any) {
      console.log('HANDLESEND ERROR:', e?.message);
      addMsg('agent', e.message?.includes('API key') ? 'AI is not configured. Add EXPO_PUBLIC_GROQ_API_KEY to .env and restart the app.' : `I could not process that. Real error: ${e?.message || e}`, undefined, true);
    } finally {
      setChatLoading(false);
    }
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;
    setSaving(true);
    try {
      const session = await getAuthSession();
      const user = (session as any)?.user;
      const orgId = user?.org_id;
      if (!orgId) { Alert.alert('Login required', 'Please log in again.'); router.replace('/phone-login'); return; }
      if (pendingAction.kind === 'recordDisposal') {
        const { product, qty, action, supplier, notes } = pendingAction.data;
        const res = await recordExpiry({
          productId: (product as any).id || '', productName: product.name, sku: product.sku,
          barcode: (product as any).barcode || '', supplier: supplier || 'Not specified',
          qty_sold: product.sales_count || 0, qty_expired: qty, unit_cost: product.cost || 0,
          unit_price: product.price || 0, expiry_date: product.expiry_date || '',
          disposed_at: new Date().toISOString().slice(0, 10), action, notes,
          branches: product.branches || [{ branch: 'Main Warehouse', quantity: product.total_stock || 0 }],
        });
        if (!res.success) throw new Error(res.error || 'Could not record disposal.');
        await logProductHistory(orgId, { action: 'DISPOSED', productName: product.name, sku: product.sku, details: `Agent: Disposed ${qty} as ${action}` });
        addMsg('agent', `Confirmed. ${qty} x ${product.name} recorded as ${action === 'exchanged' ? 'Exchanged' : action === 'replaced' ? 'Replaced' : 'Thrown Away'}.`, undefined, true);
      } else {
        const d = pendingAction.data;
        if ((Number(d.price) || 0) <= 0) { Alert.alert('Selling price required', 'Enter a selling price above 0 before confirming.'); setSaving(false); return; }
        if (duplicateInfo && !allowDuplicate) {
          Alert.alert('Already exists', `"${d.name}" is already in stock (${duplicateInfo.total_stock} units). Tap Confirm again to create a separate entry, or Cancel and add stock in Stock tab.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Create anyway', onPress: () => setAllowDuplicate(true) }]);
          setSaving(false); return;
        }
        const barcode = d.barcode || await generateUniqueBarcode(orgId);
        const result = await addProduct({
          org_id: orgId, name: d.name.trim(), sku: `SKU-${Date.now()}`, barcode,
          item_size: d.size || '', quantity: Number(d.qty) || 1, category: 'General',
          price: Number(d.price) || 0, cost: Number(d.cost) || 0, safety_stock: 10,
          image_url: null, expiry_date: d.expiryDate ? toISODate(d.expiryDate) : undefined,
        } as any);
        if (!result.success) throw new Error(result.error || 'Could not add product.');
        addMsg('agent', `Confirmed. "${d.name}" has been added to inventory.`, undefined, true);
      }
      setShowConfirmModal(false); setPendingAction(null); resetApproveState();
    } catch (err: any) { Alert.alert('Action failed', err?.message || 'Please try again.'); }
    setSaving(false);
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
        setScannedLink(url); setShowVerifyModal(true);
        addMsg('user', 'Scanned link');
        addMsg('agent', 'Website link found. Tap Open Website below to visit it.', undefined, true);
      } else { addMsg('agent', 'That is not a website QR code. Scan a website QR code.', undefined, true); }
      setTimeout(() => { scannedRef.current = false; }, 1000);
      return;
    }
    if (isLink(cleanData)) {
      addMsg('agent', 'That is a website link, not a product barcode. Use the top SCAN ME for website links.', undefined, true);
      setTimeout(() => { scannedRef.current = false; }, 1000);
      return;
    }
    addMsg('user', `Barcode: ${cleanData}`);
    (async () => {
      try {
        const session = await getAuthSession();
        const orgId = session?.user?.org_id;
        if (orgId) {
          const q = query(collection(db, 'products'), where('org_id', '==', orgId), where('barcode', '==', cleanData));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const prod = snap.docs[0].data();
            addMsg('agent', `Found in inventory:\n${prod.name}\nSKU: ${prod.sku}\nPrice: ${currencySymbol}${prod.price || 0}\nStock: ${prod.total_stock ?? 'Not available'}\nExpiry: ${prod.expiry_date ? formatDate(prod.expiry_date) : 'Not set'}`, undefined, true);
            setTimeout(() => { scannedRef.current = false; }, 1000);
            return;
          }
        }
      } catch (e) { console.warn('Barcode lookup error:', e); }
      resetApproveState();
      setEditName(`Product ${cleanData.slice(-6)}`); setEditQty('1'); setEditSize('');
      setEditExpiry(''); setEditBatch(''); setEditSupplier(''); setEditPrice('0'); setEditCost('0');
      setLastParsed({ name: `Product ${cleanData.slice(-6)}`, qty: '1', detectedText: `Barcode ${cleanData}`, imageUri: '', barcode: cleanData });
      addMsg('agent', `Barcode ${cleanData} is not in inventory. Review to register:`, undefined, true);
      setShowApproveModal(true);
      setTimeout(() => { scannedRef.current = false; }, 1000);
    })();
  };

  const handleApproveAndRegister = async () => {
    if (!editName.trim()) { setNameError(true); Alert.alert('Product name required', 'Enter the product name.'); return; }
    setNameError(false);
    if ((parseFloat(editPrice) || 0) <= 0) { setPriceError(true); Alert.alert('Selling price required', 'Enter a selling price above 0. It cannot be 0.'); return; }
    setPriceError(false);
    if (!editExpiry.trim() && !noExpiry) { setExpiryError(true); Alert.alert('Expiry date required', 'Enter expiry date, or tick "No expiry on label" if the label truly has none.'); return; }
    setExpiryError(false);
    if (duplicateInfo && !allowDuplicate) {
      Alert.alert('Already exists', `"${editName.trim()}" is already in stock (${duplicateInfo.total_stock} units at ${currencySymbol}${duplicateInfo.price}).\n\nTap "Create anyway" then Approve again to create a separate entry, or Cancel and add stock in Stock tab.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View in Stock', onPress: () => { setShowApproveModal(false); router.push('/(tabs)/stock' as any); } },
        { text: 'Create anyway', onPress: () => setAllowDuplicate(true) },
      ]);
      return;
    }
    setSaving(true);
    try {
      const session = await getAuthSession();
      const user = (session as any)?.user || null;
      const orgId = user?.org_id;
      if (!orgId || !user) { Alert.alert('Login required', 'Please log in again to register products.'); router.replace('/phone-login'); return; }
      const barcode = lastParsed?.barcode || await generateUniqueBarcode(orgId);
      const result = await addProduct({
        org_id: orgId, name: editName.trim(), sku: `SKU-${Date.now()}`, barcode,
        item_size: editSize || '', quantity: parseInt(editQty) || 1, category: 'General',
        price: parseFloat(editPrice) || 0, cost: parseFloat(editCost) || 0, safety_stock: 10,
        image_url: lastParsed?.imageUri || null, expiry_date: editExpiry ? toISODate(editExpiry) : undefined,
        supplier: editSupplier || undefined, batch_no: editBatch || undefined,
      } as any);
      if (!result.success) throw new Error(result.error || 'Failed to save product');
      addMsg('agent', `Registered "${editName}"${editExpiry ? `, Expiry: ${formatDate(toISODate(editExpiry))}` : ' (no expiry on label)'}.`, undefined, true);
      setShowApproveModal(false); setEditName(''); setEditQty('1'); setEditSize(''); setEditExpiry(''); setEditBatch(''); setEditSupplier(''); setEditPrice('0'); setEditCost('0'); setLastParsed(null);
      resetApproveState();
    } catch (err: any) { Alert.alert('Registration failed', err?.message || 'Please try again.'); }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1, flexShrink: 1, marginRight: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>SmartStock Agent</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{scannedLink ? 'Link ready - tap Open Website below' : 'Ask, scan a label, or record a disposal'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
          <TouchableOpacity onPress={() => setMuted(m => !m)} style={[styles.headerIconBtn, muted && { opacity: 0.5 }]}><Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={16} color="#FDF6E9" /></TouchableOpacity>
          <TouchableOpacity onPress={handleTopScanMe} style={styles.onBadge}>
            <Ionicons name="globe-outline" size={14} color="#FDF6E9" /><Text style={styles.onText}>SCAN ME</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView ref={chatScrollRef} style={styles.chat} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {msgs.map((m, i) => (
          <TouchableOpacity key={i} onPress={() => m.role === 'agent' && speak(m.text)} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.agentBubble]}>
            {m.image ? <Image source={{ uri: m.image }} style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 8 }} /> : null}
            <Text style={styles.bubbleText}>{m.text}</Text>
            <Text style={{ color: '#8AA99B', fontSize: 10, marginTop: 6, textAlign: 'right' }}>{m.time}</Text>
          </TouchableOpacity>
        ))}
        {(ocrLoading || chatLoading) && <View style={[styles.bubble, styles.agentBubble]}><ActivityIndicator color="#FDF6E9" /><Text style={styles.bubbleText}>{ocrLoading ? 'Reading label...' : 'Thinking...'}</Text></View>}
      </ScrollView>
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={pickImageFromGallery} style={styles.iconBtn}><Ionicons name="image-outline" size={20} color="#FDF6E9" /></TouchableOpacity>
        <TouchableOpacity onPress={pickImageFromCamera} style={styles.iconBtn}><Ionicons name="camera-outline" size={20} color="#FDF6E9" /></TouchableOpacity>
        <TouchableOpacity onPress={handleBottomScanMe} style={styles.scanBtn}><Ionicons name="barcode-outline" size={16} color="#0B3B2E" /><Text style={{ color: '#0B3B2E', fontSize: 8, fontWeight: '800' }}>SCAN</Text></TouchableOpacity>
        <TouchableOpacity onPress={startListening} style={[styles.iconBtn, listening && { backgroundColor: '#EF4444' }]}><Ionicons name={listening ? 'stop-outline' : 'mic-outline'} size={20} color="#FDF6E9" /></TouchableOpacity>
        <TextInput value={input} onChangeText={setInput} placeholder="Type a message..." placeholderTextColor="#8AA99B" style={styles.input} onSubmitEditing={() => handleSend()} returnKeyType="send" />
        <TouchableOpacity onPress={() => handleSend()} style={styles.sendBtn}><Ionicons name="send" size={18} color="#fff" /></TouchableOpacity>
      </View>

      <Modal visible={showVerifyModal} transparent animationType="slide" onRequestClose={() => setShowVerifyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="globe-outline" size={28} color="#FDF6E9" /></View>
              <Text style={{ color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginTop: 12 }}>Website Link Found</Text>
              <Text style={{ color: '#8AA99B', fontSize: 13, marginTop: 6, textAlign: 'center' }}>Tap below to open it in your browser</Text>
              <Text style={{ color: '#FDF6E9', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{scannedLink}</Text>
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

      <Modal visible={showConfirmModal} transparent animationType="slide" onRequestClose={() => setShowConfirmModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Confirm Action</Text>
            <Text style={{ color: '#8AA99B', fontSize: 13, marginTop: 6 }}>Review before saving. This action will be recorded.</Text>
            {duplicateInfo && pendingAction?.kind === 'addProduct' ? (
              <View style={{ backgroundColor: '#7F1D1D', borderRadius: 12, padding: 12, marginTop: 12 }}>
                <Text style={{ color: '#FECACA', fontWeight: '800' }}>⚠️ Already in stock</Text>
                <Text style={{ color: '#FECACA', fontSize: 12, marginTop: 4 }}>{duplicateInfo.name} - {duplicateInfo.total_stock} units at {currencySymbol}{duplicateInfo.price}</Text>
              </View>
            ) : null}
            {pendingAction?.kind === 'recordDisposal' ? (
              <View style={{ backgroundColor: '#1E3A30', borderRadius: 12, padding: 14, marginTop: 14 }}>
                <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>{pendingAction.data.qty} x {pendingAction.data.product?.name}</Text>
                <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 6 }}>Outcome: {pendingAction.data.action === 'exchanged' ? 'Exchanged' : pendingAction.data.action === 'replaced' ? 'Replaced' : 'Thrown Away'}</Text>
                <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 2 }}>Total value: {currencySymbol}{Number(pendingAction.data.total || 0).toLocaleString('en-GB')}</Text>
              </View>
            ) : pendingAction?.kind === 'addProduct' ? (
              <View style={{ backgroundColor: '#1E3A30', borderRadius: 12, padding: 14, marginTop: 14 }}>
                <Text style={{ color: '#FDF6E9', fontWeight: '700' }}>{pendingAction.data.name}</Text>
                <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 6 }}>Quantity: {pendingAction.data.qty || 1}{pendingAction.data.expiryDate ? `  •  Expiry: ${formatDate(toISODate(pendingAction.data.expiryDate))}` : ''}</Text>
                <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 2 }}>Price: {currencySymbol}{pendingAction.data.price}  •  Cost: {currencySymbol}{pendingAction.data.cost}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity onPress={() => { setShowConfirmModal(false); setPendingAction(null); resetApproveState(); }} style={[styles.primaryBtn, { flex: 1, backgroundColor: '#1E3A30' }]}><Text style={styles.primaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={executePendingAction} style={[styles.primaryBtn, { flex: 1, backgroundColor: '#0B3B2E' }]} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showApproveModal} transparent animationType="slide" onRequestClose={() => setShowApproveModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Review & Approve</Text>
              <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 6 }}>Check the details read from the label, then approve to save.</Text>
              {lastParsed?.imageUri ? <Image source={{ uri: lastParsed.imageUri }} style={{ width: '100%', height: 150, borderRadius: 10, marginTop: 12 }} /> : null}
              {duplicateInfo ? (
                <View style={{ backgroundColor: '#7F1D1D', borderRadius: 12, padding: 12, marginTop: 12 }}>
                  <Text style={{ color: '#FECACA', fontWeight: '800' }}>⚠️ Already in stock - check before approving</Text>
                  <Text style={{ color: '#FECACA', fontSize: 12, marginTop: 4 }}>{duplicateInfo.name} - {duplicateInfo.total_stock} units at {currencySymbol}{duplicateInfo.price}{duplicateInfo.expiry_date ? `, Exp ${formatDate(duplicateInfo.expiry_date)}` : ''}</Text>
                  <Text style={{ color: '#FECACA', fontSize: 12, marginTop: 4 }}>Price + cost pre-filled from last entry. Tap Approve once to see options, Approve again to force-create.</Text>
                </View>
              ) : null}
              <Text style={styles.label}>Product Name *</Text>
              <TextInput value={editName} onChangeText={(t) => { setEditName(t); if (t.trim()) setNameError(false); }} style={[styles.editInput, nameError ? { borderColor: '#EF4444', borderWidth: 2 } : {}]} placeholder="Product name" placeholderTextColor="#8AA99B" />
              <Text style={styles.label}>Quantity</Text><TextInput value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={styles.editInput} placeholder="1" placeholderTextColor="#8AA99B" />
              <Text style={styles.label}>Size (e.g. 100ml, 1L)</Text><TextInput value={editSize} onChangeText={setEditSize} style={styles.editInput} placeholder="e.g. 100ml" placeholderTextColor="#8AA99B" />
              <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text><TextInput value={editExpiry} onChangeText={(t) => { setEditExpiry(t); if (t.trim()) setExpiryError(false); }} style={[styles.editInput, expiryError ? { borderColor: '#EF4444', borderWidth: 2 } : {}]} placeholder="e.g. 2026-11-01" placeholderTextColor="#8AA99B" />
              <TouchableOpacity onPress={() => { setNoExpiry(v => !v); setExpiryError(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: noExpiry ? '#FDF6E9' : '#8AA99B', backgroundColor: noExpiry ? '#FDF6E9' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {noExpiry ? <Text style={{ color: '#0B3B2E', fontWeight: '800', fontSize: 14 }}>✓</Text> : null}
                </View>
                <Text style={{ color: '#FDF6E9', fontSize: 13 }}>No expiry on label - save without expiry date</Text>
              </TouchableOpacity>
              {!editExpiry.trim() && !noExpiry ? <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 6 }}>Enter expiry date or tick the box above, or Approve will be blocked.</Text> : null}
              <Text style={styles.label}>Batch No</Text><TextInput value={editBatch} onChangeText={setEditBatch} style={styles.editInput} placeholder="e.g. F 0002" placeholderTextColor="#8AA99B" />
              <Text style={styles.label}>Supplier</Text><TextInput value={editSupplier} onChangeText={setEditSupplier} style={styles.editInput} placeholder="Supplier name" placeholderTextColor="#8AA99B" />
              <Text style={styles.label}>Selling Price *</Text><TextInput value={editPrice} onChangeText={(t) => { setEditPrice(t); if ((parseFloat(t) || 0) > 0) setPriceError(false); }} keyboardType="numeric" style={[styles.editInput, priceError ? { borderColor: '#EF4444', borderWidth: 2 } : {}]} placeholder="0" placeholderTextColor="#8AA99B" />
              {(parseFloat(editPrice) || 0) <= 0 ? <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 6 }}>Selling price cannot be 0. Enter price or Approve will be blocked.</Text> : null}
              <Text style={styles.label}>Cost Price</Text><TextInput value={editCost} onChangeText={setEditCost} keyboardType="numeric" style={styles.editInput} placeholder="0" placeholderTextColor="#8AA99B" />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity onPress={() => { setShowApproveModal(false); resetApproveState(); }} style={[styles.primaryBtn, { flex: 1, backgroundColor: '#1E3A30' }]}><Text style={styles.primaryText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleApproveAndRegister} style={[styles.primaryBtn, { flex: 1, backgroundColor: editName.trim() ? '#0B3B2E' : '#334155' }]} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Approve</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showBarcode} animationType="slide" onRequestClose={() => setShowBarcode(false)}>
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
  headerIconBtn: { backgroundColor: '#1E3A30', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A4A3E' },
  onBadge: { backgroundColor: '#1E3A30', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#2A4A3E', flexShrink: 0 },
  onText: { color: '#FDF6E9', fontSize: 11, fontWeight: '700' },
  chat: { flex: 1 },
  bubble: { padding: 14, borderRadius: 14, marginBottom: 10, maxWidth: '85%' },
  agentBubble: { backgroundColor: '#1E3A30', alignSelf: 'flex-start' },
  userBubble: { backgroundColor: '#0B3B2E', alignSelf: 'flex-end', borderWidth: 1, borderColor: '#2A4A3E' },
  bubbleText: { color: '#FDF6E9', fontSize: 14, lineHeight: 20 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: '#0B3B2E', paddingBottom: 28 },
  iconBtn: { backgroundColor: '#1E3A30', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scanBtn: { backgroundColor: '#FDF6E9', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  input: { flex: 1, flexShrink: 1, minWidth: 0, backgroundColor: '#1E3A30', color: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  sendBtn: { backgroundColor: '#1E3A30', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A4A3E', flexShrink: 0 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '92%' },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6, letterSpacing: 0.5 },
  editInput: { backgroundColor: '#1E3A30', color: '#fff', padding: 12, borderRadius: 10 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});