import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, 
  RefreshControl, ActivityIndicator, Alert, ScrollView, Modal, Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
  getAuthSession, getInventory, ProductItem, approveRedistribution, generateUniqueBarcode 
} from '../../services/inventoryService';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

async function getBranches(orgId: string): Promise<string[]> {
  try {
    const q = query(collection(db, 'branches'), where('org_id','==',orgId));
    const snap = await getDocs(q);
    if (snap.empty) return ['Main Warehouse','North Branch','South Branch'];
    return snap.docs.map(d => d.data().name as string);
  } catch {
    return ['Main Warehouse','North Branch','South Branch'];
  }
}

type FilterType = 'all' | 'market' | 'requests' | 'customer' | 'fastest' | 'stagnated' | 'expiring90' | 'countdown' | 'expired';
type AddMode = 'from_inventory' | 'manual' | 'scan';
type PurchaseItem = { id:string; productName:string; sku:string; barcode:string; qty:string; note:string; source:AddMode; createdAt:string; status:'pending'|'completed' };
type RequestItem = { id:string; customerName:string; productName:string; sku:string; barcode:string; qty:string; note:string; source:AddMode; createdAt:string; status:'requested'|'fulfilled' };

const KEY_PURCHASE = 'market_purchase_list_v2';
const KEY_REQUEST = 'customer_request_list_v2';

