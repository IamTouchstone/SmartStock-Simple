import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getAuthSession, getInventory } from '../../services/inventoryService';
import { saveIntegrationConfig, getIntegrationConfig, ADAPTERS } from '../../services/integrationService';

export default function IntegrationsScreen() {
  const [orgId, setOrgId] = useState('ORG-DEMO-001');
  const [selected, setSelected] = useState('iclass');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => { (async () => {
    try {
      const session: any = await getAuthSession();
      const org = session?.user?.org_id || 'ORG-DEMO-001';
      setOrgId(org);
      const cfg: any = await getIntegrationConfig(org, selected);
      if (cfg) {
        setApiUrl(cfg.apiUrl || ''); setApiKey(cfg.apiKey || '');
        setWhatsapp(cfg.whatsapp || ''); setEmail(cfg.email || '');
        setEnabled(cfg.enabled ?? true);
      }
    } catch(e) {}
  })(); }, [selected]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await saveIntegrationConfig(orgId, selected, { apiUrl, apiKey, whatsapp, email, enabled });
      Alert.alert('Saved', ADAPTERS[selected].name + ' linked. WhatsApp/Email saved.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLoading(false);
  };

  const handleTest = async () => {
    setLoading(true);
    try {
      const ok = await ADAPTERS[selected].testConnection({ apiUrl, apiKey });
      Alert.alert(ok ? 'Success' : 'Failed', ok ? 'Connection OK (mock) - will use real Iclass API when you get docs' : 'Failed');
    } catch (e: any) { Alert.alert('Test Failed', e.message); }
    setLoading(false);
  };

  const handleSyncNow = async () => {
    setLoading(true);
    try {
      const products = await getInventory(orgId);
      await ADAPTERS[selected].pushStock({ apiUrl, apiKey }, products);
      Alert.alert('Sync Done', 'Pushed ' + products.length + ' products to ' + ADAPTERS[selected].name);
    } catch (e: any) { Alert.alert('Sync Error', e.message); }
    setLoading(false);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{padding:20, paddingTop:60, paddingBottom:40}}>
      <StatusBar style="light" />
      <Text style={s.title}>Integrations & Alerts</Text>
      <Text style={s.sub}>Connect SmartStock to Iclass or any software + WhatsApp alerts</Text>

      <Text style={s.label}>Select Software</Text>
      <View style={s.row}>
        {Object.keys(ADAPTERS).map(id => (
          <TouchableOpacity key={id} onPress={()=>setSelected(id)} style={[s.chip, selected===id && s.chipActive]}>
            <Text style={[s.chipText, selected===id && s.chipActiveText]}>{ADAPTERS[id].name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>API URL (Iclass / Custom)</Text>
      <TextInput style={s.input} value={apiUrl} onChangeText={setApiUrl} placeholder="https://iclass.example.com/api" placeholderTextColor="#64748B" />
      <Text style={s.label}>API Key / Token</Text>
      <TextInput style={s.input} value={apiKey} onChangeText={setApiKey} placeholder="Paste API key here" secureTextEntry placeholderTextColor="#64748B" />

      <View style={s.card}>
        <Text style={s.cardTitle}>Automation Alerts</Text>
        <Text style={s.label}>WhatsApp Number</Text>
        <TextInput style={s.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="+2348012345678" placeholderTextColor="#64748B" />
        <Text style={s.label}>Email for Alerts</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="owner@shop.com" placeholderTextColor="#64748B" />
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:12}}>
          <Text style={{color:'#F1F5F9', fontSize:13}}>Enable Auto Sync & Alerts</Text>
          <Switch value={enabled} onValueChange={setEnabled} trackColor={{false:'#334155', true:'#4F46E5'}} />
        </View>
      </View>

      <TouchableOpacity style={s.btnPrimary} onPress={handleSave}><Text style={s.btnText}>{loading ? 'Saving...' : 'Save Connection'}</Text></TouchableOpacity>
      <View style={{flexDirection:'row', gap:10}}>
        <TouchableOpacity style={[s.btn, {flex:1}]} onPress={handleTest}><Text style={s.btnText}>Test</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, {flex:1, backgroundColor:'#0F172A', borderWidth:1, borderColor:'#334155'}]} onPress={handleSyncNow}><Text style={s.btnText}>Sync Now</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:'#090D16'},
  title:{color:'#F8FAFC', fontSize:22, fontWeight:'800'},
  sub:{color:'#64748B', fontSize:12, marginTop:4, marginBottom:20},
  label:{color:'#94A3B8', fontSize:11, marginTop:16, marginBottom:6, fontWeight:'600'},
  input:{backgroundColor:'#0F172A', color:'#FFF', padding:12, borderRadius:10, borderWidth:1, borderColor:'#1E293B'},
  row:{flexDirection:'row', flexWrap:'wrap', gap:8},
  chip:{paddingHorizontal:10, paddingVertical:8, backgroundColor:'#0F172A', borderRadius:20, borderWidth:1, borderColor:'#1E293B'},
  chipActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  chipText:{color:'#94A3B8', fontSize:11}, chipActiveText:{color:'#FFF'},
  card:{backgroundColor:'#0F172A', padding:14, borderRadius:12, marginTop:20, borderWidth:1, borderColor:'#1E293B'},
  cardTitle:{color:'#F8FAFC', fontWeight:'700', marginBottom:8},
  btnPrimary:{backgroundColor:'#4F46E5', padding:14, borderRadius:10, marginTop:20},
  btn:{backgroundColor:'#1E293B', padding:14, borderRadius:10, marginTop:10},
  btnText:{color:'#FFF', textAlign:'center', fontWeight:'700'}
});