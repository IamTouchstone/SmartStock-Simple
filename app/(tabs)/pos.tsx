import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getAuthSession, getInventory, ProductItem, recordSale, approveRedistribution } from '../../services/inventoryService';

export default function POSScreen() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [cart, setCart] = useState<{sku:string, name:string, price:number, qty:number, barcode?:string}[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [orgId, setOrgId] = useState('ORG-DEMO-001');
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const load = useCallback(async () => {
    const { user } = await getAuthSession();
    setOrgId(user?.org_id || 'ORG-DEMO-001');
    const items = await getInventory(user?.org_id || 'ORG-DEMO-001');
    setProducts(items);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addToCart = (p: ProductItem) => {
    setCart(prev => {
      const found = prev.find(c => c.sku === p.sku);
      if (found) return prev.map(c => c.sku === p.sku ? {...c, qty: c.qty+1} : c);
      return [...prev, { sku: p.sku, name: p.name, price: p.price, qty: 1, barcode: (p as any).barcode }];
    });
  };

  const onBarcodeScanned = ({ data }: {data:string}) => {
    setShowScanner(false);
    // Try find by barcode or sku
    const found = products.find(p => (p as any).barcode === data || p.sku === data.toUpperCase());
    if (found) {
      addToCart(found);
      Alert.alert('Added to Cart', `${found.name} - ${found.sku}`);
    } else {
      // If not found, search field
      setSearch(data);
      Alert.alert('Barcode Scanned', `Searching: ${data}`);
    }
  };

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);

  const handleCompleteSale = async () => {
    if (cart.length === 0) return Alert.alert('Cart empty');
    setProcessing(true);
    try {
      for (const item of cart) {
        await recordSale(item.sku, orgId, item.qty);
        await approveRedistribution(item.sku, 'Main Warehouse', 'Sales', item.qty, orgId).catch(()=>{});
      }
      Alert.alert('Sale Completed', `Sold ${cart.length} items. Total: ₦${total.toFixed(2)}`);
      setCart([]);
      load();
    } catch (e:any) {
      Alert.alert('Sale Error', e.message);
    } finally {
      setProcessing(false);
    }
  };

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p as any).barcode?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <View style={s.center}><ActivityIndicator color="#4F46E5" /></View>;

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.title}>POS - Sales (Barcode Ready)</Text>
        <View style={{flexDirection:'row', gap:8}}>
          <TextInput style={[s.search, {flex:1}]} placeholder="Search name, SKU or scan barcode..." placeholderTextColor="#64748B" value={search} onChangeText={setSearch} />
          <TouchableOpacity onPress={async()=>{ if(!permission?.granted) await requestPermission(); setShowScanner(true); }} style={s.scanBtn}>
            <Text style={s.scanText}>Scan</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{flexDirection:'row', flex:1}}>
        <FlatList style={{flex:2}} data={filtered} keyExtractor={i=>i.sku} contentContainerStyle={{padding:12}}
          renderItem={({item}) => (
            <TouchableOpacity onPress={()=>addToCart(item)} style={s.prodCard}>
              <Text style={s.prodName}>{item.name}</Text>
              <Text style={s.prodSku}>{item.sku} • BARCODE: {(item as any).barcode || 'N/A'} • {item.total_stock} left</Text>
              <Text style={s.prodPrice}>₦{item.price.toFixed(2)} • Sold {(item as any).sales_count || 0}</Text>
              <View style={{flexDirection:'row', height:12, marginTop:4, gap:1}}>
                {((item as any).barcode || '0000000').split('').slice(0,10).map((d:any,i:number)=>(
                  <View key={i} style={{flex:1, backgroundColor: i%2===0?'#F8FAFC':'#1E293B', height: 6 + (parseInt(d||'0')%3)*4}} />
                ))}
              </View>
            </TouchableOpacity>
          )}
        />
        <View style={s.cartBox}>
          <Text style={s.cartTitle}>Cart ({cart.length})</Text>
          {cart.map(c => (
            <View key={c.sku} style={{flexDirection:'row', justifyContent:'space-between', marginBottom:8}}>
              <View style={{flex:1}}>
                <Text style={{color:'#F1F5F9', fontSize:12}}>{c.name} x{c.qty}</Text>
                <Text style={{color:'#64748B', fontSize:9}}>{c.barcode}</Text>
              </View>
              <Text style={{color:'#94A3B8', fontSize:12}}>₦{(c.price*c.qty).toFixed(0)}</Text>
            </View>
          ))}
          <View style={s.divider} />
          <Text style={s.total}>Total: ₦{total.toFixed(2)}</Text>
          <TouchableOpacity onPress={handleCompleteSale} disabled={processing} style={s.payBtn}>
            <Text style={s.payText}>{processing ? 'Processing...' : 'Complete Sale'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>setCart([])} style={{marginTop:10}}><Text style={{color:'#64748B', textAlign:'center'}}>Clear Cart</Text></TouchableOpacity>
        </View>
      </View>

      <Modal visible={showScanner} animationType="slide">
        <View style={{flex:1, backgroundColor:'black'}}>
          <CameraView style={{flex:1}} onBarcodeScanned={onBarcodeScanned} barcodeScannerSettings={{barcodeTypes:['qr','ean13','ean8','code128','upc_a','upc_e']}}>
            <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
              <View style={{width:280, height:180, borderWidth:2, borderColor:'#4F46E5', borderRadius:12}} />
              <Text style={{color:'#FFF', marginTop:16, fontWeight:'700'}}>Point at product barcode</Text>
            </View>
            <View style={{padding:30, alignItems:'center'}}>
              <TouchableOpacity onPress={()=>setShowScanner(false)} style={{backgroundColor:'rgba(255,255,255,0.2)', padding:14, borderRadius:10}}>
                <Text style={{color:'#FFF', fontWeight:'700'}}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1, backgroundColor:'#090D16'},
  center:{flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'#090D16'},
  header:{paddingHorizontal:20, paddingTop:54, paddingBottom:12, backgroundColor:'#0F172A', borderBottomWidth:1, borderBottomColor:'#1E293B'},
  title:{color:'#F8FAFC', fontSize:18, fontWeight:'800', marginBottom:8},
  search:{backgroundColor:'#1E293B', color:'#FFF', paddingHorizontal:14, paddingVertical:10, borderRadius:10, borderWidth:1, borderColor:'#334155'},
  scanBtn:{backgroundColor:'#4F46E5', paddingHorizontal:18, paddingVertical:10, borderRadius:10, justifyContent:'center'},
  scanText:{color:'#FFF', fontWeight:'700', fontSize:12},
  prodCard:{backgroundColor:'#0F172A', padding:12, borderRadius:10, marginBottom:8, borderWidth:1, borderColor:'#1E293B'},
  prodName:{color:'#F1F5F9', fontWeight:'700', fontSize:14},
  prodSku:{color:'#64748B', fontSize:10, marginTop:2},
  prodPrice:{color:'#10B981', fontWeight:'700', marginTop:4, fontSize:12},
  cartBox:{flex:1, backgroundColor:'#0F172A', borderLeftWidth:1, borderLeftColor:'#1E293B', padding:12},
  cartTitle:{color:'#F8FAFC', fontWeight:'800', marginBottom:12},
  divider:{height:1, backgroundColor:'#1E293B', marginVertical:10},
  total:{color:'#F8FAFC', fontWeight:'800', fontSize:16, marginBottom:12},
  payBtn:{backgroundColor:'#4F46E5', paddingVertical:12, borderRadius:10},
  payText:{color:'#FFF', textAlign:'center', fontWeight:'700', fontSize:12}
});