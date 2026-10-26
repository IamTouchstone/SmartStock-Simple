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
  StatusBar,
  Image,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { saveAuthSession } from '../services/inventoryService';

export const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'USD ($) • US Dollar' },
  { code: 'NGN', symbol: '₦', label: 'NGN (₦) • Nigerian Naira' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) • British Pound' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) • Euro' },
  { code: 'ZAR', symbol: 'R', label: 'ZAR (R) • South African Rand' },
  { code: 'GHS', symbol: '₵', label: 'GHS (₵) • Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', label: 'KES (KSh) • Kenyan Shilling' },
  { code: 'CAD', symbol: '$', label: 'CAD ($) • Canadian Dollar' },
  { code: 'AUD', symbol: '$', label: 'AUD ($) • Australian Dollar' },
];

export default function LoginScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Modals
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const formatAuthError = (err: any): string => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password. Please verify your credentials and try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists. Please sign in or use password reset.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact SmartStock support.';
      case 'auth/too-many-requests':
        return 'Access temporarily disabled due to multiple failed attempts. Please try again later or reset your password.';
      case 'auth/network-request-failed':
        return 'Network connection failed. Please check your internet connectivity.';
      default:
        return err?.message || 'Authentication error. Please try again.';
    }
  };

  const handleSignIn = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert('Required Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      const idToken = await userCredential.user.getIdToken();

      // Fetch or initialize Firestore user profile
      let userProfile: any = null;
      try {
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          userProfile = userDocSnap.data();
        } else {
          // Initialize user doc if missing
          userProfile = {
            uid: userCredential.user.uid,
            email: cleanEmail,
            name: cleanEmail.split('@')[0],
            role: 'Owner',
            org_id: `ORG-${userCredential.user.uid.slice(0, 6)}`,
            org_name: 'SmartStock Retail',
            currency: 'USD',
            currency_symbol: '$',
            created_at: new Date().toISOString()
          };
          await setDoc(userDocRef, userProfile);
        }
      } catch (docErr) {
        console.warn('[Login] Firestore profile lookup warning:', docErr);
      }

      const userData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        name: userProfile?.name || cleanEmail.split('@')[0],
        role: userProfile?.role || 'Owner',
        org_id: userProfile?.org_id || `ORG-${userCredential.user.uid.slice(0, 6)}`,
        org_name: userProfile?.org_name || 'SmartStock Retail',
        currency: userProfile?.currency || 'USD',
        currency_symbol: userProfile?.currency_symbol || '$',
        emailVerified: userCredential.user.emailVerified
      };

      await saveAuthSession(idToken, userData);
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      Alert.alert('Sign In Failed', formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    const cleanName = fullName.trim();
    const cleanOrg = orgName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const curr = CURRENCY_OPTIONS.find(c => c.code === selectedCurrency) || { code: 'USD', symbol: '$' };

    if (!cleanOrg) {
      Alert.alert('Business Name Required', 'Please enter your business or store name.');
      return;
    }
    if (!cleanName) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }
    if (!cleanEmail) {
      Alert.alert('Email Required', 'Please enter a valid email address.');
      return;
    }
    if (cleanPassword.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters.');
      return;
    }
    if (cleanPassword !== confirmPassword.trim()) {
      Alert.alert('Password Mismatch', 'The passwords you entered do not match.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      const idToken = await userCredential.user.getIdToken();
      const newOrgId = `ORG-${Date.now().toString().slice(-6)}`;

      // Send Firebase Email Verification
      try {
        await sendEmailVerification(userCredential.user);
      } catch (verErr) {
        console.log('[SignUp] Email verification trigger note:', verErr);
      }

      const newUserDoc = {
        uid: userCredential.user.uid,
        email: cleanEmail,
        name: cleanName,
        role: 'Owner',
        org_id: newOrgId,
        org_name: cleanOrg,
        currency: curr.code,
        currency_symbol: curr.symbol,
        created_at: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), newUserDoc);
        await setDoc(doc(db, 'organizations', newOrgId), {
          id: newOrgId,
          org_name: cleanOrg,
          admin_email: cleanEmail,
          admin_uid: userCredential.user.uid,
          currency: curr.code,
          currency_symbol: curr.symbol,
          created_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn('[SignUp] Firestore registration warning:', dbErr);
      }

      await saveAuthSession(idToken, newUserDoc);

      Alert.alert(
        'Account Registered',
        `Welcome to SmartStock, ${cleanName}! Organization "${cleanOrg}" created with base currency ${curr.label}.`,
        [
          {
            text: 'Continue to Dashboard',
            onPress: () => router.replace('/(tabs)/dashboard')
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Registration Failed', formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const cleanResetEmail = resetEmail.trim().toLowerCase();
    if (!cleanResetEmail) {
      Alert.alert('Email Required', 'Please enter the email address for your account.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanResetEmail);
      Alert.alert(
        'Reset Email Sent',
        `Instructions to reset your password have been sent to ${cleanResetEmail}. Please check your inbox and spam folder.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setResetModalVisible(false);
              setResetEmail('');
            }
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Password Reset Error', formatAuthError(err));
    } finally {
      setResetLoading(false);
    }
  };

  const currentCurrencyInfo = CURRENCY_OPTIONS.find(c => c.code === selectedCurrency) || CURRENCY_OPTIONS[0];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.brandBox}>
          <Image
            source={require('../public/icons/icon-192.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandTitle}>SmartStock</Text>
          <Text style={styles.brandSubtitle}>Intelligent Retail & Inventory OS</Text>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'login' && styles.tabBtnActive]}
            onPress={() => setTab('login')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'signup' && styles.tabBtnActive]}
            onPress={() => setTab('signup')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === 'signup' && styles.tabTextActive]}>Create Org</Text>
          </TouchableOpacity>
        </View>

        {/* Auth Form Card */}
        <View style={styles.form}>
          {tab === 'signup' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>BUSINESS / ORGANIZATION NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Apex Retail Store"
                  placeholderTextColor="#64748B"
                  value={orgName}
                  onChangeText={setOrgName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>FULL NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Alex Johnson"
                  placeholderTextColor="#64748B"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              {/* CURRENCY SELECTOR */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>ORGANIZATION BASE CURRENCY</Text>
                <TouchableOpacity
                  style={styles.currencySelectorBtn}
                  onPress={() => setCurrencyModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.currencySelectorText}>{currentCurrencyInfo.label}</Text>
                  <Text style={styles.currencySelectorArrow}>▼</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              placeholder="operator@smartstock.io"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
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
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {tab === 'signup' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONFIRM PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#64748B"
                secureTextEntry
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
          )}

          {tab === 'login' && (
            <TouchableOpacity 
              style={styles.forgotBtn}
              onPress={() => {
                setResetEmail(email.trim());
                setResetModalVisible(true);
              }}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={tab === 'login' ? handleSignIn : handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#090D16" />
            ) : (
              <Text style={styles.submitBtnText}>
                {tab === 'login' ? 'Sign In to SmartStock' : 'Register Organization'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>SmartStock Version 1.0.1 • LoveWorld Edition</Text>
        </View>
      </ScrollView>

      {/* Currency Selection Modal */}
      <Modal
        visible={currencyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choose Base Currency</Text>
            <Text style={styles.modalSubtitle}>
              Select the primary operating currency for inventory valuation, cost and selling prices.
            </Text>

            <ScrollView style={{ maxHeight: 300 }}>
              {CURRENCY_OPTIONS.map((item) => {
                const isSelected = item.code === selectedCurrency;
                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[
                      styles.currencyOptionItem,
                      isSelected && styles.currencyOptionItemSelected
                    ]}
                    onPress={() => {
                      setSelectedCurrency(item.code);
                      setCurrencyModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.currencyOptionText,
                      isSelected && styles.currencyOptionTextSelected
                    ]}>
                      {item.label}
                    </Text>
                    {isSelected && <Text style={styles.currencyOptionCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCurrencyModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Password Reset Modal */}
      <Modal
        visible={resetModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSubtitle}>
              Enter your registered email address and we will send you a password reset link.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="your-email@example.com"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              value={resetEmail}
              onChangeText={setResetEmail}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setResetModalVisible(false)}
                disabled={resetLoading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handlePasswordReset}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#090D16" />
                ) : (
                  <Text style={styles.modalConfirmText}>Send Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginBottom: 28,
  },
  brandLogo: {
    width: 84,
    height: 84,
    borderRadius: 18,
    marginBottom: 12,
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
    marginBottom: 20,
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
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#64ffda',
  },
  tabText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#64ffda',
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
  currencySelectorBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currencySelectorText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  currencySelectorArrow: {
    color: '#64ffda',
    fontSize: 12,
  },
  currencyOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#1E293B',
  },
  currencyOptionItemSelected: {
    backgroundColor: '#13283E',
    borderWidth: 1,
    borderColor: '#64ffda',
  },
  currencyOptionText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  currencyOptionTextSelected: {
    color: '#64ffda',
    fontWeight: '700',
  },
  currencyOptionCheck: {
    color: '#64ffda',
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: -4,
  },
  forgotText: {
    color: '#64ffda',
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: '#64ffda',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#090D16',
    fontSize: 15,
    fontWeight: '800',
  },
  footerNote: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    color: '#475569',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    backgroundColor: '#64ffda',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  modalConfirmText: {
    color: '#090D16',
    fontSize: 14,
    fontWeight: '700',
  },
});
