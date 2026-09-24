import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { saveAuthSession } from '../services/inventoryService';

export default function LoginScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert('Required Fields', 'Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Firebase Auth Sign In
        let userCredential;
        try {
          userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        } catch (fbErr: any) {
          // If demo credentials or custom server user
          if (cleanEmail === 'admin@smartstock.io' && cleanPassword === 'password123') {
            const demoUser = {
              uid: 'USR-ADMIN-001',
              email: cleanEmail,
              name: 'Global Owner',
              role: 'Owner',
              org_id: 'ORG-DEMO-001',
              org_name: 'SmartStock Global Retail'
            };
            await saveAuthSession('token_demo_001', demoUser);
            router.replace('/(tabs)/dashboard');
            return;
          }
          throw fbErr;
        }

        const idToken = await userCredential.user.getIdToken();
        
        // Fetch User profile from Firestore
        let userProfile: any = null;
        try {
          const userDocSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
          if (userDocSnap.exists()) {
            userProfile = userDocSnap.data();
          }
        } catch (docErr) {
          console.warn('Profile fetch warning:', docErr);
        }

        const userData = {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          name: userProfile?.name || cleanEmail.split('@')[0],
          role: userProfile?.role || 'Owner',
          org_id: userProfile?.org_id || `ORG-${userCredential.user.uid.slice(0, 6)}`,
          org_name: userProfile?.org_name || 'SmartStock Retail'
        };

        await saveAuthSession(idToken, userData);
        router.replace('/(tabs)/dashboard');

      } else {
        // Sign Up
        if (!orgName.trim()) {
          Alert.alert('Organization Required', 'Please enter your business or store name.');
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        const idToken = await userCredential.user.getIdToken();
        const newOrgId = `ORG-${Date.now().toString().slice(-6)}`;

        const newUserDoc = {
          uid: userCredential.user.uid,
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          role: 'Owner',
          org_id: newOrgId,
          org_name: orgName.trim(),
          created_at: new Date().toISOString()
        };

        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), newUserDoc);
          await setDoc(doc(db, 'organizations', newOrgId), {
            id: newOrgId,
            org_name: orgName.trim(),
            admin_email: cleanEmail,
            created_at: new Date().toISOString()
          });
        } catch (e) {
          console.warn('Could not write user record to Firestore:', e);
        }

        await saveAuthSession(idToken, newUserDoc);
        router.replace('/(tabs)/dashboard');
      }
    } catch (err: any) {
      Alert.alert('Authentication Error', err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Logo & Name */}
        <View style={styles.brandBox}>
          <Text style={styles.brandEmoji}>⚡</Text>
          <Text style={styles.brandTitle}>SmartStock</Text>
          <Text style={styles.brandSubtitle}>Mobile Inventory Retail OS</Text>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, isLogin && styles.tabBtnActive]}
            onPress={() => setIsLogin(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, !isLogin && styles.tabBtnActive]}
            onPress={() => setIsLogin(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Create Org</Text>
          </TouchableOpacity>
        </View>

        {/* Form Inputs */}
        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>BUSINESS / ORGANIZATION NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Apex Electronics Ltd"
                placeholderTextColor="#64748B"
                value={orgName}
                onChangeText={setOrgName}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              placeholder="operator@smartstock.io"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#64748B"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isLogin ? 'Sign In to SmartStock' : 'Register Organization'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Quick Demo Hint */}
          {isLogin && (
            <TouchableOpacity 
              style={styles.demoFillBtn}
              onPress={() => {
                setEmail('admin@smartstock.io');
                setPassword('password123');
              }}
            >
              <Text style={styles.demoFillText}>Fill Demo Credentials (admin@smartstock.io)</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  brandTitle: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
  },
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#4F46E5',
  },
  tabText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  form: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 15,
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  demoFillBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  demoFillText: {
    color: '#6366F1',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