export default function InventoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [branches, setBranches] = useState<string[]>(['Main Warehouse','North Branch','South Branch']);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [userOrgId, setUserOrgId] = useState('ORG-DEMO-001');
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [purchaseList, setPurchaseList] = useState<PurchaseItem[]>([]);
  const [requestList, setRequestList] = useState<RequestItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'market'|'requests'>('market');
  const [addMode, setAddMode] = useState<AddMode>('from_inventory');
  const [selectedProductSku, setSelectedProductSku] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualSku, setManualSku] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const [showMarketPicker, setShowMarketPicker] = useState(false);
  const [marketPickerProduct, setMarketPickerProduct] = useState<ProductItem | null>(null);
  const [tempMarketDate, setTempMarketDate] = useState(new Date());

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProduct, setTransferProduct] = useState<ProductItem|null>(null);
  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [transferQty, setTransferQty] = useState('');

  const loadData = useCallback(async () => {
    try {
      const { user } = await getAuthSession();
      if (!user) { router.replace('/login'); return; }
      const orgId = user.org_id || 'ORG-DEMO-001';
      setUserOrgId(orgId);
      setCurrencySymbol(user.currency_symbol || '₦');
      const [items, bList] = await Promise.all([getInventory(orgId), getBranches(orgId)]);
      setProducts(items);
      if (bList.length > 0) setBranches(bList);
      const pData = await AsyncStorage.getItem(KEY_PURCHASE);
      const rData = await AsyncStorage.getItem(KEY_REQUEST);
      setPurchaseList(pData ? JSON.parse(pData) : []);
      setRequestList(rData ? JSON.parse(rData) : []);
    } catch (e) {
      console.error('Inventory load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  // ADD MARKET DATE WITH SELECT CHECK
  const handleAddMarketDate = async (product: ProductItem, date: Date) => {
    try {
      const dateStr = date.toISOString();
      const existing = (product as any).market_dates || (product as any).marketDates || [];
      const exists = existing.some((d:string) => new Date(d).toDateString() === date.toDateString());
      if (exists) {
        Alert.alert('Already selected', 'This date is already added. Tap the pill to deselect it.');
        return;
      }

      try {
        const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',product.sku));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docRef = snap.docs[0].ref;
          await updateDoc(docRef, { market_dates: arrayUnion(dateStr) });
        }
      } catch (err) { console.log('firestore update failed, local only', err); }

      setProducts(prev => prev.map(p => {
        if (p.sku === product.sku) {
          const existing = (p as any).market_dates || (p as any).marketDates || [];
          return { ...p, market_dates: [...existing, dateStr], marketDates: [...existing, dateStr] } as any;
        }
        return p;
      }));
      Alert.alert('Added ✓', `Market date ${date.toLocaleDateString()} selected`);
    } catch (e:any) { Alert.alert('Error', e.message); }
    setShowMarketPicker(false);
    setMarketPickerProduct(null);
  };

  // DESELECT / REMOVE MARKET DATE
  const handleRemoveMarketDate = async (product: ProductItem, dateIso: string) => {
    Alert.alert('Deselect date?', `Remove ${new Date(dateIso).toLocaleDateString()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove ✕', style: 'destructive', onPress: async () => {
        try {
          const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',product.sku));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docRef = snap.docs[0].ref;
            const current = snap.docs[0].data().market_dates || [];
            const filtered = current.filter((d:string) => d !== dateIso);
            await updateDoc(docRef, { market_dates: filtered });
          }
        } catch (err) { console.log('remove failed', err); }

        setProducts(prev => prev.map(p => {
          if (p.sku === product.sku) {
            const existing = (p as any).market_dates || (p as any).marketDates || [];
            const filtered = existing.filter((d:string) => d !== dateIso);
            return { ...p, market_dates: filtered, marketDates: filtered } as any;
          }
          return p;
        }));
      }}
    ]);
  };

  const openTransfer = (item: ProductItem) => {
    setTransferProduct(item);
    const withStock = item.branches?.filter(b=>b.quantity>0) || [];
    setFromBranch(withStock[0]?.branch || branches[0] || 'Main Warehouse');
    const other = branches.filter(b=> b !== (withStock[0]?.branch || branches[0]));
    setToBranch(other[0] || branches[1] || 'North Branch');
    setTransferQty('');
    setShowTransferModal(true);
  };

  const confirmTransfer = async () => {
    if (!transferProduct) return;
    if (!fromBranch || !toBranch) return Alert.alert('Select both branches');
    if (fromBranch === toBranch) return Alert.alert('Source and target must be different');
    const qtyNum = Number(transferQty);
    if (!qtyNum || qtyNum <=0) return Alert.alert('Enter valid quantity');
    const srcQty = transferProduct.branches?.find(b=>b.branch===fromBranch)?.quantity || 0;
    if (srcQty < qtyNum) return Alert.alert(`Insufficient stock`, `Only ${srcQty} available in ${fromBranch}`);
    try {
      const res = await approveRedistribution(transferProduct.sku, fromBranch, toBranch, qtyNum, userOrgId);
      if (res.success) { 
        Alert.alert('Success', `Moved ${qtyNum} ${transferProduct.name} from ${fromBranch} → ${toBranch}`);
        setShowTransferModal(false);
        loadData(); 
      }
      else { Alert.alert('Transfer Error', res.error || 'Failed.'); }
    } catch(e:any){ Alert.alert('Error', e.message); }
  };

  const savePurchase = async () => {
    if (!qty) return Alert.alert('Enter quantity');
    let productName = manualName; let sku = manualSku; let barcode = manualBarcode;
    if (addMode==='from_inventory') {
      const p = products.find(x=> x.sku===selectedProductSku);
      productName = p?.name || selectedProductSku;
      sku = p?.sku || manualSku;
      barcode = (p as any)?.barcode || manualBarcode || await generateUniqueBarcode(userOrgId);
    }
    if (!productName) return Alert.alert('Pick from inventory OR type name manually');
    if (!barcode) barcode = await generateUniqueBarcode(userOrgId);
    const newItem: PurchaseItem = { id: Date.now().toString(), productName, sku: sku || 'MANUAL', barcode, qty, note, source: addMode, createdAt: new Date().toISOString(), status: 'pending' };
    const newList = [newItem, ...purchaseList];
    await AsyncStorage.setItem(KEY_PURCHASE, JSON.stringify(newList));
    setPurchaseList(newList); setShowModal(false); resetForm();
  };

  const saveRequest = async () => {
    if (!qty || !customerName) return Alert.alert('Enter customer name & quantity');
    let productName = manualName; let sku = manualSku; let barcode = manualBarcode;
    if (addMode==='from_inventory') {
      const p = products.find(x=> x.sku===selectedProductSku);
      productName = p?.name || selectedProductSku;
      sku = p?.sku || manualSku;
      barcode = (p as any)?.barcode || manualBarcode || await generateUniqueBarcode(userOrgId);
    }
    if (!productName) return Alert.alert('Enter product');
    if (!barcode) barcode = await generateUniqueBarcode(userOrgId);
    const newItem: RequestItem = { id: Date.now().toString(), customerName, productName, sku: sku || 'MANUAL', barcode, qty, note, source: addMode, createdAt: new Date().toISOString(), status: 'requested' };
    const newList = [newItem, ...requestList];
    await AsyncStorage.setItem(KEY_REQUEST, JSON.stringify(newList));
    setRequestList(newList); setShowModal(false); resetForm();
  };

  const resetForm = () => { setManualName(''); setManualSku(''); setManualBarcode(''); setQty(''); setNote(''); setCustomerName(''); setSelectedProductSku(''); setAddMode('from_inventory'); setShowScanner(false); };
  const openAddModal = async (type:'market'|'requests') => { 
    setModalType(type); 
    const autoBarcode = await generateUniqueBarcode(userOrgId);
    setManualBarcode(autoBarcode);
    setShowModal(true); 
  };
  const onBarcodeScanned = ({ data }: {data:string}) => { 
    if (/^\d{8,13}$/.test(data)) setManualBarcode(data);
    else setManualSku(data); 
    if(!manualName) setManualName(data); 
    setShowScanner(false); 
    setAddMode('manual'); 
    Alert.alert('Scanned', data); 
  };

  const getFiltered = () => {
    let list = products.filter(p => 
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p as any).item_size?.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      (p as any).barcode?.toLowerCase().includes(search.toLowerCase())
    );
    const now = new Date();
    const in90Days = new Date(); in90Days.setDate(now.getDate() + 90);
    const in30Days = new Date(); in30Days.setDate(now.getDate() + 30);
    switch(activeFilter) {
      case 'market': 
        return list.filter(p => {
          const dates = (p as any).marketDates || (p as any).market_dates;
          return (dates && dates.length > 0) || (p.total_stock || 0) <= (p.safety_stock || 10);
        });
      case 'requests':
      case 'customer': 
        return list.filter(p => {
          const raw = p as any;
          return raw.customer_requested === true || raw.customerRequested === true || raw.isCustomerRequested === true || raw.customer_name || raw.customerName;
        });
      case 'fastest': return [...list].sort((a,b) => ((b as any).sales_count || 0) - ((a as any).sales_count || 0)).slice(0, 20);
      case 'stagnated': return list.filter(p => { const last = (p as any).last_sold_date ? new Date((p as any).last_sold_date) : null; return !last || (now.getTime() - last.getTime()) / (1000*60*60*24) > 30; });
      case 'expiring90': return list.filter(p => { const exp = (p as any).expiry_date ? new Date((p as any).expiry_date) : null; return exp && exp > now && exp <= in90Days; });
      case 'countdown': return list.filter(p => { const exp = (p as any).expiry_date ? new Date((p as any).expiry_date) : null; return exp && exp > now && exp <= in30Days; });
      case 'expired': return list.filter(p => { const exp = (p as any).expiry_date ? new Date((p as any).expiry_date) : null; return exp && exp < now; });
      default: return list;
    }
  };
  const filteredProducts = getFiltered();

  const filters: { key: FilterType, label: string, icon: string }[] = [
    { key: 'all', label: 'All Items', icon: '📦' },
    { key: 'market', label: 'Market Purchase', icon: '🛒' },
    { key: 'requests', label: 'Customer Requests', icon: '🙋' },
    { key: 'fastest', label: 'Fastest Selling', icon: '🔥' },
    { key: 'stagnated', label: 'Stagnated', icon: '💤' },
    { key: 'expiring90', label: '3 Months Expiry', icon: '⏳' },
    { key: 'countdown', label: 'Countdown', icon: '⏰' },
    { key: 'expired', label: 'Expired Alert', icon: '🚨' },
  ];

  const renderProductItem = ({ item }: { item: ProductItem }) => {
    const isLowStock = (item.total_stock || 0) <= (item.safety_stock || 10);
    const expiry = (item as any).expiry_date ? new Date((item as any).expiry_date) : null;
    const salesCount = (item as any).sales_count || 0;
    const itemSize = (item as any).item_size || (item as any).itemSize || '';
    const customerNameValue = (item as any).customer_name || (item as any).customerName || '';
    const marketDatesRaw = (item as any).marketDates || (item as any).market_dates || [];
    
    const isCustomerView = activeFilter==='requests' || activeFilter==='customer';

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={{flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:6}}>
              <Text style={styles.itemName}>{item.name}</Text>
              {itemSize ? <View style={{backgroundColor:'#1E293B', borderWidth:1, borderColor:'#F59E0B', paddingHorizontal:8, paddingVertical:2, borderRadius:10}}><Text style={{color:'#FBBF24', fontSize:11, fontWeight:'800'}}>{itemSize}</Text></View> : null}
            </View>
            <Text style={styles.itemSku}>{item.sku} • {item.category} {customerNameValue ? `• 👤 ${customerNameValue}` : ''}</Text>
            <View style={{flexDirection:'row', gap:6, marginTop:4, alignItems:'center'}}>
              <Text style={{color:'#A5B4FC', fontSize:10, fontWeight:'700'}}>BARCODE:</Text>
              <Text style={{color:'#F8FAFC', fontSize:11, fontWeight:'700', letterSpacing:1}}>{(item as any).barcode || 'No barcode'}</Text>
            </View>

            {/* MARKET PURCHASE PLANNER - INSIDE CUSTOMER REQUESTS WITH SELECT/DESELECT */}
            {isCustomerView && (
              <View style={{marginTop:10, backgroundColor:'#0F172A', borderWidth:1, borderColor:'#F59E0B', borderRadius:12, padding:12}}>
                <Text style={{color:'#FBBF24', fontSize:12, fontWeight:'800'}}>🛒 MARKET PURCHASE PLANNER</Text>
                <Text style={{color:'#94A3B8', fontSize:10, marginTop:2}}>Customer: {customerNameValue || 'Not specified'} • Tap date to deselect</Text>
                
                {marketDatesRaw.length > 0 ? (
                  <View style={{flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:10}}>
                    {marketDatesRaw.map((d:string,i:number)=>(
                      <TouchableOpacity key={i} onPress={()=>handleRemoveMarketDate(item, d)} style={{backgroundColor:'#F59E0B', paddingHorizontal:12, paddingVertical:6, borderRadius:20, flexDirection:'row', alignItems:'center', gap:4}}>
                        <Text style={{color:'#000', fontSize:12, fontWeight:'700'}}>{new Date(d).toLocaleDateString()}  ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={{color:'#64748B', fontSize:11, marginTop:8, fontStyle:'italic'}}>No market date selected yet - add one below</Text>
                )}

                <TouchableOpacity 
                  onPress={()=>{ setMarketPickerProduct(item); setTempMarketDate(new Date()); setShowMarketPicker(true); }}
                  style={{backgroundColor:'#422006', borderWidth:1, borderColor:'#F59E0B', paddingVertical:10, borderRadius:10, marginTop:12, alignItems:'center'}}
                >
                  <Text style={{color:'#FBBF24', fontWeight:'800', fontSize:13}}>📅 Add Market Date</Text>
                </TouchableOpacity>
                <Text style={{color:'#64748B', fontSize:10, marginTop:6, textAlign:'center'}}>Select multiple dates. Tap pill to deselect.</Text>
              </View>
            )}
          </View>
          <View style={[styles.stockBadge, isLowStock ? styles.stockBadgeLow : styles.stockBadgeOk]}>
            <Text style={[styles.stockBadgeText, isLowStock ? styles.stockTextLow : styles.stockTextOk]}>{item.total_stock || 0} units</Text>
          </View>
        </View>
        <View style={styles.branchBreakdown}>
          {item.branches?.map((b, idx) => (
            <View key={idx} style={[styles.branchPill, b.quantity===0 && {opacity:0.5}]}><Text style={styles.branchName}>{b.branch}:</Text><Text style={styles.branchQty}>{b.quantity}</Text></View>
          ))}
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.priceText}>Price: <Text style={styles.priceValue}>{currencySymbol}{item.price.toFixed(2)}</Text>{itemSize ? ` • Size: ${itemSize}` : ''}</Text>
          <TouchableOpacity style={styles.transferButton} onPress={() => openTransfer(item)}><Text style={styles.transferButtonText}>🔄 Transfer</Text></TouchableOpacity>
        </View>
        {isCustomerView && (
          <TouchableOpacity style={[styles.transferButton,{marginTop:10, backgroundColor:'#065F46', borderWidth:1, borderColor:'#10B981'}]}>
            <Text style={[styles.transferButtonText, {color:'#D1FAE5'}]}>✅ Fulfilled - History</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderPurchaseCard = ({ item }: {item: PurchaseItem}) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{flex:1}}><Text style={styles.itemName}>{item.productName}</Text><Text style={styles.itemSku}>{item.sku} • BARCODE: {item.barcode} • {item.source} • {new Date(item.createdAt).toLocaleString()}</Text><Text style={styles.itemSku}>{item.note}</Text></View>
        <View style={[styles.stockBadge, item.status==='completed'?styles.stockBadgeOk:styles.stockBadgeLow]}><Text style={[styles.stockBadgeText, item.status==='completed'?styles.stockTextOk:styles.stockTextLow]}>{item.qty} units • {item.status}</Text></View>
      </View>
      {item.status==='pending' && <TouchableOpacity onPress={async()=>{ const nl=purchaseList.map(x=> x.id===item.id?{...x, status:'completed' as const}:x); await AsyncStorage.setItem(KEY_PURCHASE, JSON.stringify(nl)); setPurchaseList(nl);}} style={[styles.transferButton,{marginTop:8}]}><Text style={styles.transferButtonText}>✅ Mark Purchased - History</Text></TouchableOpacity>}
    </View>
  );
  const renderRequestCard = ({ item }: {item: RequestItem}) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{flex:1}}><Text style={styles.itemName}>{item.customerName} → {item.productName}</Text><Text style={styles.itemSku}>{item.sku} • BARCODE: {item.barcode} • {item.qty} units • {item.source}</Text><Text style={styles.itemSku}>{new Date(item.createdAt).toLocaleString()} • {item.note}</Text></View>
        <View style={[styles.stockBadge, item.status==='fulfilled'?styles.stockBadgeOk:styles.stockBadgeLow]}><Text style={[styles.stockBadgeText, item.status==='fulfilled'?styles.stockTextOk:styles.stockTextLow]}>{item.status}</Text></View>
      </View>
      {item.status==='requested' && <TouchableOpacity onPress={async()=>{ const nl=requestList.map(x=> x.id===item.id?{...x, status:'fulfilled' as const}:x); await AsyncStorage.setItem(KEY_REQUEST, JSON.stringify(nl)); setRequestList(nl);}} style={[styles.transferButton,{marginTop:8}]}><Text style={styles.transferButtonText}>✅ Fulfilled - History</Text></TouchableOpacity>}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#4F46E5" /><Text style={styles.loadingText}>Loading Inventory...</Text></View>;

  let dataToShow:any[] = filteredProducts;
  let renderItem:any = renderProductItem;
  if (activeFilter==='market' && filteredProducts.length===0 && purchaseList.length>0) {
    dataToShow = purchaseList; renderItem = renderPurchaseCard;
  }
  if ((activeFilter==='requests' || activeFilter==='customer') && filteredProducts.length===0 && requestList.length>0) {
    dataToShow = requestList; renderItem = renderRequestCard;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Catalog</Text>
        <TextInput style={styles.searchInput} placeholder="Search by SKU, Name, Size or Barcode..." placeholderTextColor="#64748B" value={search} onChangeText={setSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12, paddingRight: 20 }}>
          {filters.map(f => (
            <TouchableOpacity key={f.key} onPress={() => setActiveFilter(f.key)} style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}>
              <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>{f.icon} {f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={dataToShow}
        keyExtractor={(item:any) => item.sku || item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No Products in {filters.find(f=>f.key===activeFilter)?.label}</Text>
            <Text style={styles.emptySubtitle}>Add products marked as Customer Request - they will appear here with Market Planner.</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/add-item')}><Text style={styles.addBtnText}>+ Add Product</Text></TouchableOpacity>
          </View>
        }
      />

      {showMarketPicker && (
        <View style={{position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#0F172A', padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, borderColor:'#F59E0B'}}>
          <Text style={{color:'#F8FAFC', fontWeight:'800', fontSize:16, marginBottom:10}}>Select Market Date for {marketPickerProduct?.name}</Text>
          <DateTimePicker value={tempMarketDate} mode="date" minimumDate={new Date()} display={Platform.OS==='ios' ? 'spinner' : 'default'} onChange={(e,d)=>{ if(d) setTempMarketDate(d); if(Platform.OS==='android' && d){ handleAddMarketDate(marketPickerProduct!, d); } }} />
          {Platform.OS==='ios' && (
            <View style={{flexDirection:'row', gap:10, marginTop:12}}>
              <TouchableOpacity onPress={()=>setShowMarketPicker(false)} style={[styles.primaryBtn, {flex:1, backgroundColor:'#1E293B'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={()=>handleAddMarketDate(marketPickerProduct!, tempMarketDate)} style={[styles.primaryBtn, {flex:1, backgroundColor:'#F59E0B'}]}><Text style={[styles.primaryBtnText, {color:'#000'}]}>Select Date</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <Modal visible={showTransferModal} transparent animationType="slide">
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#0F172A', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:40}}>
            <Text style={{color:'#F8FAFC', fontSize:18, fontWeight:'800', marginBottom:4}}>Transfer Stock</Text>
            <Text style={{color:'#94A3B8', fontSize:12, marginBottom:16}}>{transferProduct?.name} ({transferProduct?.sku})</Text>
            <Text style={styles.label}>FROM</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={fromBranch} onValueChange={setFromBranch} style={{color:'#F8FAFC'}}>
                {branches.map(b=> {
                  const qty = transferProduct?.branches?.find(x=>x.branch===b)?.quantity || 0;
                  return <Picker.Item key={b} label={`${b} — ${qty} units`} value={b} />
                })}
              </Picker>
            </View>
            <Text style={styles.label}>TO</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={toBranch} onValueChange={setToBranch} style={{color:'#F8FAFC'}}>
                {branches.filter(b=>b!==fromBranch).map(b=> <Picker.Item key={b} label={b} value={b} />)}
              </Picker>
            </View>
            <Text style={styles.label}>QUANTITY</Text>
            <TextInput value={transferQty} onChangeText={setTransferQty} keyboardType="numeric" placeholder={`Max: ${transferProduct?.branches?.find(b=>b.branch===fromBranch)?.quantity || 0}`} placeholderTextColor="#64748B" style={styles.searchInput} />
            <View style={{flexDirection:'row', gap:10, marginTop:20}}>
              <TouchableOpacity onPress={()=>setShowTransferModal(false)} style={[styles.primaryBtn,{flex:1, backgroundColor:'#1E293B'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={confirmTransfer} style={[styles.primaryBtn,{flex:1}]}><Text style={styles.primaryBtnText}>Confirm Transfer</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showModal} animationType="slide">
        <View style={{flex:1, backgroundColor:'#090D16', padding:20, paddingTop:60}}>
          <Text style={{color:'#F8FAFC', fontSize:20, fontWeight:'800', marginBottom:16}}>{modalType==='market' ? 'Add Market Purchase' : 'Add Customer Request'} - Auto Barcode</Text>
          <View style={{backgroundColor:'#0F172A', padding:12, borderRadius:10, borderWidth:1, borderColor:'#4F46E5', marginBottom:12}}>
            <Text style={{color:'#A5B4FC', fontSize:10, fontWeight:'700'}}>AUTO BARCODE</Text>
            <Text style={{color:'#F8FAFC', fontSize:16, fontWeight:'800', letterSpacing:2, marginTop:4}}>{manualBarcode}</Text>
          </View>
          <TextInput placeholder="Product Name" placeholderTextColor="#64748B" value={manualName} onChangeText={setManualName} style={styles.searchInput} />
          <View style={{height:10}} />
          {modalType==='requests' && (<><TextInput placeholder="Customer Name" placeholderTextColor="#64748B" value={customerName} onChangeText={setCustomerName} style={styles.searchInput} /><View style={{height:10}} /></>)}
          <TextInput placeholder="Quantity Needed" placeholderTextColor="#64748B" value={qty} onChangeText={setQty} keyboardType="numeric" style={styles.searchInput} />
          <TouchableOpacity onPress={modalType==='market' ? savePurchase : saveRequest} style={[styles.primaryBtn, {marginTop:20}]}><Text style={styles.primaryBtnText}>Save</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>{setShowModal(false); setShowScanner(false);}} style={{marginTop:12, padding:14}}><Text style={{color:'#94A3B8', textAlign:'center'}}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#090D16' },
  loadingText: { color: '#94A3B8', marginTop: 12 },
  header: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 12, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  searchInput: { backgroundColor: '#1E293B', color: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155', fontSize: 14 },
  label: { color:'#94A3B8', fontSize:11, fontWeight:'700', marginTop:12, marginBottom:6, letterSpacing:1 },
  pickerBox: { backgroundColor:'#1E293B', borderRadius:10, borderWidth:1, borderColor:'#334155', overflow:'hidden' },
  filterChip: { backgroundColor: '#1E293B', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  filterChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  filterText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { padding: 20, paddingBottom: 100 },
  card: { backgroundColor: '#0F172A', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#1E293B' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  itemName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  itemSku: { color: '#94A3B8', fontSize: 12 },
  expiryText: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  alertBadge: { fontSize: 12, marginTop: 6, fontWeight: '800' },
  stockBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  stockBadgeOk: { backgroundColor: '#064E3B' },
  stockBadgeLow: { backgroundColor: '#78350F' },
  stockBadgeText: { fontSize: 12, fontWeight: '700' },
  stockTextOk: { color: '#34D399' },
  stockTextLow: { color: '#FBBF24' },
  branchBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  branchPill: { flexDirection: 'row', backgroundColor: '#1E293B', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', gap: 4 },
  branchName: { color: '#64748B', fontSize: 11 },
  branchQty: { color: '#F8FAFC', fontSize: 11, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1E293B' },
  priceText: { color: '#94A3B8', fontSize: 13 },
  priceValue: { color: '#F8FAFC', fontWeight: '700' },
  transferButton: { backgroundColor: '#312E81', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  transferButtonText: { color: '#A5B4FC', fontSize: 12, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: '#64748B', fontSize: 14, textAlign: 'center', paddingHorizontal: 20, marginBottom: 20 },
  addBtn: { backgroundColor: '#4F46E5', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addBtnText: { color: '#FFFFFF', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 12 },
  primaryBtnText: { color:'#FFFFFF', textAlign:'center', fontWeight:'700' },
});