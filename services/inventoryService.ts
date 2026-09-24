import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  runTransaction,
  Timestamp 
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

// ----------------------------------------------------
// SECURE AUTH & SESSION STORAGE
// ----------------------------------------------------
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
    const user = userStr ? JSON.parse(userStr) : null;
    return { token, user };
  } catch (e) {
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
  } catch (e) {
    // Ignore error on clearing
  }
}

// ----------------------------------------------------
// REAL FIRESTORE INVENTORY WORKFLOWS
// ----------------------------------------------------

export async function getInventory(orgId: string): Promise<ProductItem[]> {
  try {
    const q = query(collection(db, 'products'), where('org_id', '==', orgId));
    const snapshot = await getDocs(q);
    const products: ProductItem[] = [];

    // Also fetch branch inventories for this org
    const invQ = query(collection(db, 'inventory'), where('org_id', '==', orgId));
    const invSnapshot = await getDocs(invQ);
    const branchMap: { [sku: string]: { branch: string; quantity: number }[] } = {};

    invSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const sku = (data.sku || '').toUpperCase();
      if (!branchMap[sku]) branchMap[sku] = [];
      branchMap[sku].push({
        branch: data.branch || 'Main Warehouse',
        quantity: Number(data.quantity) || 0
      });
    });

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const sku = (data.sku || '').toUpperCase();
      const branches = branchMap[sku] || [
        { branch: 'Main Warehouse', quantity: 0 },
        { branch: 'North Branch', quantity: 0 },
        { branch: 'South Branch', quantity: 0 }
      ];
      const total_stock = branches.reduce((sum, b) => sum + b.quantity, 0);

      products.push({
        id: docSnap.id,
        sku: sku,
        name: data.name || '',
        category: data.category || 'General',
        price: Number(data.price) || 0,
        cost: Number(data.cost) || 0,
        safety_stock: Number(data.safety_stock) || 10,
        total_stock,
        branches,
        org_id: orgId,
        created_at: data.created_at || new Date().toISOString()
      });
    });

    return products;
  } catch (err) {
    console.error('getInventory Firestore error:', err);
    return [];
  }
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
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = item.org_id;
    const sku = item.sku.trim().toUpperCase();

    // Check duplicate SKU in this organization
    const q = query(
      collection(db, 'products'),
      where('org_id', '==', orgId),
      where('sku', '==', sku)
    );
    const existing = await getDocs(q);
    if (!existing.empty) {
      return { success: false, error: `SKU "${sku}" already exists in catalog.` };
    }

    const newProd = {
      sku,
      name: item.name.trim(),
      category: item.category || 'General',
      price: Number(item.price) || 0,
      cost: Number(item.cost) || 0,
      safety_stock: Number(item.safety_stock) || 10,
      org_id: orgId,
      created_at: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'products'), newProd);

    // Initialize branch inventory
    const targetBranch = item.branch || 'Main Warehouse';
    const initQty = Number(item.quantity) || 0;

    const branches = ['Main Warehouse', 'North Branch', 'South Branch'];
    for (const b of branches) {
      const invDocId = `${orgId}_${sku}_${b.replace(/\s+/g, '_')}`;
      await setDoc(doc(db, 'inventory', invDocId), {
        org_id: orgId,
        sku,
        branch: b,
        quantity: b === targetBranch ? initQty : 0,
        updated_at: new Date().toISOString()
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('addProduct Firestore error:', err);
    return { success: false, error: err.message || 'Failed to save product.' };
  }
}

// ----------------------------------------------------
// BARCODE INTAKE SCANNER
// ----------------------------------------------------
export async function scanIntake(
  sku: string,
  name: string,
  quantity: number,
  branch: string,
  orgId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanSku = sku.trim().toUpperCase();
    const qty = Number(quantity) || 1;
    const targetBranch = branch || 'Main Warehouse';

    // 1. Ensure product exists or auto-create minimal product
    const prodQ = query(
      collection(db, 'products'),
      where('org_id', '==', orgId),
      where('sku', '==', cleanSku)
    );
    const prodSnap = await getDocs(prodQ);

    if (prodSnap.empty) {
      await addDoc(collection(db, 'products'), {
        sku: cleanSku,
        name: name || `Product ${cleanSku}`,
        category: 'General',
        price: 0,
        cost: 0,
        safety_stock: 10,
        org_id: orgId,
        created_at: new Date().toISOString()
      });
    }

    // 2. Increment stock in atomic transaction
    const invDocId = `${orgId}_${cleanSku}_${targetBranch.replace(/\s+/g, '_')}`;
    const invRef = doc(db, 'inventory', invDocId);

    await runTransaction(db, async (transaction) => {
      const invDoc = await transaction.get(invRef);
      if (!invDoc.exists()) {
        transaction.set(invRef, {
          org_id: orgId,
          sku: cleanSku,
          branch: targetBranch,
          quantity: qty,
          updated_at: new Date().toISOString()
        });
      } else {
        const currentQty = Number(invDoc.data().quantity) || 0;
        transaction.update(invRef, {
          quantity: currentQty + qty,
          updated_at: new Date().toISOString()
        });
      }
    });

    // 3. Log Activity
    await addDoc(collection(db, 'activity_logs'), {
      org_id: orgId,
      action: `Barcode Intake: +${qty} of ${cleanSku} at ${targetBranch}`,
      timestamp: new Date().toISOString()
    });

    return { success: true, message: `Added ${qty} units of ${cleanSku} to ${targetBranch}.` };
  } catch (err: any) {
    console.error('scanIntake Firestore error:', err);
    return { success: false, message: err.message || 'Intake failed.' };
  }
}

