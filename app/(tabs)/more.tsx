import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Item = { title: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name']; route: string };

const SECTIONS: { heading: string; items: Item[] }[] = [
  {
    heading: 'Add New',
    items: [
      { title: 'Add Item', sub: 'Add a product to Stock', icon: 'cube-outline', route: '/(tabs)/add-item' },
      { title: 'Customer Request', sub: 'Record a customer order and market date', icon: 'people-outline', route: '/(tabs)/add-request' },
    ],
  },
  {
    heading: 'Sales',
    items: [
      { title: 'Market Buy', sub: 'Buy stock from the market', icon: 'storefront-outline', route: '/(tabs)/market' },
      { title: 'Requests', sub: 'Customer requests and orders', icon: 'people-outline', route: '/(tabs)/requests' },
    ],
  },
  {
    heading: 'Help',
    items: [
      { title: 'Agent', sub: 'Ask, scan a label, or record a disposal', icon: 'chatbubble-ellipses-outline', route: '/(tabs)/agent' },
    ],
  },
  {
    heading: 'Records',
    items: [
      { title: 'Expiry History', sub: 'What expired, was exchanged or thrown away', icon: 'time-outline', route: '/(tabs)/expiry-history' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { title: 'Profile', sub: 'Your shop, settings and account', icon: 'person-outline', route: '/(tabs)/profile' },
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>More</Text>
      <Text style={styles.sub}>Everything else in SmartStock</Text>

      {SECTIONS.map((section) => (
        <View key={section.heading} style={{ marginTop: 24 }}>
          <Text style={styles.heading}>{section.heading}</Text>
          {section.items.map((item) => (
            <TouchableOpacity key={item.title} onPress={() => router.push(item.route as any)} style={styles.row}>
              <View style={styles.iconBox}>
                <Ionicons name={item.icon} size={20} color="#0B3B2E" />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSub}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#8AA99B" />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F241D' },
  title: { color: '#FDF6E9', fontSize: 22, fontWeight: '800' },
  sub: { color: '#8AA99B', fontSize: 13, marginTop: 4 },
  heading: { color: '#8AA99B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  row: { backgroundColor: '#1E3A30', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDF6E9', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { color: '#FDF6E9', fontSize: 15, fontWeight: '800' },
  rowSub: { color: '#8AA99B', fontSize: 12, marginTop: 2 },
});