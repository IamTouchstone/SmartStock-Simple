import { 
  collection, doc, getDocs, setDoc, addDoc, query, where, runTransaction, getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface ProductItem {
  id?: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  safety_stock?: number;
  total_stock?: number;
  branches?: { branch: string; quantity: number }[];
  org_id: string;
  created_at?: string;
  barcode?: string;
  expiry_date?: string | null;
  sales_count?: number;
  last_sold_date?: string | null;
  marketDates?: string[] | Date[];
  market_dates?: string[] | Date[];
  customerRequested?: boolean;
  isCustomerRequested?: boolean;
  customer_requested?: boolean;
}

export interface PurchaseOrder {
  id: string;
  sku: string;
  product_name: string;
  branch: string;
  quantity: number;
  supplier: string;
  cost: number;
  status: 'Recommended' | 'Requested' | 'Approved' | 'Received' | 'Cancelled';
  org_id: string;
  created_at?: string;
}

export interface RedistributionItem {
  id: string;
  sku: string;
  product_name: string;
  source_branch: string;
  target_branch: string;
  transfer_qty: number;
  status: 'Recommended' | 'In Transit' | 'Completed' | 'Cancelled';
  org_id: string;
}

function ean13CheckDigit(code12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(code12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

export function generateBarcodeNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000).toString();
  const code12 = `520${yy}${mm}${dd}${rand}`.slice(0, 12);
  return code12 + ean13CheckDigit(code12);
}

export async function generateUniqueBarcode(orgId: string): Promise<string> {
  let tries = 0;
  while (tries < 8) {
    const barcode = generateBarcodeNumber();
    const q = query(collection(db, 'products'), where('org_id', '==', orgId), where('barcode', '==', barcode));
    const snap = await getDocs(q);
    if (snap.empty) return barcode;
    tries++;
  }
  return generateBarcodeNumber();
}

const TOKEN_KEY = 'smartstock_auth_token';
const USER_KEY = 'smartstock_user_profile';

export async function saveAuthSession(token: string, user: any) {
  try {
    if (Platform.OS !== 'web' && await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    } else {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  } catch (e) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export async function getAuthSession(): Promise<{ token: string | null; user: any | null }> {
  try {
    let token: string | null = null;
    let userStr: string | null = null;
    if (Platform.OS !== 'web' && await SecureStore.isAvailableAsync()) {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
      userStr = await SecureStore.getItemAsync(USER_KEY);
    } else {
      token = await AsyncStorage.getItem(TOKEN_KEY);
      userStr = await AsyncStorage.getItem(USER_KEY);
    }
    let user = userStr ? JSON.parse(userStr) : null;
    if (!user && auth && auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
        // KEEP USER CHOSEN CURRENCY - don't hardcode USD if profile exists
        let savedCurrency = 'NGN';
        let savedSymbol = '₦';
        try {
          const profileDoc = await getDoc(doc(db, 'org_profiles', `ORG-${auth.currentUser.uid.slice(0, 6)}`));
          if (profileDoc.exists()) {
            savedCurrency = profileDoc.data().currency || savedCurrency;
            savedSymbol = profileDoc.data().currency_symbol || savedSymbol;
          }
        } catch {}
        user = {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          name: auth.currentUser.displayName || (auth.currentUser.email ? auth.currentUser.email.split('@')[0] : 'Operator'),
          role: 'Owner',
          org_id: `ORG-${auth.currentUser.uid.slice(0, 6)}`,
          org_name: 'SmartStock Retail',
          currency: savedCurrency,
          currency_symbol: savedSymbol,
          emailVerified: auth.currentUser.emailVerified
        };
        await saveAuthSession(token, user);
      } catch (recoveryErr) {
        console.warn('Firebase session recovery warning:', recoveryErr);
      }
    }
    return { token, user };
  } catch (e) {
    if (auth && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        const user = {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          name: auth.currentUser.displayName || (auth.currentUser.email ? auth.currentUser.email.split('@')[0] : 'Operator'),
          role: 'Owner',
          org_id: `ORG-${auth.currentUser.uid.slice(0, 6)}`,
          org_name: 'SmartStock Retail',
          currency: 'NGN',
          currency_symbol: '₦',
          emailVerified: auth.currentUser.emailVerified
        };
        return { token, user };
      } catch (inner) {}
    }
    return { token: null, user: null };
  }
}

export async function clearAuthSession() {
  try {
    if (Platform.OS !== 'web' && await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  } catch (e) {}
}

export async function getInventory(orgId: string): Promise<ProductItem[]> {
  try {
    const q = query(collection(db, 'products'), where('org_id', '==', orgId));
    const snapshot = await getDocs(q);
    const products: ProductItem[] = [];
    const invQ = query(collection(db, 'inventory'), where('org_id', '==', orgId));
    const invSnapshot = await getDocs(invQ);
    const branchMap: { [sku: string]: { branch: string; quantity: number }[] } = {};
    invSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const sku = (data.sku || '').toUpperCase();
      if (!branchMap[sku]) branchMap[sku] = [];
      branchMap[sku].push({ branch: data.branch || 'Main Warehouse', quantity: Number(data.quantity) || 0 });
    });
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const sku = (data.sku || '').toUpperCase();
      const branches = branchMap[sku] || [{ branch: 'Main Warehouse', quantity: 0 }, { branch: 'North Branch', quantity: 0 }, { branch: 'South Branch', quantity: 0 }];
      const total_stock = branches.reduce((sum, b) => sum + b.quantity, 0);
      products.push({
        id: docSnap.id, sku, name: data.name || '', category: data.category || 'General', price: Number(data.price) || 0, cost: Number(data.cost) || 0, safety_stock: Number(data.safety_stock) || 10, total_stock, branches, org_id: orgId, created_at: data.created_at || new Date().toISOString(), barcode: data.barcode || '', expiry_date: data.expiry_date || null, sales_count: Number(data.sales_count) || 0, last_sold_date: data.last_sold_date || null,
      });
    });
    return products;
  } catch (err) { console.error('getInventory error:', err); return []; }
}

