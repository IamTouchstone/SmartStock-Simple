import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { signOut, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { getAuthSession, clearAuthSession } from '../../services/inventoryService';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getAuthSession();
      setUser(session.user);
    })();
  }, []);

  const handleResendVerification = async () => {
    if (!auth.currentUser) {
      Alert.alert('Notice', 'No active Firebase user found.');
      return;
    }
    setLoadingAction(true);
    try {
      await sendEmailVerification(auth.currentUser);
      Alert.alert('Verification Sent', `A new verification email has been sent to ${auth.currentUser.email}.`);
    } catch (err: any) {
      Alert.alert('Notice', err.message || 'Unable to send verification email at this time.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePasswordReset = async () => {
    const targetEmail = user?.email || auth.currentUser?.email;
    if (!targetEmail) return;

    Alert.alert(
      'Reset Password',
      `Send password reset link to ${targetEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setLoadingAction(true);
            try {
              await sendPasswordResetEmail(auth, targetEmail);
              Alert.alert('Success', `Reset link sent to ${targetEmail}.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to send reset email.');
            } finally {
              setLoadingAction(false);
            }
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out from SmartStock?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (e) {
            console.warn('Sign out warning:', e);
          }
          await clearAuthSession();
          router.replace('/login');
        }
      }
    ]);
  };

  const isEmailVerified = auth.currentUser?.emailVerified || user?.emailVerified;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Account Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <View style={styles.userCard}>
          <Image
            source={require('../../public/icons/icon-192.png')}
            style={styles.avatarLogo}
            resizeMode="contain"
          />
          <Text style={styles.userName}>{user?.name || 'SmartStock Operator'}</Text>
          <Text style={styles.userEmail}>{user?.email || auth.currentUser?.email || 'operator@smartstock.io'}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user?.role || 'Owner'}</Text>
            </View>
            <View style={styles.orgBadge}>
              <Text style={styles.orgBadgeText}>{user?.org_name || 'SmartStock Retail'}</Text>
            </View>
          </View>

          {/* Email Verification Status */}
          <View style={styles.verificationRow}>
            {isEmailVerified ? (
              <View style={styles.verifiedPill}>
                <Text style={styles.verifiedPillText}>✓ Email Verified</Text>
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.unverifiedPill}
                onPress={handleResendVerification}
                disabled={loadingAction}
              >
                <Text style={styles.unverifiedPillText}>
                  ⚠️ Unverified • Tap to Resend Link
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Security & Organization */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>SECURITY & SESSION</Text>
          <TouchableOpacity 
            style={styles.actionRow}
            onPress={handlePasswordReset}
            disabled={loadingAction}
          >
            <Text style={styles.actionLabel}>Change / Reset Password</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* System Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>APPLICATION INFO</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Name</Text>
            <Text style={styles.infoValue}>SmartStock</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.1 (Production Release)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Database</Text>
            <Text style={styles.infoValue}>Google Firestore</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Package ID</Text>
            <Text style={styles.infoValue}>com.smartstock.app</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Organization ID</Text>
            <Text style={styles.infoValue}>{user?.org_id || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Base Currency</Text>
            <Text style={styles.infoValue}>{user?.currency || 'USD'} ({user?.currency_symbol || '$'})</Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity 
          style={styles.logoutBtn} 
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 16,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
  },
  content: {
    padding: 20,
  },
  userCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  avatarLogo: {
    width: 68,
    height: 68,
    borderRadius: 16,
    marginBottom: 12,
  },
  userName: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  userEmail: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleBadge: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#64ffda',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  roleBadgeText: {
    color: '#64ffda',
    fontSize: 12,
    fontWeight: '700',
  },
  orgBadge: {
    backgroundColor: '#064E3B',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  orgBadgeText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  verificationRow: {
    marginTop: 14,
  },
  verifiedPill: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderWidth: 1,
    borderColor: '#059669',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  verifiedPillText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
  },
  unverifiedPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: '#D97706',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  unverifiedPillText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  infoTitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionLabel: {
    color: '#64ffda',
    fontSize: 14,
    fontWeight: '600',
  },
  actionArrow: {
    color: '#64ffda',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  infoValue: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
