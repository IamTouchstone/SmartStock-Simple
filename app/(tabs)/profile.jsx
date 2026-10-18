import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { auth } from '../../firebaseConfig';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';

export default function Profile() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      Alert.alert('Logout failed', error.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1120', padding: 20, justifyContent: 'center' }}>
      <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Profile</Text>
      <Text style={{ color: '#94A3B8', marginTop: 8, marginBottom: 30 }}>
        {auth.currentUser ? auth.currentUser.email : 'No user'}
      </Text>

      <TouchableOpacity
        onPress={handleLogout}
        style={{ backgroundColor: '#EF4444', padding: 16, borderRadius: 12, alignItems: 'center' }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}