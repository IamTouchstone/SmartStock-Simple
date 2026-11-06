import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, ScrollView, Modal, Platform, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getAuthSession, getInventory, ProductItem, approveRedistribution } from '../../services/inventoryService';
import { collection, query, where, getDocs, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

async function getBranches(orgId: string): Promise<string[]> {
  try {
    const q = query(collection(db, 'branches'), where('org_id','==',orgId));
    const snap = await getDocs(q);
    if (snap.empty) return ['Main Warehouse','North Branch','South Branch'];
    return snap.docs.map(d => d.data().name as string);
  } catch { return ['Main Warehouse','North Branch','South Branch']; }
}

type FilterType = 'all' | 'market' | 'requests' | 'customer' | 'fastest' | 'stagnated' | 'expiring90' | 'expiring' | 'countdown' | 'expired' | 'lowstock' | 'units';

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

export default function InventoryScreen({ initialFilter }: { initialFilter?: FilterType } = {}) {
  const router = useRouter();
  const params = useLocalSearchParams() as any;
  const paramFilter = params?.filter as FilterType | undefined;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [branches, setBranches] = useState<string[]>(['Main Warehouse','North Branch','South Branch']);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter || paramFilter || 'all');
  const [userOrgId, setUserOrgId] = useState('ORG-DEMO-001');
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
    } catch (e) { console.error(e); } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if(initialFilter || paramFilter) setActiveFilter((initialFilter || paramFilter) as FilterType); }, [initialFilter, paramFilter]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleChangeItemImage = async (item: ProductItem) => {
    Alert.alert(
      'Change Item Image',
      `Choose a photo for "${item.name}"`,
      [
        { text: 'Take Photo', onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take a photo'); return; }
            const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
            if (!result.canceled) updateItemImage(item, result.assets[0].uri);
        }},
        { text: 'Choose from Gallery', onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to pick a photo'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
            if (!result.canceled) updateItemImage(item, result.assets[0].uri);
        }},
        { text: 'Remove Photo', style: 'destructive', onPress: () => updateItemImage(item, '') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const updateItemImage = async (item: ProductItem, imageUri: string) => {
    setProducts(prev => prev.map(p => p.sku === item.sku ? { ...p, image_url: imageUri } as any : p));
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',item.sku));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { image_url: imageUri, updatedAt: new Date().toISOString() });
      }
      if (imageUri) Alert.alert('Saved', 'Item photo updated');
    } catch(e:any){ Alert.alert('Save failed', e.message); loadData(); }
  };

  const openEdit = (item: ProductItem) => {
    setEditProduct(item);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditQty(String(item.total_stock || 0));
    setEditSize((item as any).item_size || '');
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editProduct) return;
    if (!editName.trim()) return Alert.alert('Enter name');
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',editProduct.sku));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { name: editName.trim(), price: parseFloat(editPrice) || editProduct.price, item_size: editSize, updatedAt: new Date().toISOString() });
      }
      const newQty = parseInt(editQty) || 0;
      const invDocId = `${userOrgId}_${editProduct.sku}_Main_Warehouse`;
      await setDoc(doc(db, 'inventory', invDocId), { org_id: userOrgId, sku: editProduct.sku, branch: 'Main Warehouse', quantity: newQty, updated_at: new Date().toISOString() }, { merge: true });
      Alert.alert('Success', 'Item corrected');
      setShowEditModal(false);
      loadData();
    } catch(e:any){ Alert.alert('Update failed', e.message); }
  };

  const handleDelete = (item: ProductItem) => {
    Alert.alert('Delete Item?', `Delete "${item.name}" permanently? This cannot be undone.`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        try {
          const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',item.sku));
          const snap = await getDocs(q);
          if (!snap.empty) await deleteDoc(snap.docs[0].ref);
          else await deleteDoc(doc(db, 'products', (item as any).id || item.sku));
          setProducts(prev => prev.filter(p=>p.sku !== item.sku));
          Alert.alert('Deleted', 'Item removed');
        } catch(e:any){ Alert.alert('Delete failed', e.message); }
      }}
    ]);
  };

  const handleAddMarketDate = async (product: ProductItem, date: Date) => {
    const dateStr = date.toISOString();
    const existing = (product as any).market_dates || (product as any).marketDates || [];
    if (existing.some((d:string) => parseDate(d)?.toDateString() === date.toDateString())) { Alert.alert('Already selected'); return; }
    try {
      const q = query(collection(db, 'products'), where('org_id','==',userOrgId), where('sku','==',product.sku));
      const snap = await getDocs(q);
      if (!snap.empty) await updateDoc(snap.docs[0].ref, { market_dates: [...existing, dateStr] });
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
    setToBranch(other[0] || branches[1] || 'North Branch');
    setTransferQty(''); setShowTransferModal(true);
  };

  const confirmTransfer = async () => {
    if (!transferProduct) return;
    if (fromBranch === toBranch) return Alert.alert('Source and target must be different');
    const qtyNum = Number(transferQty);
    if (!qtyNum || qtyNum <=0) return Alert.alert('Enter valid quantity');
    const srcQty = transferProduct.branches?.find(b=>b.branch===fromBranch)?.quantity || 0;
    if (srcQty < qtyNum) return Alert.alert(`Only ${srcQty} available in ${fromBranch}`);
    try {
      const res = await approveRedistribution(transferProduct.sku, fromBranch, toBranch, qtyNum, userOrgId);
      if (res.success) { Alert.alert('Success', `Moved ${qtyNum} to ${toBranch}`); setShowTransferModal(false); loadData(); }
      else Alert.alert('Error', res.error);
    } catch(e:any){ Alert.alert('Error', e.message); }
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
    const now = new Date(); const in90Days = new Date(); in90Days.setDate(now.getDate()+90); const in30Days = new Date(); in30Days.setDate(now.getDate()+30);
    switch(activeFilter) {
      case 'market': return list.filter(p => { const d = (p as any).marketDates || (p as any).market_dates; return (d && d.length>0) || (p.total_stock||0) <= (p.safety_stock||10); });
      case 'lowstock': return list.filter(p => (p.total_stock||0) <= (p.safety_stock||10));
      case 'units': return list;
      case 'requests': case 'customer': return list.filter(p => isCustomerRequest(p));
      case 'fastest': return [...list].sort((a,b)=>((b as any).sales_count||0)-((a as any).sales_count||0)).slice(0,20);
      case 'stagnated': return list.filter(p => { const last = parseDate((p as any).last_sold_date); return !last || (now.getTime()-last.getTime())/(1000*60*60*24)>30; });
      case 'expiring90': case 'expiring': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp>now && exp<=in90Days; });
      case 'countdown': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp>now && exp<=in30Days; });
      case 'expired': return list.filter(p => { const exp = parseDate((p as any).expiry_date); return exp && exp<now; });
      default: return list;
    }
  };
  const filteredProducts = getFiltered();

  const filters: { key: FilterType, label: string, icon: any }[] = [
    { key: 'all', label: 'All Items', icon: 'cube-outline' },
    { key: 'lowstock', label: 'Low Stock', icon: 'warning-outline' },
    { key: 'market', label: 'Market Purchase', icon: 'storefront-outline' },
    { key: 'requests', label: 'Customer Requests', icon: 'people-outline' },
    { key: 'fastest', label: 'Fastest Selling', icon: 'flame-outline' },
    { key: 'stagnated', label: 'Stagnated', icon: 'moon-outline' },
    { key: 'expiring90', label: '3 Months Expiry', icon: 'hourglass-outline' },
    { key: 'countdown', label: 'Countdown', icon: 'time-outline' },
    { key: 'expired', label: 'Expired Alert', icon: 'alert-circle-outline' },
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
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <View style={styles.productImagePlaceholder}>
                <Ionicons name="cube-outline" size={24} color="#8AA99B" />
                <Text style={styles.tapToAddText}>Tap to add</Text>
              </View>
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
            {expiry && <Text style={[styles.expiryText, daysLeft! <=0 ? {color:'#EF4444'} : daysLeft! <=30 ? {color:'#F59E0B'} : {color:'#8AA99B'}]}>Exp: {expiry.toLocaleDateString()} ({daysLeft} days)</Text>}
            {isCustomerView && (
              <View style={{marginTop:10, backgroundColor:'#0B3B2E', borderWidth:1, borderColor:'#2A4A3E', borderRadius:12, padding:12}}>
                <Text style={{color:'#FBBF24', fontSize:12, fontWeight:'800'}}>TARGET MARKET PURCHASE DATES</Text>
                {marketDatesRaw.length>0 ? (<View style={{flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:10}}>{marketDatesRaw.map((d:string,i:number)=>(<TouchableOpacity key={i} onPress={()=>handleRemoveMarketDate(item, d)} style={{backgroundColor:'#F59E0B', paddingHorizontal:12, paddingVertical:6, borderRadius:20}}><Text style={{color:'#000', fontSize:12, fontWeight:'700'}}>{parseDate(d)?.toLocaleDateString()}  x</Text></TouchableOpacity>))}</View>) : <Text style={{color:'#8AA99B', fontSize:11, marginTop:6, fontStyle:'italic'}}>No market date set yet</Text>}
                <TouchableOpacity onPress={()=>{ setMarketPickerProduct(item); setTempMarketDate(new Date()); setShowMarketPicker(true); }} style={{backgroundColor:'#1E3A30', borderWidth:1, borderColor:'#F59E0B', paddingVertical:10, borderRadius:10, marginTop:12, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6}}><Ionicons name="calendar-outline" size={15} color="#FBBF24" /><Text style={{color:'#FBBF24', fontWeight:'800'}}>Add Market Date</Text></TouchableOpacity>
              </View>
            )}
          </View>
          <View style={[styles.stockBadge, isLowStock ? styles.stockBadgeLow : styles.stockBadgeOk]}><Text style={[styles.stockBadgeText, isLowStock ? styles.stockTextLow : styles.stockTextOk]}>{item.total_stock||0} units</Text></View>
        </View>
        <View style={styles.branchBreakdown}>{item.branches?.map((b, idx) => (<View key={idx} style={[styles.branchPill, b.quantity===0 && {opacity:0.5}]}><Text style={styles.branchName}>{b.branch}:</Text><Text style={styles.branchQty}>{b.quantity}</Text></View>))}</View>
        
        <View style={styles.cardBottom}>
          <Text style={styles.priceText}>Price: <Text style={styles.priceValue}>{currencySymbol}{item.price.toFixed(2)}</Text></Text>
          <View style={{flexDirection:'row', gap:6}}>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1E3A30', borderColor:'#2A4A3E'}]} onPress={() => openEdit(item)}><Ionicons name="create-outline" size={13} color="#FDF6E9" /><Text style={[styles.actionText, {color:'#FDF6E9'}]}>Edit</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1E3A30', borderColor:'#EF4444'}]} onPress={() => handleDelete(item)}><Ionicons name="trash-outline" size={13} color="#F87171" /><Text style={[styles.actionText, {color:'#F87171'}]}>Del</Text></TouchableOpacity>
            <TouchableOpacity style={styles.transferButton} onPress={() => openTransfer(item)}><Ionicons name="swap-horizontal-outline" size={13} color="#FDF6E9" /><Text style={styles.transferButtonText}>Move</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FDF6E9" /><Text style={styles.loadingText}>Loading Inventory...</Text></View>;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Catalog ({products.length} total)</Text>
        <TextInput style={styles.searchInput} placeholder="Search by SKU, Name, Size or Barcode..." placeholderTextColor="#8AA99B" value={search} onChangeText={setSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12, paddingRight: 20 }}>
          {filters.map(f => (<TouchableOpacity key={f.key} onPress={() => setActiveFilter(f.key)} style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}><Ionicons name={f.icon} size={13} color={activeFilter === f.key ? '#0B3B2E' : '#8AA99B'} /><Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>{f.label}</Text></TouchableOpacity>))}
        </ScrollView>
      </View>
      <FlatList data={filteredProducts} keyExtractor={(item:any) => item.sku} renderItem={renderProductItem} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FDF6E9" />} ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="cube-outline" size={48} color="#8AA99B" /><Text style={styles.emptyTitle}>No Products in {filters.find(f=>f.key===activeFilter)?.label || activeFilter}</Text><TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/add-request')}><Text style={styles.addBtnText}>+ Add Customer Request</Text></TouchableOpacity></View>} />

      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={{color:'#fff', fontSize:18, fontWeight:'800', marginBottom:12}}>Correct Item</Text>
          <Text style={styles.label}>PRODUCT NAME</Text><TextInput value={editName} onChangeText={setEditName} style={styles.editInput} placeholderTextColor="#8AA99B" />
          <Text style={styles.label}>SIZE / WEIGHT (e.g. 900g)</Text><TextInput value={editSize} onChangeText={setEditSize} style={styles.editInput} />
          <Text style={styles.label}>QUANTITY (Main Warehouse)</Text><TextInput value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={styles.editInput} />
          <Text style={styles.label}>PRICE</Text><TextInput value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" style={styles.editInput} />
          <View style={{flexDirection:'row', gap:10, marginTop:20}}>
            <TouchableOpacity onPress={()=>setShowEditModal(false)} style={[styles.primaryBtn,{flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={saveEdit} style={[styles.primaryBtn,{flex:1}]}><Text style={styles.primaryBtnText}>Save Correction</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {showMarketPicker && (<View style={{position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#0B3B2E', padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, borderColor:'#2A4A3E'}}><Text style={{color:'#FDF6E9', fontWeight:'800', fontSize:16, marginBottom:10}}>Select Market Date for {marketPickerProduct?.name}</Text><DateTimePicker value={tempMarketDate} mode="date" minimumDate={new Date()} display={Platform.OS==='ios' ? 'spinner' : 'default'} onChange={(e,d)=>{ if(d) setTempMarketDate(d); if(Platform.OS==='android' && d) handleAddMarketDate(marketPickerProduct!, d); }} />{Platform.OS==='ios' && (<View style={{flexDirection:'row', gap:10, marginTop:12}}><TouchableOpacity onPress={()=>setShowMarketPicker(false)} style={[styles.primaryBtn, {flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={()=>handleAddMarketDate(marketPickerProduct!, tempMarketDate)} style={[styles.primaryBtn, {flex:1, backgroundColor:'#F59E0B'}]}><Text style={[styles.primaryBtnText, {color:'#000'}]}>Select Date</Text></TouchableOpacity></View>)}</View>)}
      <Modal visible={showTransferModal} transparent animationType="slide"><View style={{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'}}><View style={{backgroundColor:'#0B3B2E', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:40}}><Text style={{color:'#FDF6E9', fontSize:18, fontWeight:'800'}}>Transfer Stock</Text><Text style={{color:'#8AA99B', fontSize:12, marginBottom:16}}>{transferProduct?.name}</Text><Text style={styles.label}>FROM</Text><View style={styles.pickerBox}><Picker selectedValue={fromBranch} onValueChange={setFromBranch} style={{color:'#FDF6E9'}}>{branches.map(b=>{ const qty = transferProduct?.branches?.find(x=>x.branch===b)?.quantity || 0; return <Picker.Item key={b} label={`${b} — ${qty} units`} value={b} />})}</Picker></View><Text style={styles.label}>TO</Text><View style={styles.pickerBox}><Picker selectedValue={toBranch} onValueChange={setToBranch} style={{color:'#FDF6E9'}}>{branches.filter(b=>b!==fromBranch).map(b=> <Picker.Item key={b} label={b} value={b} />)}</Picker></View><Text style={styles.label}>QUANTITY</Text><TextInput value={transferQty} onChangeText={setTransferQty} keyboardType="numeric" placeholder="Qty" placeholderTextColor="#8AA99B" style={styles.searchInput} /><View style={{flexDirection:'row', gap:10, marginTop:20}}><TouchableOpacity onPress={()=>setShowTransferModal(false)} style={[styles.primaryBtn,{flex:1, backgroundColor:'#1E3A30'}]}><Text style={styles.primaryBtnText}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={confirmTransfer} style={[styles.primaryBtn,{flex:1}]}><Text style={styles.primaryBtnText}>Confirm</Text></TouchableOpacity></View></View></View></Modal>
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
  editInput: { backgroundColor: '#1E3A30', color: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A4A3E', fontSize: 14, marginTop:4 },
  label: { color:'#8AA99B', fontSize:11, fontWeight:'700', marginTop:12, marginBottom:6, letterSpacing:1 },
  pickerBox: { backgroundColor:'#1E3A30', borderRadius:10, borderWidth:1, borderColor:'#2A4A3E', overflow:'hidden' },
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
  actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth:1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#FDF6E9', fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign:'center', marginTop: 12 },
  emptySubtitle: { color: '#8AA99B', fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginBottom: 20 },
  addBtn: { backgroundColor: '#FDF6E9', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  addBtnText: { color: '#0B3B2E', fontWeight: '700' },
  primaryBtn: { backgroundColor: '#0B3B2E', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A4A3E' },
  primaryBtnText: { color:'#FFFFFF', textAlign:'center', fontWeight:'700' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'center', padding:20 },
  modalContent: { backgroundColor:'#0B3B2E', borderRadius:16, padding:20, borderWidth:1, borderColor:'#2A4A3E' },
});