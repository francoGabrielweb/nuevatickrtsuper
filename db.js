/**
 * db.js — IndexedDB wrapper for StockControl
 * 
 * Stores:
 *  - products  : { id, barcode, name, category, unit, createdAt }
 *  - lots      : { id, productId, barcode, qty, expiry, price, notes, enteredAt }
 */

const DB_NAME = 'stockcontrol';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Products store
      if (!db.objectStoreNames.contains('products')) {
        const ps = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('barcode', 'barcode', { unique: true });
        ps.createIndex('category', 'category', { unique: false });
      }

      // Lots store (each ingress of a product)
      if (!db.objectStoreNames.contains('lots')) {
        const ls = db.createObjectStore('lots', { keyPath: 'id', autoIncrement: true });
        ls.createIndex('productId', 'productId', { unique: false });
        ls.createIndex('expiry', 'expiry', { unique: false });
        ls.createIndex('enteredAt', 'enteredAt', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ─── Generic helpers ──────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

function promisify(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function getAllFromStore(storeName) {
  return openDB().then(db => {
    return new Promise((res, rej) => {
      const tr = db.transaction(storeName, 'readonly');
      const store = tr.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  });
}

// ─── Products ─────────────────────────────────────────────────────

const DB = {

  getProductByBarcode(barcode) {
    return openDB().then(db => {
      return new Promise((res, rej) => {
        const tr = db.transaction('products', 'readonly');
        const index = tr.objectStore('products').index('barcode');
        const req = index.get(barcode);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
    });
  },

  getAllProducts() {
    return getAllFromStore('products');
  },

  addProduct(data) {
    // data: { barcode, name, category, unit }
    return openDB().then(db => {
      return new Promise((res, rej) => {
        const tr = db.transaction('products', 'readwrite');
        const store = tr.objectStore('products');
        const record = { ...data, createdAt: new Date().toISOString() };
        const req = store.add(record);
        req.onsuccess = () => res(req.result); // returns new id
        req.onerror = () => rej(req.error);
      });
    });
  },

  deleteProduct(id) {
    return openDB().then(db => {
      return new Promise((res, rej) => {
        const tr = db.transaction(['products', 'lots'], 'readwrite');
        const pStore = tr.objectStore('products');
        const lStore = tr.objectStore('lots');
        const index = lStore.index('productId');
        
        // Delete all lots first
        const lotReq = index.getAll(id);
        lotReq.onsuccess = () => {
          const lots = lotReq.result;
          lots.forEach(l => lStore.delete(l.id));
          pStore.delete(id);
        };
        
        tr.oncomplete = () => res();
        tr.onerror = () => rej(tr.error);
      });
    });
  },

  // ─── Lots ──────────────────────────────────────────────────────

  addLot(data) {
    // data: { productId, barcode, qty, expiry, price, notes }
    return openDB().then(db => {
      return new Promise((res, rej) => {
        const tr = db.transaction('lots', 'readwrite');
        const store = tr.objectStore('lots');
        const record = { ...data, enteredAt: new Date().toISOString() };
        const req = store.add(record);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    });
  },

  getAllLots() {
    return getAllFromStore('lots');
  },

  getLotsByProduct(productId) {
    return openDB().then(db => {
      return new Promise((res, rej) => {
        const tr = db.transaction('lots', 'readonly');
        const index = tr.objectStore('lots').index('productId');
        const req = index.getAll(productId);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    });
  },

  deleteLot(id) {
    return openDB().then(db => {
      return new Promise((res, rej) => {
        const tr = db.transaction('lots', 'readwrite');
        const req = tr.objectStore('lots').delete(id);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
      });
    });
  },

  // ─── Combined queries ──────────────────────────────────────────

  async getProductWithLots(barcode) {
    const product = await DB.getProductByBarcode(barcode);
    if (!product) return null;
    const lots = await DB.getLotsByProduct(product.id);
    return { product, lots };
  },

  async getAllInventory() {
    const [products, lots] = await Promise.all([
      DB.getAllProducts(),
      DB.getAllLots()
    ]);
    // Group lots by productId
    const lotMap = {};
    lots.forEach(l => {
      if (!lotMap[l.productId]) lotMap[l.productId] = [];
      lotMap[l.productId].push(l);
    });
    return products.map(p => ({
      ...p,
      lots: lotMap[p.id] || []
    }));
  },

  async getExpiryReport(daysAhead) {
    const [products, lots] = await Promise.all([
      DB.getAllProducts(),
      DB.getAllLots()
    ]);
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return lots
      .filter(l => {
        if (!l.expiry) return false;
        const exp = new Date(l.expiry + 'T00:00:00');
        const diffDays = Math.floor((exp - today) / 86400000);
        if (daysAhead === 0) return diffDays < 0;          // vencidos
        if (daysAhead === 9999) return true;                // todos
        return diffDays >= 0 && diffDays <= daysAhead;
      })
      .map(l => {
        const exp = new Date(l.expiry + 'T00:00:00');
        const diffDays = Math.floor((exp - today) / 86400000);
        return { ...l, product: productMap[l.productId] || {}, daysLeft: diffDays };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

};

// Make globally available
window.DB = DB;
