import { collection, doc, getDocs, query, where, addDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getAuthSession } from './inventoryService';

export type ExpiryAction = 'exchanged' | 'replaced' | 'thrown_away';

export interface ExpiryHistoryItem {
  id: string;
  productName: string;
  sku: string;
  barcode: string;
  supplier: string;
  qty_sold: number;
  qty_expired: number;
  unit_cost: number;
  unit_price: number;
  unit_value_lost: number;
  total_value: number;
  expiry_date: string;
  disposed_at: string;
  action: ExpiryAction;
  notes: string;
  org_id: string;
  created_at: string;
}

export interface ExpiryTotals {
  totalExpiredValue: number;
  totalExchangedValue: number;
  totalReplacedValue: number;
  totalRecoveredValue: number;
  totalThrownAwayValue: number;
  netLoss: number;
  totalUnitsExpired: number;
  totalUnitsExchanged: number;
  totalUnitsReplaced: number;
  totalUnitsThrownAway: number;
  count: number;
}

export function calcTotals(list: ExpiryHistoryItem[]): ExpiryTotals {
  let totalExpiredValue = 0, totalExchangedValue = 0, totalReplacedValue = 0, totalThrownAwayValue = 0;
  let totalUnitsExpired = 0, totalUnitsExchanged = 0, totalUnitsReplaced = 0, totalUnitsThrownAway = 0;
  list.forEach((it) => {
    const v = Number(it.total_value) || 0;
    const q = Number(it.qty_expired) || 0;
    totalExpiredValue += v;
    totalUnitsExpired += q;
    if (it.action === 'exchanged') { totalExchangedValue += v; totalUnitsExchanged += q; }
    else if (it.action === 'replaced') { totalReplacedValue += v; totalUnitsReplaced += q; }
    else { totalThrownAwayValue += v; totalUnitsThrownAway += q; }
  });
  const totalRecoveredValue = totalExchangedValue + totalReplacedValue;
  return {
    totalExpiredValue, totalExchangedValue, totalReplacedValue, totalRecoveredValue, totalThrownAwayValue,
    netLoss: totalThrownAwayValue,
    totalUnitsExpired, totalUnitsExchanged, totalUnitsReplaced, totalUnitsThrownAway,
    count: list.length,
  };
}

export function actionLabel(a: ExpiryAction): string {
  if (a === 'exchanged') return 'EXCHANGED';
  if (a === 'replaced') return 'REPLACED';
  return 'THROWN AWAY';
}

export async function getSupplierForSku(orgId: string, sku: string): Promise<string> {
  try {
    const q = query(collection(db, 'purchase_orders'), where('org_id', '==', orgId), where('sku', '==', sku.toUpperCase()));
    const snap = await getDocs(q);
    let best: any = null;
    snap.forEach((d) => {
      const data = d.data();
      if (!data.supplier) return;
      if (!best) { best = data; return; }
      const rank = (s: string) => s === 'Received' ? 3 : s === 'Approved' ? 2 : 1;
      if (rank(data.status) > rank(best.status)) best = data;
      else if (rank(data.status) === rank(best.status) && String(data.created_at || '') > String(best.created_at || '')) best = data;
    });
    return best?.supplier || '';
  } catch { return ''; }
}

export async function getExpiryHistory(orgId: string): Promise<ExpiryHistoryItem[]> {
  const q = query(collection(db, 'expiry_history'), where('org_id', '==', orgId));
  const snap = await getDocs(q);
  const list: ExpiryHistoryItem[] = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
  list.sort((a, b) => String(b.disposed_at || '').localeCompare(String(a.disposed_at || '')));
  return list;
}

export async function recordExpiry(input: {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  supplier: string;
  qty_sold: number;
  qty_expired: number;
  unit_cost: number;
  unit_price: number;
  expiry_date: string;
  disposed_at: string;
  action: ExpiryAction;
  notes?: string;
  branches: { branch: string; quantity: number }[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await getAuthSession();
    const orgId = user?.org_id || '';
    if (!orgId) return { success: false, error: 'Not logged in. Please log in again.' };
    if (!input.qty_expired || input.qty_expired <= 0) return { success: false, error: 'Enter qty expired > 0.' };
    if (!input.supplier.trim()) return { success: false, error: 'Enter supplier.' };
    if (!input.action) return { success: false, error: 'Choose Exchanged, Replaced or Thrown Away.' };
    const total_value = Number(input.qty_expired) * Number(input.unit_cost || 0);
    const now = new Date().toISOString();
    const actionText = input.action === 'exchanged' ? 'Exchanged' : input.action === 'replaced' ? 'Replaced' : 'Thrown Away';
    await addDoc(collection(db, 'expiry_history'), {
      productName: input.productName,
      sku: input.sku.toUpperCase(),
      barcode: input.barcode || '',
      supplier: input.supplier.trim(),
      qty_sold: Number(input.qty_sold) || 0,
      qty_expired: Number(input.qty_expired),
      unit_cost: Number(input.unit_cost) || 0,
      unit_price: Number(input.unit_price) || 0,
      unit_value_lost: Number(input.unit_cost) || 0,
      total_value,
      expiry_date: input.expiry_date || '',
      disposed_at: input.disposed_at || now.slice(0, 10),
      action: input.action,
      notes: input.notes || '',
      org_id: orgId,
      created_at: now,
    });
    let remaining = Number(input.qty_expired);
    const sortedBranches = [...(input.branches || [])].sort((a, b) => b.quantity - a.quantity);
    await runTransaction(db, async (t) => {
      for (const b of sortedBranches) {
        if (remaining <= 0) break;
        const invId = `${orgId}_${input.sku.toUpperCase()}_${(b.branch || 'Main Warehouse').replace(/\s+/g, '_')}`;
        const invRef = doc(db, 'inventory', invId);
        const invDoc = await t.get(invRef);
        if (!invDoc.exists()) continue;
        const cur = Number(invDoc.data().quantity) || 0;
        const take = Math.min(cur, remaining);
        if (take > 0) {
          t.update(invRef, { quantity: cur - take, updated_at: now });
          remaining -= take;
        }
      }
    });
    await addDoc(collection(db, 'activity_logs'), {
      org_id: orgId,
      action: `Expiry: ${input.qty_expired} x ${input.productName} (${input.sku}) - ${actionText} - Value ₦${total_value.toLocaleString()}`,
      timestamp: now,
    });
    return { success: true };
  } catch (e: any) {
    let msg = e?.message || 'Failed to save expiry.';
    if (msg.includes('Missing or insufficient') || msg.includes('permission')) msg = 'Missing or insufficient permissions. Go to Firebase Console > Firestore > Rules > allow expiry_history for logged in users, Publish, then log out and log in again.';
    return { success: false, error: msg };
  }
}