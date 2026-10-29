import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCredential, GoogleAuthProvider, updateProfile } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = '283866117860-nu2nk2dn9tvqgfjp9jct277oqrklj57d.apps.googleusercontent.com';
const CURRENCIES = [
  { code: 'NGN', symbol: '₦', label: 'Naira ₦' },
  { code: 'USD', symbol: '$', label: 'Dollar $' },
  { code: 'GHS', symbol: '₵', label: 'Ghana ₵' },
  { code: 'KES', symbol: 'KSh', label: 'Kenya KSh' },
];

export default function LoginScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'login'|'signup'>('login');
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState(CURRENCIES[0]);

  const useProxy = true;
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: '283866117860-nu2nk2dn9tvqgfjp9jct277oqrklj57d.apps.googleusercontent.com',
    redirectUri: AuthSession.makeRedirectUri({ useProxy } as any),
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      handleSocial(credential);
    }
  }, [response]);

  const handleSocial = async (credential: any) => {
    setLoading(true);
    try {
      const result = await signInWithCredential(auth, credential);
      const user = result.user;
      const refDoc = doc(db, 'users', user.uid);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) {
        await setDoc(refDoc, {
          email: user.email,
          displayName: user.displayName || 'Store Owner',
          org_id: `ORG-${user.uid.slice(0,8).toUpperCase()}`,
          store_name: store || `${user.displayName || 'My'}'s Store`,
          currency: currency.code,
          currency_symbol: currency.symbol,
          created_at: new Date().toISOString()
        });
      }
      router.replace('/(tabs)/inventory');
    } catch(e:any) {
      Alert.alert('Google Login Failed', e.message);
    } finally { setLoading(false); }
  };

  const handleEmail = async () => {
    if (!email || !password) { Alert.alert('Enter email and password'); return; }
    if (tab === 'signup' && (!name || !store)) { Alert.alert('Enter full name and store name'); return; }
    setLoading(true);
    try {
      if (tab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, 'users', cred.user.uid), {
          email: email.trim(),
          displayName: name,
          org_id: `ORG-${cred.user.uid.slice(0,8).toUpperCase()}`,
          store_name: store,
          currency: currency.code,
          currency_symbol: currency.symbol,
          created_at: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      router.replace('/(tabs)/inventory');
    } catch(e:any) {
      let msg = e.message;
      if (e.code === 'auth/invalid-credential') msg = 'Wrong email or password. If new, switch to Sign Up.';
      if (e.code === 'auth/user-not-found') msg = 'No account found. Please Sign Up.';
      if (e.code === 'auth/email-already-in-use') msg = 'Email already used. Switch to Login.';
      if (e.code === 'auth/weak-password') msg = 'Password should be at least 6 characters.';
      Alert.alert('Failed', msg);
    } finally { setLoading(false); }
  };

  const handleFacebook = () => {
    Alert.alert('Coming soon', 'Facebook login will be available soon.');
  };

  const handleTwitter = () => {
    Alert.alert('Coming soon', 'Twitter / X login will be available soon.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{padding:24, paddingTop:60}}>
      <View style={styles.logoRow}>
        <Image source={require('../public/icons/icon-192.png')} style={styles.logoImg} resizeMode="contain" />
        <Text style={styles.logoText}>SmartStock</Text>
      </View>
      
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab==='login' && styles.tabActive]} onPress={()=>setTab('login')}><Text style={[styles.tabText, tab==='login' && styles.tabTextActive]}>Login</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab==='signup' && styles.tabActive]} onPress={()=>setTab('signup')}><Text style={[styles.tabText, tab==='signup' && styles.tabTextActive]}>Sign Up</Text></TouchableOpacity>
      </View>

      {tab==='signup' && (
        <>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#64748B" value={name} onChangeText={setName} />
          <Text style={styles.label}>Store Name</Text>
          <TextInput style={styles.input} placeholder="My Store" placeholderTextColor="#64748B" value={store} onChangeText={setStore} />
          <Text style={styles.label}>Select Currency</Text>
          <View style={styles.currRow}>
            {CURRENCIES.map((c)=>(
              <TouchableOpacity key={c.code} style={[styles.currPill, currency.code===c.code && styles.currPillActive]} onPress={()=>setCurrency(c)}>
                <Text style={[styles.currText, currency.code===c.code && styles.currTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor="#64748B" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#64748B" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.primaryBtn} onPress={handleEmail} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>{tab==='login' ? 'Login with Email' : 'Create Account'}</Text>}
      </TouchableOpacity>
      <View style={styles.orRow}><View style={styles.line}/><Text style={styles.orText}>OR</Text><View style={styles.line}/></View>
      <TouchableOpacity style={styles.socialBtn} onPress={() => promptAsync({ useProxy } as any)} disabled={!request}>
        <Text style={styles.socialText}>🔍 Continue with Google</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.socialBtn} onPress={() => router.push('/phone-login' as any)}>
        <Text style={styles.socialText}>📞 Continue with Phone</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.socialBtn} onPress={handleFacebook}>
        <Text style={styles.socialText}>📘 Continue with Facebook</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.socialBtn} onPress={handleTwitter}>
        <Text style={styles.socialText}>🐦 Continue with Twitter / X</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#090D16' },
  logoRow: { flexDirection:'row', alignItems:'center', borderBottomWidth: 0, justifyContent:'center', gap:12, marginBottom:28 },
  logoImg: { width:52, height:52, borderRadius:12, backgroundColor:'#0F2E22' },
  logoText: { color:'#fff', fontSize:26, fontWeight:'800' },
  tabRow: { flexDirection:'row', backgroundColor:'#0F172A', borderRadius:10, padding:4, marginBottom:20 },
  tab: { flex:1, paddingVertical:10, alignItems:'center', borderRadius:8 },
  tabActive: { backgroundColor:'#1E293B' },
  tabText: { color:'#64748B', fontWeight:'700' },
  tabTextActive: { color:'#22D3EE' },
  label: { color:'#94A3B8', fontSize:11, fontWeight:'700', marginTop:12, marginBottom:6, letterSpacing:0.5 },
  input: { backgroundColor:'#0F172A', color:'#fff', padding:14, borderRadius:10, borderWidth:1, borderColor:'#334155' },
  currRow: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  currPill: { backgroundColor:'#0F172A', borderWidth:1, borderColor:'#334155', paddingHorizontal:12, paddingVertical:8, borderRadius:20 },
  currPillActive: { backgroundColor:'#22D3EE', borderColor:'#22D3EE' },
  currText: { color:'#94A3B8', fontSize:12, fontWeight:'600' },
  currTextActive: { color:'#000' },
  primaryBtn: { backgroundColor:'#22D3EE', padding:15, borderRadius:12, alignItems:'center', marginTop:20 },
  primaryText: { color:'#000', fontWeight:'800', fontSize:16 },
  orRow: { flexDirection:'row', alignItems:'center', marginVertical:18 },
  line: { flex:1, height:1, backgroundColor:'#1E293B' },
  orText: { color:'#475569', marginHorizontal:12, fontWeight:'700' },
  socialBtn: { borderWidth:1, borderColor:'#334155', padding:14, borderRadius:10, alignItems:'center', marginBottom:12 },
  socialText: { color:'#E2E8F0', fontWeight:'600' },
});