export async function addProduct(
  item: {
    sku: string;
    name: string;
    category: string;
    price: number;
    cost: number;
    safety_stock?: number;
    quantity?: number;
    branch?: string;
    org_id: string;
    expiry_date?: string | null;
    sales_count?: number;
    last_sold_date?: string | null;
    barcode?: string;
  }
): Promise<{ success: boolean; error?: string; barcode?: string; sku?: string }> {
  try {
    const orgId = item.org_id;
    let finalBarcode = item.barcode?.trim();
    if (!finalBarcode) finalBarcode = await generateUniqueBarcode(orgId);
    let sku = item.sku?.trim().toUpperCase() || '';
    if (!sku) {
      const nameClean = item.name.trim().replace(/[^a-zA-Z0-9]/g,'').substring(0,4).toUpperCase() || 'PRD';
      sku = `${nameClean}-${finalBarcode.slice(-4)}`;
    }
    const q = query(collection(db, 'products'), where('org_id', '==', orgId), where('sku', '==', sku));
    const existing = await getDocs(q);
    if (!existing.empty) {
      sku = `${sku}-${Math.floor(10 + Math.random()*90)}`;
    }
    const newProd = {
      sku, name: item.name.trim(), category: item.category || 'General', price: Number(item.price) || 0, cost: Number(item.cost) || 0, safety_stock: Number(item.safety_stock) || 10, barcode: finalBarcode, expiry_date: item.expiry_date || null, sales_count: Number(item.sales_count) || 0, last_sold_date: item.last_sold_date || null, org_id: orgId, created_at: new Date().toISOString()
    };
    await addDoc(collection(db, 'products'), newProd);
    const targetBranch = item.branch || 'Main Warehouse';
    const initQty = Number(item.quantity) || 0;
    const branches = ['Main Warehouse', 'North Branch', 'South Branch'];
    for (const b of branches) {
      const invDocId = `${orgId}_${sku}_${b.replace(/\s+/g, '_')}`;
      await setDoc(doc(db, 'inventory', invDocId), { org_id: orgId, sku, branch: b, quantity: b === targetBranch ? initQty : 0, updated_at: new Date().toISOString() });
    }
    return { success: true, barcode: finalBarcode, sku };
  } catch (err: any) {
    console.error('addProduct error:', err);
    return { success: false, error: err.message || 'Failed to save product.' };
  }
}

