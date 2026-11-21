import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export type ShelfPlacement = {
  id?: string;
  org_id: string;
  productId: string;
  productName: string;
  sku?: string;
  barcode?: string;
  qty: number;
  shelfLocation: string;
  staffName: string;
  placedAt: string; // ISO
  notes?: string;
  type: 'PLACED' | 'REMOVED' | 'RETURNED';
};

export const SHELF_LOCATIONS = ['Front Shelf', 'Counter', 'Window Display', 'Fridge', 'Back Shelf', 'Promo Table'];

export async function placeOnShelf(data: Omit<ShelfPlacement, 'id' | 'placedAt' | 'type'> & { notes?: string }): Promise<{ success: boolean; error?: string }> {
  try {
    await addDoc(collection(db, 'shelf_placements'), {
      ...data,
      type: 'PLACED',
      placedAt: new Date().toISOString(),
      createdAt: Date.now(),
    });
    return { success: true };
  } catch (e: any) { return { success: false, error: e?.message || 'Could not save placement' }; }
}

export async function removeFromShelf(data: Omit<ShelfPlacement, 'id' | 'placedAt' | 'type'>): Promise<{ success: boolean; error?: string }> {
  try {
    await addDoc(collection(db, 'shelf_placements'), { ...data, type: 'REMOVED', placedAt: new Date().toISOString(), createdAt: Date.now() });
    return { success: true };
  } catch (e: any) { return { success: false, error: e?.message || 'Could not save removal' }; }
}

export async function getShelfHistory(orgId: string): Promise<ShelfPlacement[]> {
  const q = query(collection(db, 'shelf_placements'), where('org_id', '==', orgId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

// Live shelf = PLACED - REMOVED, grouped by product + location
export function getLiveShelf(list: ShelfPlacement[]) {
  const map = new Map<string, { productName: string; shelfLocation: string; qty: number; lastStaff: string; lastPlacedAt: string; barcode?: string }>();
  for (const r of list) {
    const key = `${r.productName}||${r.shelfLocation}`;
    const cur = map.get(key) || { productName: r.productName, shelfLocation: r.shelfLocation, qty: 0, lastStaff: r.staffName, lastPlacedAt: r.placedAt, barcode: r.barcode };
    cur.qty += r.type === 'PLACED' ? Number(r.qty || 0) : -Number(r.qty || 0);
    if (r.type === 'PLACED') { cur.lastStaff = r.staffName; cur.lastPlacedAt = r.placedAt; }
    map.set(key, cur);
  }
  return [...map.values()].filter(x => x.qty > 0).sort((a, b) => b.lastPlacedAt.localeCompare(a.lastPlacedAt));
}