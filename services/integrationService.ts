import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const ADAPTERS: any = {
  iclass: {
    name: 'Iclass Business Manager',
    id: 'iclass',
    testConnection: async (config: any) => {
      if (!config.apiUrl || !config.apiKey) throw new Error('Missing URL/Key');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    },
    pullStock: async (config: any) => [],
    pushStock: async (config: any, products: any[]) => {
      console.log('Pushing to Iclass', products.length);
      return true;
    }
  },
  zoho: { name: 'Zoho Inventory', id: 'zoho', testConnection: async () => true, pullStock: async () => [], pushStock: async () => true },
  odoo: { name: 'Odoo', id: 'odoo', testConnection: async () => true, pullStock: async () => [], pushStock: async () => true },
  custom: { name: 'Custom API (Any Software)', id: 'custom', testConnection: async () => true, pullStock: async () => [], pushStock: async () => true },
};

export async function saveIntegrationConfig(orgId: string, adapterId: string, config: any) {
  const ref = doc(db, 'integrations', `${orgId}_${adapterId}`);
  await setDoc(ref, { org_id: orgId, adapter_id: adapterId, ...config, updated_at: new Date().toISOString() }, { merge: true });
}

export async function getIntegrationConfig(orgId: string, adapterId: string) {
  const ref = doc(db, 'integrations', `${orgId}_${adapterId}`);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}