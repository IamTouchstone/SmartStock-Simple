// services/historyService.ts
// Real implementation - writes Time History to Firestore so Inventory > History modal can show it.
// Kept compatible with existing calls: logProductHistory(orgId, { action, productName, sku, details })
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

type HistoryEntry = {
  action?: string;
  productName?: string;
  product_name?: string;
  sku?: string;
  details?: string;
  [key: string]: any;
};

export const logProductHistory = async (orgIdOrProductId: string, entry: HistoryEntry | any) => {
  if (!orgIdOrProductId) return;
  try {
    const e = entry || {};
    const orgId = e.org_id || e.orgId || orgIdOrProductId;
    const productName = e.productName || e.product_name || e.name || '';
    const action = e.action || e.type || 'UPDATED';
    const sku = e.sku || e.productId || '';
    const details = e.details || e.message || (typeof e.changes === 'string' ? e.changes : JSON.stringify(e.changes || e).slice(0, 500));

    await addDoc(collection(db, 'history'), {
      org_id: orgId,
      action,
      productName,
      product_name: productName,
      sku,
      details,
      createdAt: serverTimestamp(),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.log('history log failed', err);
  }
};