const fs = require('fs');
const path = require('path');

// On Vercel the filesystem is read-only except /tmp
const DATA_DIR = process.env.VERCEL === '1'
  ? '/tmp/smartstock_data'
  : path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_ORG_ID = "ORG-DEMO-001";

// Ensure database file and directories exist
function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const defaultData = getSeedData();
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }

  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(content);
    
    let updated = false;

    // Ensure organizations array exists
    if (!db.organizations) {
      db.organizations = getInitialOrganizations();
      updated = true;
    }
    // Ensure users array exists
    if (!db.users) {
      db.users = getInitialUsers();
      updated = true;
    }
    // Ensure customer_requests array exists
    if (!db.customer_requests) {
      db.customer_requests = [];
      updated = true;
    }
    // Ensure purchase_list array exists
    if (!db.purchase_list) {
      db.purchase_list = getInitialPurchaseList();
      updated = true;
    }
    // Ensure alert_logs array exists
    if (!db.alert_logs) {
      db.alert_logs = [];
      updated = true;
    }
    // Ensure categories array exists
    if (!db.categories) {
      db.categories = getInitialCategories();
      updated = true;
    }
    // Ensure activity_logs array exists
    if (!db.activity_logs) {
      db.activity_logs = [];
      updated = true;
    }
    // Ensure expiry_reports array exists
    if (!db.expiry_reports) {
      db.expiry_reports = [];
      updated = true;
    }
    // Ensure stock_adjustments array exists
    if (!db.stock_adjustments) {
      db.stock_adjustments = [];
      updated = true;
    }

    if (updated) {
      writeDB(db);
    }
    applyInvoiceMigrations(db);
    return db;
  } catch (e) {
    console.error("Database error. Re-initializing DB.", e);
    const defaultData = getSeedData();
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
}

function applyInvoiceMigrations(db) {
  if (!db.invoices) {
    db.invoices = [];
  }
}

// Read database
function readDB() {
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return initDB();
  }
}

// Write database
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getInitialOrganizations() {
  return [
    {
      id: DEFAULT_ORG_ID,
      org_name: "SmartStock Global Retail",
      admin_email: "admin@smartstock.io",
      password: "password123",
      industry: "Electronics & Smart Home",
      created_at: new Date().toISOString()
    }
  ];
}

function getInitialUsers() {
  const nowStr = new Date().toISOString();
  return [
    {
      id: "USR-ADMIN-001",
      org_id: DEFAULT_ORG_ID,
      name: "Global Owner",
      email: "admin@smartstock.io",
      password: "password123",
      role: "Owner",
      created_by: "SYSTEM",
      created_at: nowStr
    },
    {
      id: "USR-CADMIN-001",
      org_id: DEFAULT_ORG_ID,
      name: "Global Admin",
      email: "coadmin@smartstock.io",
      password: "password123",
      role: "Admin",
      created_by: "USR-ADMIN-001",
      created_at: nowStr
    },
    {
      id: "USR-MGR-001",
      org_id: DEFAULT_ORG_ID,
      name: "Global Manager",
      email: "manager@smartstock.io",
      password: "password123",
      role: "Manager",
      created_by: "USR-CADMIN-001",
      created_at: nowStr
    },
    {
      id: "USR-SUP-001",
      org_id: DEFAULT_ORG_ID,
      name: "Global Supervisor",
      email: "supervisor@smartstock.io",
      password: "password123",
      role: "Supervisor",
      created_by: "USR-CADMIN-001",
      created_at: nowStr
    },
    {
      id: "USR-STF-001",
      org_id: DEFAULT_ORG_ID,
      name: "Global Staff",
      email: "staff@smartstock.io",
      password: "password123",
      role: "Staff",
      created_by: "USR-MGR-001",
      created_at: nowStr
    }
  ];
}

function getInitialPurchaseList() {
  return [
    {
      org_id: DEFAULT_ORG_ID,
      id: "SHOP-001",
      item_name: "Biodegradable Delivery Boxes",
      category: "Packaging & Delivery",
      quantity: 150,
      status: "Pending",
      created_at: new Date().toISOString()
    },
    {
      org_id: DEFAULT_ORG_ID,
      id: "SHOP-002",
      item_name: "Sticky Label Paper Reams",
      category: "Office Stationery",
      quantity: 25,
      status: "Purchased",
    }
  ];
}

function getInitialCategories() {
  return [
    { org_id: DEFAULT_ORG_ID, name: "Electronics & Smart Home" },
    { org_id: DEFAULT_ORG_ID, name: "Groceries & Consumables" },
    { org_id: DEFAULT_ORG_ID, name: "Packaging & Delivery" },
    { org_id: DEFAULT_ORG_ID, name: "Office Stationery" },
    { org_id: DEFAULT_ORG_ID, name: "General Retail" }
  ];
}

// Seed initial data scoped by Org ID
function getSeedData() {
  const organizations = getInitialOrganizations();
  const users = getInitialUsers();
  const org_id = DEFAULT_ORG_ID;

  const settings = {
    [org_id]: {
      branch_visibility: "all",
      alert_sensitivity: "medium",
      velocity_threshold_coefficient: 1.5
    }
  };

  return {
    organizations,
    users,
    products: [],
    inventory: [],
    sales: [],
    redistributions: [],
    customer_requests: [],
    purchase_list: [],
    alert_logs: [],
    settings,
    suppliers: [],
    purchaseOrders: [],
    invoices: [],
    categories: getInitialCategories()
  };
}

// Seed default catalog for a newly registered Organization
function seedNewOrganization(org_id, org_name, industry) {
  const db = readDB();

  const defaultCategories = [
    { org_id, name: "Electronics & Smart Home" },
    { org_id, name: "Groceries & Consumables" },
    { org_id, name: "Packaging & Delivery" },
    { org_id, name: "Office Stationery" },
    { org_id, name: "General Retail" }
  ];
  if (industry && !defaultCategories.find(c => c.name.toLowerCase() === industry.toLowerCase())) {
    defaultCategories.push({ org_id, name: industry });
  }

  if (!db.categories) db.categories = [];
  db.categories.push(...defaultCategories);

  if (!db.settings) db.settings = {};
  db.settings[org_id] = {
    branch_visibility: "all",
    alert_sensitivity: "medium",
    velocity_threshold_coefficient: 1.5
  };

  writeDB(db);
}

module.exports = {
  initDB,
  readDB,
  writeDB,
  seedNewOrganization,
  DEFAULT_ORG_ID,
  getInitialUsers
};
