/**
 * db.js — IndexedDB para StockControl
 * Stores: products | lots
 */

const DB_NAME = 'stockcontrol_v2';
const DB_VER  = 1;
let _db = null;

function openDB() {
  return new Promise((res, rej) => {
    if (_db) return res(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('products')) {
        const ps = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('barcode', 'barcode', { unique: true });
        ps.createIndex('category', 'category');
      }
      if (!db.objectStoreNames.contains('lots')) {
        const ls = db.createObjectStore('lots', { keyPath: 'id', autoIncrement: true });
        ls.createIndex('productId', 'productId');
        ls.createIndex('expiry', 'expiry');
      }
    };

    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = e => rej(e.target.error);
  });
}

function getAll(storeName) {
  return openDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}

const DB = {

  // ── Products ──────────────────────────────────────────────────

  getByBarcode(barcode) {
    return openDB().then(db => new Promise((res, rej) => {
      const idx = db.transaction('products', 'readonly').objectStore('products').index('barcode');
      const req = idx.get(barcode);
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => rej(req.error);
    }));
  },

  getAllProducts() { return getAll('products'); },

  addProduct(data) {
    return openDB().then(db => new Promise((res, rej) => {
      const req = db.transaction('products', 'readwrite')
        .objectStore('products')
        .add({ ...data, createdAt: new Date().toISOString() });
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  },

  // ── Lots ──────────────────────────────────────────────────────

  getAllLots() { return getAll('lots'); },

  getLotsByProduct(productId) {
    return openDB().then(db => new Promise((res, rej) => {
      const idx = db.transaction('lots', 'readonly').objectStore('lots').index('productId');
      const req = idx.getAll(productId);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  },

  addLot(data) {
    return openDB().then(db => new Promise((res, rej) => {
      const req = db.transaction('lots', 'readwrite')
        .objectStore('lots')
        .add({ ...data, enteredAt: new Date().toISOString() });
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  },

  deleteLot(id) {
    return openDB().then(db => new Promise((res, rej) => {
      const req = db.transaction('lots', 'readwrite').objectStore('lots').delete(id);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    }));
  },

  // ── Combined ──────────────────────────────────────────────────

  async getProductWithLots(barcode) {
    const product = await DB.getByBarcode(barcode);
    if (!product) return null;
    const lots = await DB.getLotsByProduct(product.id);
    return { product, lots };
  },

  async getAllInventory() {
    const [products, lots] = await Promise.all([DB.getAllProducts(), DB.getAllLots()]);
    const map = {};
    lots.forEach(l => { (map[l.productId] = map[l.productId] || []).push(l); });
    return products.map(p => ({ ...p, lots: map[p.id] || [] }));
  },

  async getExpiryReport(daysAhead) {
    const [products, lots] = await Promise.all([DB.getAllProducts(), DB.getAllLots()]);
    const pMap = {};
    products.forEach(p => pMap[p.id] = p);
    const today = new Date(); today.setHours(0,0,0,0);

    return lots
      .filter(l => {
        if (!l.expiry) return daysAhead === 9999;
        const exp  = new Date(l.expiry + 'T00:00:00');
        const diff = Math.floor((exp - today) / 86400000);
        if (daysAhead === 0)    return diff < 0;
        if (daysAhead === 9999) return true;
        return diff >= 0 && diff <= daysAhead;
      })
      .map(l => {
        const diff = l.expiry ? Math.floor((new Date(l.expiry + 'T00:00:00') - today) / 86400000) : null;
        return { ...l, product: pMap[l.productId] || {}, daysLeft: diff };
      })
      .sort((a, b) => {
        if (a.daysLeft === null) return 1;
        if (b.daysLeft === null) return -1;
        return a.daysLeft - b.daysLeft;
      });
  }
};

window.DB = DB;
