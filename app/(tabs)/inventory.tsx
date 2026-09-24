import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  RefreshControl,
  ActivityIndicator,
  Alert,
  StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  getAuthSession, 
  getInventory, 
  ProductItem, 
  approveRedistribution 
} from '../../services/inventoryService';

export default function InventoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState('');
  const [userOrgId, setUserOrgId] = useState('ORG-DEMO-001');

  const loadData = useCallback(async () => {
    try {
      const { user } = await getAuthSession();
      if (!user) {
        router.replace('/login');
        return;
      }
      const orgId = user.org_id || 'ORG-DEMO-001';
      setUserOrgId(orgId);
      const items = await getInventory(orgId);
      setProducts(items);
    } catch (e) {
      console.error('Inventory load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleQuickTransfer = (item: ProductItem) => {
    Alert.alert(
      'Stock Redistribution',
      `Transfer 5 units of ${item.sku} from Main Warehouse to North Branch?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Transfer',
          onPress: async () => {
            const res = await approveRedistribution(
              item.sku,
              'Main Warehouse',
              'North Branch',
              5,
              userOrgId
            );
            if (res.success) {
              Alert.alert('Success', 'Stock transferred successfully!');
              loadData();
            } else {
              Alert.alert('Transfer Error', res.error || 'Failed to transfer.');
            }
          }
        }
      ]
    );
  };

  const filteredProducts = products.filter(p => 
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const renderProductItem = ({ item }: { item: ProductItem }) => {
    const isLowStock = (item.total_stock || 0) <= (item.safety_stock || 10);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemSku}>{item.sku} • {item.category}</Text>
          </View>
          <View style={[styles.stockBadge, isLowStock ? styles.stockBadgeLow : styles.stockBadgeOk]}>
            <Text style={[styles.stockBadgeText, isLowStock ? styles.stockTextLow : styles.stockTextOk]}>
              {item.total_stock || 0} units
            </Text>
          </View>
        </View>

        <View style={styles.branchBreakdown}>
          {item.branches?.map((b, idx) => (
            <View key={idx} style={styles.branchPill}>
              <Text style={styles.branchName}>{b.branch}:</Text>
              <Text style={styles.branchQty}>{b.quantity}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardBottom}>
          <Text style={styles.priceText}>
            Price: <Text style={styles.priceValue}>${item.price.toFixed(2)}</Text>
          </Text>
          <TouchableOpacity 
            style={styles.transferButton}
            onPress={() => handleQuickTransfer(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.transferButtonText}>🔄 Redistribute</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading Inventory...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />
      
      {/* Search Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventory Catalog</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by SKU, Product Name..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.sku}
        renderItem={renderProductItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No Products Found</Text>
            <Text style={styles.emptySubtitle}>
              {search ? 'Try adjusting your search criteria.' : 'Start adding inventory items to your catalog.'}
            </Text>
            <TouchableOpacity 
              style={styles.addBtn}
              onPress={() => router.push('/(tabs)/add-item')}
            >
              <Text style={styles.addBtnText}>+ Add First Product</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090D16',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
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
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 14,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  itemName: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemSku: {
    color: '#94A3B8',
    fontSize: 12,
  },
  stockBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  stockBadgeOk: {
    backgroundColor: '#064E3B',
  },
  stockBadgeLow: {
    backgroundColor: '#78350F',
  },
  stockBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stockTextOk: {
    color: '#34D399',
  },
  stockTextLow: {
    color: '#FBBF24',
  },
  branchBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  branchPill: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    gap: 4,
  },
  branchName: {
    color: '#64748B',
    fontSize: 11,
  },
  branchQty: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  priceText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  priceValue: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  transferButton: {
    backgroundColor: '#312E81',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  transferButtonText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  addBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
