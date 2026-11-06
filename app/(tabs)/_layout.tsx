import { Tabs } from 'expo-router';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { requestNotificationPermission } from './services/alertsService';

function HeaderLogo() {
  return (
    <Image
      source={require('../../assets/images/logo-horizontal-light.png')}
      style={{ width: 160, height: 42, marginLeft: 4 }}
      resizeMode="contain"
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  // ✅ Ask for notification permission once when tabs load
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <Tabs
      id="tabs"
      screenOptions={{
        headerShown: true,
        headerTitle: () => <HeaderLogo />,
        headerStyle: {
          backgroundColor: '#0B3B2E',
        },
        headerTintColor: '#FDF6E9',
        tabBarStyle: {
          backgroundColor: '#0B3B2E',
          borderTopColor: '#0B3B2E',
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
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarLabel: 'Stock', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'cube' : 'cube-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="market" options={{ title: 'Market Buy', tabBarLabel: 'Market', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarLabel: 'Requests', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="pos" options={{ title: 'POS', tabBarLabel: 'POS', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calculator' : 'calculator-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="add-item" options={{ title: 'Add Item', tabBarLabel: 'Add', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="agent" options={{ title: 'Agent', tabBarLabel: 'Agent', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="add-request" options={{ href: null }} />
    </Tabs>
  );
}