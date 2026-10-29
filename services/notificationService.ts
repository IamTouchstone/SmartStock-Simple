import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { getInventory } from './inventoryService';

const CACHE_KEY = 'smartstock_cached_products';
const LAST_NOTIFY_KEY = 'smartstock_last_notify_date';

export async function requestNotificationPermission() {
  return true; // No permission needed for Alert version
}

export async function cacheProductsLocally(orgId: string) {
  try {
    const products = await getInventory(orgId);
    await AsyncStorage.setItem(`${CACHE_KEY}_${orgId}`, JSON.stringify({ products, cachedAt: new Date().toISOString() }));
    return products;
  } catch {
    const cached = await AsyncStorage.getItem(`${CACHE_KEY}_${orgId}`);
    if (cached) return JSON.parse(cached).products;
    return [];
  }
}

export async function checkAlertsAndNotify(orgId: string, forceNow = false) {
  let products: any[] = [];
  try {
    products = await getInventory(orgId);
    await AsyncStorage.setItem(`${CACHE_KEY}_${orgId}`, JSON.stringify({ products, cachedAt: new Date().toISOString() }));
  } catch {
    const cachedStr = await AsyncStorage.getItem(`${CACHE_KEY}_${orgId}`);
    if (!cachedStr) return { notified: false, reason: 'No cached data' };
    products = JSON.parse(cachedStr).products;
  }

  const now = new Date();
  const in7 = new Date(); in7.setDate(now.getDate() + 7);
  const in30 = new Date(); in30.setDate(now.getDate() + 30);

  const lowStock = products.filter((p: any) => (p.total_stock || 0) <= (p.safety_stock || 10) && (p.total_stock || 0) > 0);
  const outOfStock = products.filter((p: any) => (p.total_stock || 0) === 0);
  const expiring7 = products.filter((p: any) => { const e = p.expiry_date ? new Date(p.expiry_date) : null; return e && e > now && e <= in7; });
  const expired = products.filter((p: any) => { const e = p.expiry_date ? new Date(p.expiry_date) : null; return e && e < now; });

  let msg = '';
  if (outOfStock.length) msg += `🚨 Out of Stock (${outOfStock.length}): ${outOfStock.slice(0,3).map((p:any)=>p.name).join(', ')}\n`;
  if (lowStock.length) msg += `⚠️ Low Stock (${lowStock.length}): ${lowStock.slice(0,3).map((p:any)=>p.name).join(', ')}\n`;
  if (expiring7.length) msg += `⏰ Expiring 7d (${expiring7.length}): ${expiring7.slice(0,3).map((p:any)=>p.name).join(', ')}\n`;
  if (expired.length) msg += `❌ Expired (${expired.length}): ${expired.slice(0,3).map((p:any)=>p.name).join(', ')}\n`;

  if (!msg) return { notified: false, reason: 'All stock OK' };

  Alert.alert('SmartStock Daily Alerts (Offline Works)', msg);
  return { notified: true, counts: { lowStock: lowStock.length, outOfStock: outOfStock.length, expiring7: expiring7.length, expired: expired.length } };
}

export async function scheduleDaily8AM(orgId: string) {
  await AsyncStorage.setItem('smartstock_org_id', orgId);
  // In no-package version, we check every time app opens
  return true;
}

export function setupNotificationListener() {
  return () => {};
}