// ----------------------------------------------------
// DASHBOARD 3-CARD SUMMARY
// ----------------------------------------------------
export async function getDashboardSummary(orgId: string): Promise<{
  totalProducts: number;
  lowStockAlerts: number;
  totalUnits: number;
}> {
  try {
    const products = await getInventory(orgId);
    const totalProducts = products.length;
    let lowStockAlerts = 0;
    let totalUnits = 0;

    for (const p of products) {
      const total = p.total_stock || 0;
      totalUnits += total;
      if (total <= (p.safety_stock || 10)) {
        lowStockAlerts++;
      }
    }

    return {
      totalProducts,
      lowStockAlerts,
      totalUnits
    };
  } catch (e) {
    return { totalProducts: 0, lowStockAlerts: 0, totalUnits: 0 };
  }
}

// ----------------------------------------------------
// REAL PURCHASE ORDER & REORDER APPROVAL
// ----------------------------------------------------
export async function getReorders(orgId: string): Promise<PurchaseOrder[]> {
  try {
    const q = query(collection(db, 'purchase_orders'), where('org_id', '==', orgId));
    const snap = await getDocs(q);
    const pos: PurchaseOrder[] = [];
    snap.forEach(d => {
      pos.push({ id: d.id, ...d.data() } as PurchaseOrder);
    });
    return pos;
  } catch (e) {
    return [];
  }
}

