import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, ScrollView, Modal, Platform, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession, getInventory, ProductItem, approveRedistribution } from '../../services/inventoryService';
import { getSupplierForSku, recordExpiry } from '../../services/expiryHistoryService';
import { collection, query, where, getDocs, updateDoc, deleteDoc, doc, setDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { logProductHistory } from '../../services/historyService';

async function getBranches(orgId: string): Promise<string[]> {
  try {
    const q = query(collection(db, 'branches'), where('org_id','==',orgId));
    const snap = await getDocs(q);
    if (snap.empty) return ['Main Warehouse'];
    return snap.docs.map(d => d.data().name as string);
  } catch { return ['Main Warehouse']; }
}

type FilterType = 'all' | 'market' | 'requests' | 'customer' | 'fastest' | 'stagnated' | 'expiring90' | 'expiring' | 'expiring7' | 'expiring30' | 'countdown' | 'expired' | 'lowstock' | 'units';

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw?.toDate === 'function') return raw.toDate();
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDate(raw: any): string {
  const d = parseDate(raw);
  if (!d) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(raw: any): string {
  const d = parseDate(raw);
  if (!d) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InventoryScreen({ initialFilter }: { initialFilter?: FilterType } = {}) {
  const router = useRouter();
  const params = useLocalSearchParams() as any;
  const paramFilter = params?.filter as FilterType | undefined;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [branches, setBranches] = useState<string[]>(['Main Warehouse']);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter || paramFilter || 'all');
  const [userOrgId, setUserOrgId] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [showMarketPicker, setShowMarketPicker] = useState(false);
  const [marketPickerProduct, setMarketPickerProduct] = useState<ProductItem | null>(null);
  const [tempMarketDate, setTempMarketDate] = useState(new Date());
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProduct, setTransferProduct] = useState<ProductItem|null>(null);
  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductItem|null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [expiryProduct, setExpiryProduct] = useState<ProductItem | null>(null);
  const [expiryQty, setExpiryQty] = useState('');
  const [expirySupplier, setExpirySupplier] = useState('');
  const [expiryAction, setExpiryAction] = useState<'exchanged' | 'replaced' | 'thrown_away' | ''>('');
  const [expiryNotes, setExpiryNotes] = useState('');
  const [expirySaving, setExpirySaving] = useState(false);
  const [showExpiryHistoryModal, setShowExpiryHistoryModal] = useState(false);
  const [expiryHistoryList, setExpiryHistoryList] = useState<any[]>([]);
  const [expiryHistoryLoading, setExpiryHistoryLoading] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [imagePickerProduct, setImagePickerProduct] = useState<ProductItem | null>(null);

  const formatMoney = useCallback((value: number) => {
    return `${currencySymbol}${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currencySymbol]);

  const loadData = useCallback(async () => {
    try {
      const { user } = await getAuthSession();
      if (!user) { router.replace('/phone-login'); return; }
      const orgId = user.org_id || '';
      setUserOrgId(orgId);
      setCurrencySymbol(user.currency_symbol || '₦');
      const [items, bList] = await Promise.all([getInventory(orgId), getBranches(orgId)]);
      setProducts(items);
      if (bList.length > 0) setBranches(bList);
    } catch (e) { console.error(e); } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if(initialFilter || paramFilter) setActiveFilter((initialFilter || paramFilter) as FilterType); }, [initialFilter, paramFilter]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const loadHistory = async () => {
    if (!userOrgId) return;
    setHistoryLoading(true);
    try {
      const q = query(collection(db, 'history'), where('org_id', '==', userOrgId), orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      setHistoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { setHistoryList([]); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = () => { setShowHistoryModal(true); loadHistory(); };

  const loadExpiryHistory = async () => {
    if (!userOrgId) return;
    setExpiryHistoryLoading(true);
    try {
      const q = query(collection(db, 'expiry_history'), where('org_id', '==', userOrgId), orderBy('disposed_at', 'desc'), limit(200));
      const snap = await getDocs(q);
      setExpiryHistoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      try {
        const q2 = query(collection(db, 'expiry_history'), where('org_id', '==', userOrgId), limit(200));
        const snap2 = await getDocs(q2);
        const list = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => String(b.disposed_at || '').localeCompare(String(a.disposed_at || '')));
        setExpiryHistoryList(list);
      } catch { setExpiryHistoryList([]); }
    } finally { setExpiryHistoryLoading(false); }
  };

  const openExpiryHistory = useCallback(() => {
    setShowExpiryModal(false);
    setShowExpiryHistoryModal(true);
    loadExpiryHistory();
  }, [userOrgId]);

  const openExpiryForm = async (item: ProductItem) => {
    setExpiryProduct(item);
    setExpiryQty('');
    setExpiryNotes('');
    setExpiryAction('');
    setExpirySupplier('');
    setShowExpiryModal(true);
    const sup = await getSupplierForSku(userOrgId, item.sku);
    if (sup) setExpirySupplier(sup);
  };

  const saveExpiry = async () => {
    if (!expiryProduct) return;
    if (expirySaving) return;
    const qtyNum = Number(expiryQty);
    if (!qtyNum || qtyNum <= 0) return Alert.alert('Required', 'Enter quantity disposed.');
    if (qtyNum > (expiryProduct.total_stock || 0)) return Alert.alert('Insufficient stock', `Only ${expiryProduct.total_stock || 0} in stock. Cannot dispose more than available stock.`);
    if (!expirySupplier.trim()) return Alert.alert('Required', 'Enter supplier name.');
    if (!expiryAction) return Alert.alert('Required', 'Select a disposal outcome: Exchanged, Replaced or Thrown Away.');
    setExpirySaving(true);
    try {
      const res = await recordExpiry({
        productId: (expiryProduct as any).id || '',
        productName: expiryProduct.name,
        sku: expiryProduct.sku,
        barcode: (expiryProduct as any).barcode || '',
        supplier: expirySupplier.trim(),
        qty_sold: expiryProduct.sales_count || 0,
        qty_expired: qtyNum,
        unit_cost: expiryProduct.cost || 0,
        unit_price: expiryProduct.price || 0,
        expiry_date: expiryProduct.expiry_date || '',
        disposed_at: new Date().toISOString().slice(0, 10),
        action: expiryAction as 'exchanged' | 'replaced' | 'thrown_away',
        notes: expiryNotes.trim(),
        branches: expiryProduct.branches || [{ branch: 'Main Warehouse', quantity: expiryProduct.total_stock || 0 }],
      });
      if (!res.success) { Alert.alert('Unable to save', res.error || 'Disposal could not be saved. Please try again.'); return; }
      const label = expiryAction === 'exchanged' ? 'Exchanged' : expiryAction === 'replaced' ? 'Replaced' : 'Thrown Away';
      Alert.alert('Disposal recorded', `${qtyNum} x ${expiryProduct.name} recorded as ${label}. Total value: ${formatMoney(qtyNum * (expiryProduct.cost || 0))}.`);
      setShowExpiryModal(false);
      setExpiryProduct(null);
      loadData();
    } catch (e: any) { Alert.alert('Unable to save', e.message || 'Disposal could not be saved. Please try again.'); }
    finally { setExpirySaving(false); }
  };

  const handleChangeItemImage = (item: ProductItem) => {
    setImagePickerProduct(item);
    setShowImagePickerModal(true);
  };
  const pickImageFromCamera = async () => {
    if (!imagePickerProduct) return;
    setShowImagePickerModal(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow camera access to take a photo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) updateItemImage(imagePickerProduct, result.assets[0].uri);
  };
  const pickImageFromGallery = async () => {
    if (!imagePickerProduct) return;
    setShowImagePickerModal(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow gallery access to select a photo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) updateItemImage(imagePickerProduct, result.assets[0].uri);
  };
  const removeItemImage = async () => {
    if (!imagePickerProduct) return;
    const item = imagePickerProduct;
    setShowImagePickerModal(false);
    updateItemImage(item, '');
  };

  const updateItemImage = async (item: ProductItem, imageUri: string) => {
    setProducts(prev => prev.map(p => p.sku === item.sku ? { ...p, image_url: imageUri } as any : p));
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',item.sku));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { image_url: imageUri, updatedAt: new Date().toISOString() });
      }
      if (imageUri) Alert.alert('Photo updated', 'Item photo has been updated.');
      await logProductHistory(userOrgId, { action: 'IMAGE_CHANGED', productName: item.name, sku: item.sku, details: imageUri ? 'Photo updated' : 'Photo removed' });
    } catch(e:any){ Alert.alert('Unable to save', e.message); loadData(); }
  };

  const openEdit = (item: ProductItem) => {
    setEditProduct(item);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditQty(String(item.total_stock || 0));
    setEditSize((item as any).item_size || '');
    setEditExpiry(item.expiry_date || '');
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editProduct) return;
    if (!editName.trim()) return Alert.alert('Required', 'Enter product name.');
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',editProduct.sku));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, {
          name: editName.trim(),
          price: parseFloat(editPrice) || editProduct.price,
          item_size: editSize,
          expiry_date: editExpiry.trim() || null,
          updatedAt: new Date().toISOString()
        });
      }
      const newQty = parseInt(editQty) || 0;
      const invDocId = `${userOrgId}_${editProduct.sku}_Main_Warehouse`;
      await setDoc(doc(db, 'inventory', invDocId), { org_id: userOrgId, sku: editProduct.sku, branch: 'Main Warehouse', quantity: newQty, updated_at: new Date().toISOString() }, { merge: true });
      await logProductHistory(userOrgId, { action: 'EDITED', productName: editName.trim(), sku: editProduct.sku, details: `Price ${editPrice}, Qty ${newQty}, Size ${editSize}` });
      Alert.alert('Changes saved', 'Item has been updated.');
      setShowEditModal(false);
      loadData();
    } catch(e:any){ Alert.alert('Unable to save', e.message); }
  };

  const handleDelete = (item: ProductItem) => {
    Alert.alert('Delete item?', `Delete "${item.name}" permanently? This cannot be undone.`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        try {
          const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',item.sku));
          const snap = await getDocs(q);
          if (!snap.empty) await deleteDoc(snap.docs[0].ref);
          else await deleteDoc(doc(db, 'products', (item as any).id || item.sku));
          await logProductHistory(userOrgId, { action: 'DELETED', productName: item.name, sku: item.sku, details: 'Deleted from Inventory' });
          setProducts(prev => prev.filter(p=>p.sku !== item.sku));
          Alert.alert('Deleted', 'Item has been removed.');
        } catch(e:any){ Alert.alert('Unable to delete', e.message); }
      }}
    ]);
  };

  const handleAddMarketDate = async (product: ProductItem, date: Date) => {
    const dateStr = date.toISOString();
    const existing = (product as any).market_dates || (product as any).marketDates || [];
    if (existing.some((d:string) => parseDate(d)?.toDateString() === date.toDateString())) { Alert.alert('Already selected', 'This market date has already been added.'); return; }
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',product.sku));
      const snap = await getDocs(q);
      if (!snap.empty) await updateDoc(snap.docs[0].ref, { market_dates: [...existing, dateStr] });
      await logProductHistory(userOrgId, { action: 'MARKET_DATE_ADDED', productName: product.name, sku: product.sku, details: `Market date ${formatDate(date)}` });
    } catch {}
    setProducts(prev => prev.map(p => p.sku === product.sku ? { ...p, market_dates: [...existing, dateStr], marketDates: [...existing, dateStr] } as any : p));
    setShowMarketPicker(false); setMarketPickerProduct(null);
  };

  const handleRemoveMarketDate = async (product: ProductItem, dateIso: string) => {
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',product.sku));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const filtered = (snap.docs[0].data().market_dates || []).filter((d:string) => d !== dateIso);
        await updateDoc(snap.docs[0].ref, { market_dates: filtered });
      }
      await logProductHistory(userOrgId, { action: 'MARKET_DATE_REMOVED', productName: product.name, sku: product.sku, details: `Removed market date ${formatDate(dateIso)}` });
    } catch {}
    setProducts(prev => prev.map(p => {
      if (p.sku === product.sku) {
        const existing = (p as any).market_dates || (p as any).marketDates || [];
        return { ...p, market_dates: existing.filter((d:string)=>d!==dateIso), marketDates: existing.filter((d:string)=>d!==dateIso) } as any;
      }
      return p;
    }));
  };

  const openTransfer = (item: ProductItem) => {
    setTransferProduct(item);
    const withStock = item.branches?.filter(b=>b.quantity>0) || [];
    setFromBranch(withStock[0]?.branch || branches[0] || 'Main Warehouse');
    const other = branches.filter(b=> b !== (withStock[0]?.branch || branches[0]));
    setToBranch(other[0] || branches[1] || 'Main Warehouse');
    setTransferQty(''); setShowTransferModal(true);
  };

  const confirmTransfer = async () => {
    if (!transferProduct) return;
    if (fromBranch === toBranch) return Alert.alert('Invalid transfer', 'Source and destination must be different.');
    const qtyNum = Number(transferQty);
    if (!qtyNum || qtyNum <=0) return Alert.alert('Required', 'Enter a valid quantity.');
    const srcQty = transferProduct.branches?.find(b=>b.branch===fromBranch)?.quantity || 0;
    if (srcQty < qtyNum) return Alert.alert('Insufficient stock', `Only ${srcQty} available in ${fromBranch}.`);
    try {
      const res = await approveRedistribution(transferProduct.sku, fromBranch, toBranch, qtyNum, userOrgId);
      if (res.success) { await logProductHistory(userOrgId, { action: 'TRANSFERRED', productName: transferProduct.name, sku: transferProduct.sku, details: `Moved ${qtyNum} from ${fromBranch} to ${toBranch}` }); Alert.alert('Transfer complete', `${qtyNum} units moved to ${toBranch}.`); setShowTransferModal(false); loadData(); }
      else Alert.alert('Unable to transfer', res.error);
    } catch(e:any){ Alert.alert('Unable to transfer', e.message); }
  };

  const isCustomerRequest = (p: any) => {
    if (!p) return false;
    const getStr = (v: any) => String(v || '').trim().toLowerCase();
    const customerName = getStr(p.customer_name || p.customerName);
    const customerDesc = getStr(p.customer_description || p.customerDescription || p.description);
    const category = getStr(p.category);
    if (p.customer_requested === true || p.customerRequested === true || p.is_customer_request === true || p.customer_requested === 1) return true;
    if (customerName !== '' && !['none','null','undefined',''].includes(customerName)) return true;
    if (customerDesc !== '' && customerDesc.length > 2 && !['none','null'].includes(customerDesc)) return true;
    if (category.includes('customer') || category.includes('request')) return true;
    return false;
  };

  const getFiltered = () => {
    let list = products.filter(p => 
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p as any).item_size?.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      (p as any).barcode?.toLowerCase().includes(search.toLowerCase()) ||
      (p as any).customer_name?.toLowerCase().includes(search.toLowerCase())
    );
    const now = new Date();
    const in7Days = new Date(); in7Days.setDate(now.getDate() + 7);
    const in30Days = new Date(); in30Days.setDate(now.getDate() + 30);
    const in90Days = new Date(); in90Days.setDate(now.getDate() + 90);
    switch(activeFilter) {
      case 'market': return list.filter(p => { const d = (p as any).marketDates || (p as any).market_dates; return (d && d.length>0) || (p.total_stock||0) <= (p.safety_stock||10); });
      case 'lowstock': return list.filter(p => (p.total_stock||0) <= (p.safety_stock||10));
      case 'units': return list;
      case 'requests': case 'customer': return list.filter(p => isCustomerRequest(p));
      case 'fastest': return [...list].sort((a,b)=>((b as any).sales_count||0)-((a as any).sales_count||0)).slice(0,20);
      case 'stagnated': return list.filter(p => { const last = parseDate((p as any).last_sold_date); return !last || (now.getTime()-last.getTime())/(1000*60*60*24)>30; });
      case 'expiring7': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp>=now && exp<=in7Days; });
      case 'expiring30': case 'countdown': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp>=now && exp<=in30Days; });
      case 'expiring90': case 'expiring': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp>=now && exp<=in90Days; });
      case 'expired': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp<now; });
      default: return list;
    }
  };
  const filteredProducts = getFiltered();

  const nowForTotals = new Date();
  const monthKey = `${nowForTotals.getFullYear()}-${String(nowForTotals.getMonth()+1).padStart(2,'0')}`;
  const yearKey = `${nowForTotals.getFullYear()}`;
  const calcTotals = (list: any[]) => {
    let totalValue = 0; let totalQty = 0; let recovered = 0;
    list.forEach((r: any) => {
      const v = Number(r.total_value || (Number(r.qty_expired||0) * Number(r.unit_cost||0)));
      const q = Number(r.qty_expired || 0);
      totalValue += v; totalQty += q;
      if (r.action === 'exchanged' || r.action === 'replaced') recovered += v;
    });
    return { totalValue, totalQty, recovered, netLoss: totalValue - recovered, count: list.length };
  };
  const monthList = expiryHistoryList.filter((r: any) => String(r.disposed_at || '').startsWith(monthKey));
  const yearList = expiryHistoryList.filter((r: any) => String(r.disposed_at || '').startsWith(yearKey));
  const monthTotals = calcTotals(monthList);
  const yearTotals = calcTotals(yearList);

  const filters: { key: FilterType, label: string, icon: any }[] = [
    { key: 'all', label: 'All Items', icon: 'cube-outline' },
    { key: 'expired', label: 'Expired', icon: 'alert-circle-outline' },
    { key: 'expiring7', label: '≤7 Days', icon: 'alarm-outline' },
    { key: 'expiring30', label: '≤30 Days', icon: 'time-outline' },
    { key: 'lowstock', label: 'Low Stock', icon: 'warning-outline' },
    { key: 'market', label: 'Market Purchase', icon: 'storefront-outline' },
    { key: 'requests', label: 'Customer Requests', icon: 'people-outline' },
    { key: 'fastest', label: 'Fastest Selling', icon: 'flame-outline' },
    { key: 'stagnated', label: 'Stagnated', icon: 'moon-outline' },
  ];

  const renderProductItem = ({ item }: { item: ProductItem }) => {
    const isLowStock = (item.total_stock || 0) <= (item.safety_stock || 10);
    const expiry = parseDate((item as any).expiry_date);
    const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now())/(1000*60*60*24)) : null;
    const itemSize = (item as any).item_size || '';
    const customerNameValue = (item as any).customer_name || (item as any).customerName || '';
    const customerDesc = (item as any).customer_description || (item as any).description || (item as any).customerDescription || '';
    const marketDatesRaw = (item as any).marketDates || (item as any).market_dates || [];
    const isCustomerView = activeFilter==='requests' || activeFilter==='customer';
    const imageUrl = (item as any).image_url || '';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <TouchableOpacity onPress={() => handleChangeItemImage(item)} activeOpacity={0.7}>
            {imageUrl ? (<Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" />) : (
              <View style={styles.productImagePlaceholder}><Ionicons name="cube-outline" size={24} color="#8AA99B" /><Text style={styles.tapToAddText}>Add photo</Text></View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{flexDirection:'row', gap:6, alignItems:'center', flexWrap:'wrap'}}>
              <Text style={styles.itemName}>{item.name}</Text>
              {itemSize ? <View style={{backgroundColor:'#0B3B2E', borderWidth:1, borderColor:'#F59E0B', paddingHorizontal:8, paddingVertical:2, borderRadius:10}}><Text style={{color:'#FBBF24', fontSize:11, fontWeight:'800'}}>{itemSize}</Text></View> : null}
            </View>
            <Text style={styles.itemSku}>{item.sku} • {item.category} {customerNameValue ? `• ${customerNameValue}` : ''}</Text>
            {isCustomerView && (<>
              {customerNameValue ? <Text style={{color:'#FBBF24', fontSize:12, fontWeight:'700', marginTop:6}}>Customer: {customerNameValue}</Text> : null}
              {customerDesc ? <Text style={{color:'#CBD5E1', fontSize:12, marginTop:4}}>{customerDesc}</Text> : null}
            </>)}
            <View style={{flexDirection:'row', gap:6, marginTop:4}}><Text style={{color:'#8AA99B', fontSize:10, fontWeight:'700'}}>BARCODE:</Text><Text style={{color:'#FDF6E9', fontSize:11, fontWeight:'700'}}>{(item as any).barcode || 'No barcode'}</Text></View>
            {expiry && <Text style={[styles.expiryText, daysLeft! <=0 ? {color:'#EF4444'} : daysLeft! <=30 ? {color:'#F59E0B'} : {color:'#8AA99B'}]}>Expiry: {formatDate(expiry)} ({daysLeft} days)</Text>}
            {isCustomerView && (
              <View style={{marginTop:10, backgroundColor:'#0B3B2E', borderWidth:1, borderColor:'#2A4A3E', borderRadius:12, padding:12}}>
                <Text style={{color:'#FBBF24', fontSize:12, fontWeight:'800'}}>TARGET MARKET PURCHASE DATES</Text>
                {marketDatesRaw.length>0 ? (<View style={{flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:10}}>{marketDatesRaw.map((d:string,i:number)=>(<TouchableOpacity key={i} onPress={()=>handleRemoveMarketDate(item, d)} style={{backgroundColor:'#F59E0B', paddingHorizontal:12, paddingVertical:6, borderRadius:20}}><Text style={{color:'#000', fontSize:12, fontWeight:'700'}}>{formatDate(d)}  ×</Text></TouchableOpacity>))}</View>) : <Text style={{color:'#8AA99B', fontSize:11, marginTop:6, fontStyle:'italic'}}>No market date set yet</Text>}
                <TouchableOpacity onPress={()=>{ setMarketPickerProduct(item); setTempMarketDate(new Date()); setShowMarketPicker(true); }} style={{backgroundColor:'#1E3A30', borderWidth:1, borderColor:'#F59E0B', paddingVertical:10, borderRadius:10, marginTop:12, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6}}><Ionicons name="calendar-outline" size={15} color="#FBBF24" /><Text style={{color:'#FBBF24', fontWeight:'800'}}>Add Market Date</Text></TouchableOpacity>
              </View>
            )}
          </View>
          <View style={[styles.stockBadge, isLowStock ? styles.stockBadgeLow : styles.stockBadgeOk]}><Text style={[styles.stockBadgeText, isLowStock ? styles.stockTextLow : styles.stockTextOk]}>{item.total_stock||0} units</Text></View>
        </View>
        <View style={styles.branchBreakdown}>{item.branches?.map((b, idx) => (<View key={idx} style={[styles.branchPill, b.quantity===0 && {opacity:0.5}]}><Text style={styles.branchName}>{b.branch}:</Text><Text style={styles.branchQty}>{b.quantity}</Text></View>))}</View>
        <View style={styles.cardBottom}>
          <Text style={styles.priceText}>Price: <Text style={styles.priceValue}>{formatMoney(item.price)}</Text></Text>
          <View style={{flexDirection:'row', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1E3A30', borderColor:'#2A4A3E'}]} onPress={() => openEdit(item)}><Ionicons name="create-outline" size={13} color="#FDF6E9" /><Text style={[styles.actionText, {color:'#FDF6E9'}]}>Edit</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1E3A30', borderColor:'#EF4444'}]} onPress={() => handleDelete(item)}><Ionicons name="trash-outline" size={13} color="#F87171" /><Text style={[styles.actionText, {color:'#F87171'}]}>Delete</Text></TouchableOpacity>
            <TouchableOpacity style={styles.transferButton} onPress={() => openTransfer(item)}><Ionicons name="swap-horizontal-outline" size={13} color="#FDF6E9" /><Text style={styles.transferButtonText}>Move</Text></TouchableOpacity>
          </View>
        </View>
        {(daysLeft !== null && daysLeft <= 90) || (item.total_stock || 0) > 0 ? (
          <TouchableOpacity onPress={() => openExpiryForm(item)} style={{ backgroundColor: daysLeft !== null && daysLeft <= 0 ? '#7F1D1D' : '#78350F', paddingVertical: 10, borderRadius: 10, marginTop: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: daysLeft !== null && daysLeft <= 0 ? '#EF4444' : '#F59E0B' }}>
            <Ionicons name="alert-circle-outline" size={15} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Record Disposal</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FDF6E9" /><Text style={styles.loadingText}>Loading inventory...</Text></View>;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Catalog ({products.length} total)</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <TouchableOpacity onPress={openHistory} style={{ backgroundColor: '#FDF6E9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="time-outline" size={14} color="#0B3B2E" /><Text style={{ color: '#0B3B2E', fontSize: 12, fontWeight: '800' }}>Activity History</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openExpiryHistory} style={{ backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="alert-circle-outline" size={14} color="#000" /><Text style={{ color: '#000', fontSize: 12, fontWeight: '800' }}>Expiry History</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={styles.searchInput} placeholder="Search by SKU, name, size or barcode" placeholderTextColor="#8AA99B" value={search} onChangeText={setSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12, paddingRight: 20 }}>
          {filters.map(f => (<TouchableOpacity key={f.key} onPress={() => setActiveFilter(f.key)} style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}><Ionicons name={f.icon} size={13} color={activeFilter === f.key ? '#0B3B2E' : '#8AA99B'} /><Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>{f.label}</Text></TouchableOpacity>))}
        </ScrollView>
      </View>
      <FlatList data={filteredProducts} keyExtractor={(item:any) => item.sku} renderItem={renderProductItem} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FDF6E9" />} ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="cube-outline" size={48} color="#8AA99B" /><Text style={styles.emptyTitle}>No products in {filters.find(f=>f.key===activeFilter)?.label || activeFilter}</Text><Text style={styles.emptySubtitle}>Try a different filter or add a new item.</Text><TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/add-request')}><Text style={styles.addBtnText}>Add Customer Request</Text></TouchableOpacity></View>} />

      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={{color:'#fff', fontSize:18, fontWeight:'800', marginBottom:12}}>Edit Item</Text>
          <Text style={styles.label}>Product Name</Text><TextInput value={editName} onChangeText={setEditName} style={styles.editInput} placeholderTextColor="#8AA99B" />
          <Text style={styles.label}>Size / Weight (e.g. 900g)</Text><TextInput value={editSize} onChangeText={setEditSize} style={styles.editInput} />
          <Text style={styles.label}>Quantity (Main Warehouse)</Text><TextInput value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={styles.editInput} />
          <Text style={styles.label}>Price</Text><TextInput value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" style={styles.editInput} />
          <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text><TextInput value={editExpiry} onChangeText={setEditExpiry} placeholder="e.g. 2026-11-03" placeholderTextColor="#8AA99B" style={styles.editInput} />
          <View style={{flexDirection:'row', gap:10, marginTop:20}}>
            <TouchableOpacity onPress={()=>setShowEditModal(false)} style={[styles.primaryBtn,{flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={saveEdit} style={[styles.primaryBtn,{flex:1}]}><Text style={styles.primaryBtnText}>Save Changes</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {showMarketPicker && (<View style={{position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#0B3B2E', padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, borderColor:'#2A4A3E'}}><Text style={{color:'#FDF6E9', fontWeight:'800', fontSize:16, marginBottom:10}}>Select Market Date for {marketPickerProduct?.name}</Text><DateTimePicker value={tempMarketDate} mode="date" display={Platform.OS==='ios' ? 'spinner' : 'default'} onChange={(e,d)=>{ if(d) setTempMarketDate(d); if(Platform.OS==='android' && d) handleAddMarketDate(marketPickerProduct!, d); }} />{Platform.OS==='ios' && (<View style={{flexDirection:'row', gap:10, marginTop:12}}><TouchableOpacity onPress={()=>setShowMarketPicker(false)} style={[styles.primaryBtn, {flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={()=>handleAddMarketDate(marketPickerProduct!, tempMarketDate)} style={[styles.primaryBtn, {flex:1, backgroundColor:'#F59E0B'}]}><Text style={[styles.primaryBtnText, {color:'#000'}]}>Select Date</Text></TouchableOpacity></View>)}</View>)}
      <Modal visible={showTransferModal} transparent animationType="slide" onRequestClose={() => setShowTransferModal(false)}><View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'}}><View style={{backgroundColor:'#0B3B2E', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:40}}><Text style={{color:'#FDF6E9', fontSize:18, fontWeight:'800'}}>Transfer Stock</Text><Text style={{color:'#8AA99B', fontSize:12, marginBottom:16}}>{transferProduct?.name}</Text><Text style={styles.label}>From</Text><View style={styles.pickerBox}><Picker selectedValue={fromBranch} onValueChange={setFromBranch} style={{color:'#FDF6E9'}}>{branches.map(b=>{ const qty = transferProduct?.branches?.find(x=>x.branch===b)?.quantity || 0; return <Picker.Item key={b} label={`${b} — ${qty} units`} value={b} />})}</Picker></View><Text style={styles.label}>To</Text><View style={styles.pickerBox}><Picker selectedValue={toBranch} onValueChange={setToBranch} style={{color:'#FDF6E9'}}>{branches.filter(b=>b!==fromBranch).map(b=> <Picker.Item key={b} label={b} value={b} />)}</Picker></View><Text style={styles.label}>Quantity</Text><TextInput value={transferQty} onChangeText={setTransferQty} keyboardType="numeric" placeholder="Quantity" placeholderTextColor="#8AA99B" style={styles.searchInput} /><View style={{flexDirection:'row', gap:10, marginTop:20}}><TouchableOpacity onPress={()=>setShowTransferModal(false)} style={[styles.primaryBtn,{flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={confirmTransfer} style={[styles.primaryBtn,{flex:1}]}><Text style={styles.primaryBtnText}>Confirm Transfer</Text></TouchableOpacity></View></View></View></Modal>

      <Modal visible={showHistoryModal} transparent animationType="slide" onRequestClose={() => setShowHistoryModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#FDF6E9', fontSize: 18, fontWeight: '800' }}>Activity History</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}><Ionicons name="close-outline" size={24} color="#FDF6E9" /></TouchableOpacity>
            </View>
            <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 4 }}>Changes to inventory, by item and date</Text>
            {historyLoading ? <ActivityIndicator color="#FDF6E9" style={{ marginTop: 20 }} /> : (
              <ScrollView style={{ marginTop: 12 }}>
                {historyList.length === 0 ? <Text style={{ color: '#8AA99B', textAlign: 'center', marginTop: 20 }}>No activity yet. Add, edit, delete or move an item to see it here.</Text> : historyList.map((h: any) => {
                  return (
                    <View key={h.id} style={{ backgroundColor: '#1E3A30', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2A4A3E' }}>
                      <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '800' }}>{h.action || 'Action'}</Text>
                      <Text style={{ color: '#FDF6E9', fontSize: 14, fontWeight: '700', marginTop: 2 }}>{h.productName || h.product_name || '-'}</Text>
                      <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 2 }}>{h.details || ''}</Text>
                      <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 4 }}>{formatDateTime(h.createdAt)} {h.sku ? `• ${h.sku}` : ''}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showExpiryModal} transparent animationType="slide" onRequestClose={() => setShowExpiryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity onPress={() => setShowExpiryModal(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, marginBottom: 8, alignSelf: 'flex-start' }}>
                <Ionicons name="arrow-back" size={18} color="#FDF6E9" /><Text style={{ color: '#FDF6E9', fontWeight: '800', fontSize: 15 }}>Back</Text>
              </TouchableOpacity>
              <Text style={{color:'#fff', fontSize:18, fontWeight:'800', marginBottom:4}}>Record Disposal</Text>
              <Text style={{color:'#FBBF24', fontSize:14, fontWeight:'700'}}>{expiryProduct?.name}</Text>
              <Text style={{color:'#8AA99B', fontSize:12, marginTop:4}}>SKU: {expiryProduct?.sku}  •  Sold: {expiryProduct?.sales_count || 0}  •  In stock: {expiryProduct?.total_stock || 0}  •  Expiry: {expiryProduct?.expiry_date ? formatDate(expiryProduct.expiry_date) : '-'}</Text>
              <Text style={{color:'#FDE68A', fontSize:12, fontWeight:'700', marginTop:8}}>Unit cost: {formatMoney(expiryProduct?.cost || 0)}  •  Unit price: {formatMoney(expiryProduct?.price || 0)}</Text>
              <Text style={{color:'#FDE68A', fontSize:12, marginTop:2}}>Total value: {formatMoney((Number(expiryQty) || 0) * (expiryProduct?.cost || 0))}  ({expiryQty || 0} × {formatMoney(expiryProduct?.cost || 0)})</Text>
              <Text style={styles.label}>Quantity Disposed *</Text>
              <TextInput value={expiryQty} onChangeText={setExpiryQty} keyboardType="numeric" placeholder="e.g. 12" placeholderTextColor="#8AA99B" style={styles.editInput} />
              <Text style={styles.label}>Supplier *</Text>
              <TextInput value={expirySupplier} onChangeText={setExpirySupplier} placeholder="Supplier name" placeholderTextColor="#8AA99B" style={styles.editInput} />
              <Text style={styles.label}>Disposal Outcome *</Text>
              <View style={{flexDirection:'row', flexWrap:'wrap', gap:8}}>
                <TouchableOpacity onPress={() => setExpiryAction('exchanged')} style={{backgroundColor: expiryAction==='exchanged' ? '#F59E0B' : '#1E3A30', borderWidth:1, borderColor: expiryAction==='exchanged' ? '#F59E0B' : '#2A4A3E', paddingHorizontal:14, paddingVertical:10, borderRadius:20, alignItems:'center'}}>
                  <Text style={{color: expiryAction==='exchanged' ? '#000' : '#FDF6E9', fontWeight:'800'}}>Exchanged</Text><Text style={{color: expiryAction==='exchanged' ? '#000' : '#8AA99B', fontSize:10, marginTop:2}}>Recovered</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setExpiryAction('replaced')} style={{backgroundColor: expiryAction==='replaced' ? '#F59E0B' : '#1E3A30', borderWidth:1, borderColor: expiryAction==='replaced' ? '#F59E0B' : '#2A4A3E', paddingHorizontal:14, paddingVertical:10, borderRadius:20, alignItems:'center'}}>
                  <Text style={{color: expiryAction==='replaced' ? '#000' : '#FDF6E9', fontWeight:'800'}}>Replaced</Text><Text style={{color: expiryAction==='replaced' ? '#000' : '#8AA99B', fontSize:10, marginTop:2}}>New stock given</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setExpiryAction('thrown_away')} style={{backgroundColor: expiryAction==='thrown_away' ? '#F59E0B' : '#1E3A30', borderWidth:1, borderColor: expiryAction==='thrown_away' ? '#F59E0B' : '#2A4A3E', paddingHorizontal:14, paddingVertical:10, borderRadius:20, alignItems:'center'}}>
                  <Text style={{color: expiryAction==='thrown_away' ? '#000' : '#FDF6E9', fontWeight:'800'}}>Thrown Away</Text><Text style={{color: expiryAction==='thrown_away' ? '#000' : '#8AA99B', fontSize:10, marginTop:2}}>Net loss</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Note (Optional)</Text>
              <TextInput value={expiryNotes} onChangeText={setExpiryNotes} placeholder="e.g. Supplier provided a replacement" placeholderTextColor="#8AA99B" style={styles.editInput} />
              <View style={{flexDirection:'row', gap:10, marginTop:20}}>
                <TouchableOpacity onPress={()=>setShowExpiryModal(false)} style={[styles.primaryBtn,{flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveExpiry} disabled={expirySaving} style={[styles.primaryBtn,{flex:1, opacity: expirySaving ? 0.6 : 1}]}><Text style={styles.primaryBtnText}>{expirySaving ? 'Saving...' : 'Save Disposal'}</Text></TouchableOpacity>
              </View>
              <TouchableOpacity onPress={openExpiryHistory} style={{marginTop:12, alignItems:'center'}}><Text style={{color:'#FBBF24', fontWeight:'700', fontSize:13}}>View Expiry History →</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showExpiryHistoryModal} transparent animationType="slide" onRequestClose={() => setShowExpiryHistoryModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#0B3B2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '92%' }}>
            <TouchableOpacity onPress={() => setShowExpiryHistoryModal(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, marginBottom: 8, alignSelf: 'flex-start' }}>
              <Ionicons name="arrow-back" size={18} color="#FDF6E9" /><Text style={{ color: '#FDF6E9', fontWeight: '800', fontSize: 15 }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ color: '#FDF6E9', fontSize: 20, fontWeight: '800' }}>Expiry History</Text>
            <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 4 }}>{expiryHistoryList.length} disposal records • All branches</Text>
            {expiryHistoryLoading ? <ActivityIndicator color="#FDF6E9" style={{ marginTop: 20 }} /> : (
              <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
                <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 }}>SUMMARY</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: '#1E3A30', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#2A4A3E' }}>
                    <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '800' }}>This Month</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 2 }}>{nowForTotals.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</Text>
                    <Text style={{ color: '#FDF6E9', fontSize: 20, fontWeight: '800', marginTop: 6 }}>{formatMoney(monthTotals.totalValue)}</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 4 }}>Total disposed value</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 8 }}>{monthTotals.totalQty} units • {monthTotals.count} entries</Text>
                    <Text style={{ color: '#34D399', fontSize: 11, marginTop: 2 }}>Recovered value: {formatMoney(monthTotals.recovered)}</Text>
                    <Text style={{ color: '#F87171', fontSize: 11, marginTop: 2 }}>Net loss: {formatMoney(monthTotals.netLoss)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#1E3A30', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#2A4A3E' }}>
                    <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '800' }}>This Year</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 2 }}>{yearKey}</Text>
                    <Text style={{ color: '#FDF6E9', fontSize: 20, fontWeight: '800', marginTop: 6 }}>{formatMoney(yearTotals.totalValue)}</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 4 }}>Total disposed value</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 8 }}>{yearTotals.totalQty} units • {yearTotals.count} entries</Text>
                    <Text style={{ color: '#34D399', fontSize: 11, marginTop: 2 }}>Recovered value: {formatMoney(yearTotals.recovered)}</Text>
                    <Text style={{ color: '#F87171', fontSize: 11, marginTop: 2 }}>Net loss: {formatMoney(yearTotals.netLoss)}</Text>
                  </View>
                </View>
                <Text style={{ color: '#FDF6E9', fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 8 }}>Disposal Records</Text>
                {expiryHistoryList.length === 0 ? (
                  <Text style={{ color: '#8AA99B', textAlign: 'center', marginTop: 20 }}>No disposal records yet. Record a disposal to see it here.</Text>
                ) : expiryHistoryList.map((r: any) => (
                  <View key={r.id} style={{ backgroundColor: '#1E3A30', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2A4A3E' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#FDF6E9', fontSize: 14, fontWeight: '700', flex: 1, paddingRight: 8 }}>{r.productName || r.product_name || r.name || '-'}</Text>
                      <Text style={{ color: '#000', backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 10, fontWeight: '800' }}>{String(r.action || '').toUpperCase().replace('_', ' ')}</Text>
                    </View>
                    <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '700', marginTop: 4 }}>{r.qty_expired || 0} units disposed • {formatMoney(Number(r.total_value || (Number(r.qty_expired||0)*Number(r.unit_cost||0))))}</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 2 }}>{r.qty_expired || 0} × {formatMoney(Number(r.unit_cost||0))} unit cost</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 12, marginTop: 4 }}>Supplier: {r.supplier || '-'}  •  SKU: {r.sku || '-'}</Text>
                    <Text style={{ color: '#8AA99B', fontSize: 11, marginTop: 2 }}>{formatDate(r.disposed_at)}{r.notes ? `  •  ${r.notes}` : ''}</Text>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setShowExpiryHistoryModal(false)} style={[styles.primaryBtn, { marginTop: 12 }]}><Text style={styles.primaryBtnText}>Back to Inventory</Text></TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showImagePickerModal} transparent animationType="slide" onRequestClose={() => setShowImagePickerModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowImagePickerModal(false)} />
          <View style={{ backgroundColor: '#FDF6E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
            <Text style={{ color: '#0B3B2E', fontSize: 18, fontWeight: '800' }}>Change Item Photo</Text>
            <Text style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Select a photo for "{imagePickerProduct?.name}"</Text>
            <TouchableOpacity onPress={pickImageFromCamera} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}><Text style={{ color: '#0B3B2E', fontWeight: '800' }}>Take Photo</Text></TouchableOpacity>
            <TouchableOpacity onPress={pickImageFromGallery} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}><Text style={{ color: '#0B3B2E', fontWeight: '800' }}>Choose from Gallery</Text></TouchableOpacity>
            <TouchableOpacity onPress={removeItemImage} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center' }}><Text style={{ color: '#DC2626', fontWeight: '800' }}>Remove Photo</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowImagePickerModal(false)} style={{ backgroundColor: '#0B3B2E', borderRadius: 12, padding: 14, marginTop: 10, alignItems: 'center' }}><Text style={{ color: '#FDF6E9', fontWeight: '800' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F241D' },
  loadingText: { color: '#8AA99B', marginTop: 12 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: '#0B3B2E' },
  title: { color: '#FDF6E9', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  searchInput: { backgroundColor: '#1E3A30', color: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A4A3E', fontSize: 14 },
  editInput: { backgroundColor: '#1E3A30', color: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A4A3E', fontSize: 14, marginTop: 4 },
  label: { color: '#8AA99B', fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
  pickerBox: { backgroundColor: '#1E3A30', borderRadius: 10, borderWidth: 1, borderColor: '#2A4A3E', overflow: 'hidden' },
  filterChip: { backgroundColor: '#1E3A30', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#2A4A3E', flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChipActive: { backgroundColor: '#FDF6E9', borderColor: '#FDF6E9' },
  filterText: { color: '#8AA99B', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#0B3B2E' },
  listContent: { padding: 20, paddingBottom: 120 },
  card: { backgroundColor: '#1E3A30', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#2A4A3E' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 },
  productImage: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#0B3B2E' },
  productImagePlaceholder: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#0B3B2E', alignItems: 'center', justifyContent: 'center' },
  tapToAddText: { fontSize: 8, color: '#8AA99B', marginTop: 2, fontWeight: '700' },
  itemName: { color: '#FDF6E9', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  itemSku: { color: '#8AA99B', fontSize: 12 },
  expiryText: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  stockBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  stockBadgeOk: { backgroundColor: '#0B3B2E', borderWidth: 1, borderColor: '#2A4A3E' },
  stockBadgeLow: { backgroundColor: '#78350F' },
  stockBadgeText: { fontSize: 12, fontWeight: '700' },
  stockTextOk: { color: '#FDF6E9' },
  stockTextLow: { color: '#FBBF24' },
  branchBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  branchPill: { flexDirection: 'row', backgroundColor: '#0B3B2E', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', gap: 4 },
  branchName: { color: '#8AA99B', fontSize: 11 },
  branchQty: { color: '#FDF6E9', fontSize: 11, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2A4A3E' },
  priceText: { color: '#8AA99B', fontSize: 13 },
  priceValue: { color: '#FDF6E9', fontWeight: '700' },
  transferButton: { backgroundColor: '#0B3B2E', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#2A4A3E' },
  transferButtonText: { color: '#FDF6E9', fontSize: 12, fontWeight: '600' },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#FDF6E9', fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center', marginTop: 12 },
  emptySubtitle: { color: '#8AA99B', fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginBottom: 20 },
  addBtn: { backgroundColor: '#FDF6E9', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  addBtnText: { color: '#0B3B2E', fontWeight: '700' },
  primaryBtn: { backgroundColor: '#0B3B2E', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E' },
  primaryBtnText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#0B3B2E', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#2A4A3E' },
});