export async function recordSale(sku: string, orgId: string, qty: number) {
  try {
    const q = query(collection(db, 'products'), where('org_id','==',orgId), where('sku','==',sku.toUpperCase()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docRef = snap.docs[0].ref;
      await runTransaction(db, async (t) => {
        const d = await t.get(docRef);
        if (!d.exists()) return;
        const curSales = Number(d.data().sales_count)||0;
        t.update(docRef, { sales_count: curSales + qty, last_sold_date: new Date().toISOString() });
      });
    }
  } catch(e){ console.log('recordSale error', e); }
}

export async function scanIntake(sku: string, name: string, quantity: number, branch: string, orgId: string): Promise<{ success: boolean; message: string }> {
  try {
    const cleanSku = sku.trim().toUpperCase();
    const qty = Number(quantity) || 1;
    const targetBranch = branch || 'Main Warehouse';
    const prodQ = query(collection(db, 'products'), where('org_id', '==', orgId), where('sku', '==', cleanSku));
    const prodSnap = await getDocs(prodQ);
    if (prodSnap.empty) {
      const autoBarcode = await generateUniqueBarcode(orgId);
      await addDoc(collection(db, 'products'), { sku: cleanSku, name: name || `Product ${cleanSku}`, category: 'General', price: 0, cost: 0, safety_stock: 10, barcode: autoBarcode, org_id: orgId, created_at: new Date().toISOString() });
    }
    const invDocId = `${orgId}_${cleanSku}_${targetBranch.replace(/\s+/g, '_')}`;
    const invRef = doc(db, 'inventory', invDocId);
    await runTransaction(db, async (transaction) => {
      const invDoc = await transaction.get(invRef);
      if (!invDoc.exists()) {
        transaction.set(invRef, { org_id: orgId, sku: cleanSku, branch: targetBranch, quantity: qty, updated_at: new Date().toISOString() });
      } else {
        const currentQty = Number(invDoc.data().quantity) || 0;
        transaction.update(invRef, { quantity: currentQty + qty, updated_at: new Date().toISOString() });
      }
    });
    await addDoc(collection(db, 'activity_logs'), { org_id: orgId, action: `Barcode Intake: +${qty} of ${cleanSku} at ${targetBranch}`, timestamp: new Date().toISOString() });
    return { success: true, message: `Added ${qty} units of ${cleanSku} to ${targetBranch}.` };
  } catch (err: any) {
    console.error('scanIntake error:', err);
    return { success: false, message: err.message || 'Intake failed.' };
  }
}

export async function getDashboardSummary(orgId: string): Promise<{ totalProducts: number; lowStockAlerts: number; totalUnits: number; }> {
  try {
    const products = await getInventory(orgId);
    let lowStockAlerts = 0; let totalUnits = 0;
    for (const p of products) { totalUnits += p.total_stock || 0; if ((p.total_stock||0) <= (p.safety_stock||10)) lowStockAlerts++; }
    return { totalProducts: products.length, lowStockAlerts, totalUnits };
  } catch (e) { return { totalProducts: 0, lowStockAlerts: 0, totalUnits: 0 }; }
}

export async function getReorders(orgId: string): Promise<PurchaseOrder[]> {
  try {
    const q = query(collection(db, 'purchase_orders'), where('org_id', '==', orgId));
    const snap = await getDocs(q);
    const pos: PurchaseOrder[] = [];
    snap.forEach(d => { pos.push({ id: d.id, ...d.data() } as PurchaseOrder); });
    return pos;
  } catch (e) { return []; }
}

export async function approvePO(poId: string, orgId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const poRef = doc(db, 'purchase_orders', poId);
    await runTransaction(db, async (transaction) => {
      const poDoc = await transaction.get(poRef);
      if (!poDoc.exists()) throw new Error('Purchase Order does not exist.');
      const poData = poDoc.data() as PurchaseOrder;
      if (poData.status === 'Approved' || poData.status === 'Received') throw new Error('Already approved');
      transaction.update(poRef, { status: 'Approved', approved_at: new Date().toISOString() });
      const invDocId = `${orgId}_${poData.sku}_${poData.branch.replace(/\s+/g, '_')}`;
      const invRef = doc(db, 'inventory', invDocId);
      const invDoc = await transaction.get(invRef);
      if (!invDoc.exists()) {
        transaction.set(invRef, { org_id: orgId, sku: poData.sku, branch: poData.branch, quantity: poData.quantity, updated_at: new Date().toISOString() });
      } else {
        const curQty = Number(invDoc.data().quantity) || 0;
        transaction.update(invRef, { quantity: curQty + poData.quantity, updated_at: new Date().toISOString() });
      }
    });
    await addDoc(collection(db, 'activity_logs'), { org_id: orgId, action: `Approved Purchase Order ${poId}`, timestamp: new Date().toISOString() });
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

// --- FIXED: ALL READS BEFORE WRITES ---
export async function approveRedistribution(sku: string, sourceBranch: string, targetBranch: string, quantity: number, orgId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanSku = sku.trim().toUpperCase();
    const qty = Number(quantity);
    if (qty <= 0) return { success: false, error: 'Transfer quantity must be greater than zero.' };
    if (sourceBranch === targetBranch) return { success: false, error: 'Source and target branches must be different.' };
    const srcInvId = `${orgId}_${cleanSku}_${sourceBranch.replace(/\s+/g, '_')}`;
    const tgtInvId = `${orgId}_${cleanSku}_${targetBranch.replace(/\s+/g, '_')}`;
    const srcRef = doc(db, 'inventory', srcInvId);
    const tgtRef = doc(db, 'inventory', tgtInvId);
    
    await runTransaction(db, async (transaction) => {
      // STEP 1: READ BOTH DOCS FIRST - NO WRITES YET
      const srcDoc = await transaction.get(srcRef);
      const tgtDoc = await transaction.get(tgtRef);
      
      if (!srcDoc.exists()) throw new Error(`No stock found for SKU ${cleanSku} at ${sourceBranch}.`);
      const srcQty = Number(srcDoc.data().quantity) || 0;
      if (srcQty < qty) throw new Error(`Insufficient stock at ${sourceBranch}. Available: ${srcQty}, Requested: ${qty}`);
      
      // STEP 2: NOW DO WRITES
      transaction.update(srcRef, { quantity: srcQty - qty, updated_at: new Date().toISOString() });
      
      if (!tgtDoc.exists()) {
        transaction.set(tgtRef, { org_id: orgId, sku: cleanSku, branch: targetBranch, quantity: qty, updated_at: new Date().toISOString(), created_at: new Date().toISOString() });
      } else {
        const tgtQty = Number(tgtDoc.data().quantity) || 0;
        transaction.update(tgtRef, { quantity: tgtQty + qty, updated_at: new Date().toISOString() });
      }
    });
    
    await addDoc(collection(db, 'redistributions'), { org_id: orgId, sku: cleanSku, source_branch: sourceBranch, target_branch: targetBranch, transfer_qty: qty, status: 'Completed', timestamp: new Date().toISOString() });
    await addDoc(collection(db, 'activity_logs'), { org_id: orgId, action: `Redistributed ${qty} units of ${cleanSku} from ${sourceBranch} to ${targetBranch}`, timestamp: new Date().toISOString() });
    return { success: true };
  } catch (err: any) { 
    return { success: false, error: err.message }; 
  }
}

export async function extractInvoiceWithOCR(_imageUri: string): Promise<{ invoiceNumber?: string; totalAmount?: number; extractedText: string; }> {
  return { extractedText: '' };
}