export async function approvePO(
  poId: string, 
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const poRef = doc(db, 'purchase_orders', poId);
    
    await runTransaction(db, async (transaction) => {
      const poDoc = await transaction.get(poRef);
      if (!poDoc.exists()) {
        throw new Error('Purchase Order does not exist.');
      }
      const poData = poDoc.data() as PurchaseOrder;
      if (poData.status === 'Approved' || poData.status === 'Received') {
        throw new Error('Purchase Order is already approved or received.');
      }

      // Mark PO approved
      transaction.update(poRef, {
        status: 'Approved',
        approved_at: new Date().toISOString()
      });

      // Update inventory directly at destination branch
      const invDocId = `${orgId}_${poData.sku}_${poData.branch.replace(/\s+/g, '_')}`;
      const invRef = doc(db, 'inventory', invDocId);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists()) {
        transaction.set(invRef, {
          org_id: orgId,
          sku: poData.sku,
          branch: poData.branch,
          quantity: poData.quantity,
          updated_at: new Date().toISOString()
        });
      } else {
        const curQty = Number(invDoc.data().quantity) || 0;
        transaction.update(invRef, {
          quantity: curQty + poData.quantity,
          updated_at: new Date().toISOString()
        });
      }
    });

    await addDoc(collection(db, 'activity_logs'), {
      org_id: orgId,
      action: `Approved Purchase Order ${poId}`,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ----------------------------------------------------
// REAL REDISTRIBUTION TRANSACTION
// ----------------------------------------------------
export async function approveRedistribution(
  sku: string,
  sourceBranch: string,
  targetBranch: string,
  quantity: number,
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanSku = sku.trim().toUpperCase();
    const qty = Number(quantity);

    if (qty <= 0) {
      return { success: false, error: 'Transfer quantity must be greater than zero.' };
    }
    if (sourceBranch === targetBranch) {
      return { success: false, error: 'Source and target branches must be different.' };
    }

    const srcInvId = `${orgId}_${cleanSku}_${sourceBranch.replace(/\s+/g, '_')}`;
    const tgtInvId = `${orgId}_${cleanSku}_${targetBranch.replace(/\s+/g, '_')}`;

    const srcRef = doc(db, 'inventory', srcInvId);
    const tgtRef = doc(db, 'inventory', tgtInvId);

    await runTransaction(db, async (transaction) => {
      const srcDoc = await transaction.get(srcRef);
      if (!srcDoc.exists()) {
        throw new Error(`No stock found for SKU ${cleanSku} at ${sourceBranch}.`);
      }

      const srcQty = Number(srcDoc.data().quantity) || 0;
      if (srcQty < qty) {
        throw new Error(`Insufficient stock at ${sourceBranch}. Available: ${srcQty}, Requested: ${qty}`);
      }

      // Deduct from source branch
      transaction.update(srcRef, {
        quantity: srcQty - qty,
        updated_at: new Date().toISOString()
      });

      // Add to target branch
      const tgtDoc = await transaction.get(tgtRef);
      if (!tgtDoc.exists()) {
        transaction.set(tgtRef, {
          org_id: orgId,
          sku: cleanSku,
          branch: targetBranch,
          quantity: qty,
          updated_at: new Date().toISOString()
        });
      } else {
        const tgtQty = Number(tgtDoc.data().quantity) || 0;
        transaction.update(tgtRef, {
          quantity: tgtQty + qty,
          updated_at: new Date().toISOString()
        });
      }
    });

    // Record completed transfer history
    await addDoc(collection(db, 'redistributions'), {
      org_id: orgId,
      sku: cleanSku,
      source_branch: sourceBranch,
      target_branch: targetBranch,
      transfer_qty: qty,
      status: 'Completed',
      timestamp: new Date().toISOString()
    });

    await addDoc(collection(db, 'activity_logs'), {
      org_id: orgId,
      action: `Redistributed ${qty} units of ${cleanSku} from ${sourceBranch} to ${targetBranch}`,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ----------------------------------------------------
// OCR INVOICE HELPER (Tesseract.js - Real, No Fake Data)
// ----------------------------------------------------
export async function extractInvoiceWithOCR(imageUri: string): Promise<{
  invoiceNumber?: string;
  totalAmount?: number;
  extractedText: string;
}> {
  try {
    const Tesseract = require('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(
      imageUri,
      'eng',
      { logger: () => {} }
    );

    // Extract invoice number pattern (e.g. INV-1234 or Invoice: 1234)
    let invoiceNumber: string | undefined;
    const invMatch = text.match(/(?:inv(?:oice)?[\s#:\-]+)([A-Z0-9\-]+)/i);
    if (invMatch) {
      invoiceNumber = invMatch[1].trim();
    }

    // Extract total amount pattern (e.g. Total: $120.00)
    let totalAmount: number | undefined;
    const totalMatch = text.match(/(?:total|amount due|balance due)[\s:$]*([0-9,]+\.[0-9]{2})/i);
    if (totalMatch) {
      totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));
    }

    return {
      invoiceNumber,
      totalAmount,
      extractedText: text
    };
  } catch (e: any) {
    console.warn('OCR extraction warning:', e?.message || e);
    return {
      extractedText: ''
    };
  }
}
