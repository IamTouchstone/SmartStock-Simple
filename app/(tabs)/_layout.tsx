import { Tabs, useRouter } from 'expo-router';
import { Image, Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { requestNotificationPermission } from './services/alertsService';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
type Tab = { name: string; title: string; label: string; icon: Icon; active: Icon };

const TABS: Tab[] = [
  { name: 'dashboard', title: 'Dashboard', label: 'Home', icon: 'grid-outline', active: 'grid' },
  { name: 'inventory', title: 'Inventory', label: 'Stock', icon: 'cube-outline', active: 'cube' },
  { name: 'market', title: 'Market Buy', label: 'Market', icon: 'storefront-outline', active: 'storefront' },
  { name: 'shelf', title: 'Shelf Display', label: 'Shelf', icon: 'layers-outline', active: 'layers' },
  { name: 'requests', title: 'Requests', label: 'Requests', icon: 'people-outline', active: 'people' },
  { name: 'pos', title: 'POS', label: 'POS', icon: 'calculator-outline', active: 'calculator' },
  { name: 'agent', title: 'Agent', label: 'Agent', icon: 'chatbubble-ellipses-outline', active: 'chatbubble-ellipses' },
  { name: 'profile', title: 'Profile', label: 'Profile', icon: 'person-outline', active: 'person' },
];

function HeaderLogo() {
  return (
    <Image source={require('../../assets/images/logo-horizontal-light.png')} style={styles.logo} resizeMode="contain" />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => { requestNotificationPermission(); }, []);

  const go = (route: '/(tabs)/add-item' | '/(tabs)/add-request') => {
    setShowAddMenu(false);
    setTimeout(() => router.push(route), 150);
  };

  return (
    <View style={styles.container}>
      <Tabs
        id="tabs"
        screenOptions={{
          headerShown: true,
          headerTitle: () => <HeaderLogo />,
          headerStyle: { backgroundColor: '#0B3B2E' },
          headerTintColor: '#FDF6E9',
          tabBarStyle: {
            backgroundColor: '#0B3B2E',
            borderTopWidth: 0,
            height: 62 + insets.bottom,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: '#FDF6E9',
          tabBarInactiveTintColor: '#8AA99B',
          tabBarLabelStyle: { fontSize: 9, fontWeight: '600', marginTop: 2 },
          tabBarHideOnKeyboard: true,
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarLabel: tab.label,
              tabBarIcon: ({ focused }) => (
                <Ionicons name={focused ? tab.active : tab.icon} size={22} color={focused ? '#FDF6E9' : '#8AA99B'} />
              ),
            }}
          />
        ))}

        <Tabs.Screen
          name="add-item"
          options={{
            title: 'Add Item',
            tabBarLabel: 'Add',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={22} color={focused ? '#FDF6E9' : '#8AA99B'} />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              (e as any).preventDefault();
              setShowAddMenu(true);
            },
          }}
        />

        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="add-request" options={{ href: null }} />
        <Tabs.Screen name="expiry-history" options={{ title: 'Expiry History', href: null }} />
      </Tabs>

      <Modal visible={showAddMenu} transparent animationType="slide" onRequestClose={() => setShowAddMenu(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowAddMenu(false)} />
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Add New</Text>
            <Text style={styles.menuSub}>What do you want to add?</Text>

            <TouchableOpacity onPress={() => go('/(tabs)/add-item')} style={styles.menuBtn}>
              <Ionicons name="cube-outline" size={20} color="#0B3B2E" />
              <View style={styles.menuBtnText}>
                <Text style={styles.menuBtnTitle}>Add Item</Text>
                <Text style={styles.menuBtnSub}>Add product to Stock</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#0B3B2E" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => go('/(tabs)/add-request')} style={styles.menuBtn}>
              <Ionicons name="people-outline" size={20} color="#0B3B2E" />
              <View style={styles.menuBtnText}>
                <Text style={styles.menuBtnTitle}>Customer Request</Text>
                <Text style={styles.menuBtnSub}>Record a customer order and market date</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#0B3B2E" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowAddMenu(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  logo: { width: 160, height: 42, marginLeft: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill },
  menu: { backgroundColor: '#FDF6E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  menuTitle: { color: '#0B3B2E', fontSize: 20, fontWeight: '800' },
  menuSub: { color: '#64748B', fontSize: 13, marginTop: 4, marginBottom: 16 },
  menuBtn: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  menuBtnText: { flex: 1 },
  menuBtnTitle: { color: '#0B3B2E', fontSize: 15, fontWeight: '800' },
  menuBtnSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  cancelBtn: { backgroundColor: '#0B3B2E', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  cancelText: { color: '#FDF6E9', fontWeight: '800', fontSize: 15 },
});