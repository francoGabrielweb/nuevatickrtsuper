/**
 * auth.js — Autenticación para GitHub Pages
 *
 * Credenciales: admin / SuperMercado2024!
 * Para cambiar: reemplazá los hashes con sha256 de las nuevas credenciales.
 * Lockout: 5 intentos → bloqueado 15 minutos
 */

const AUTH = (() => {
  const U_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
  const P_HASH = 'f11292bcfb43d7dd21579e5fcfd284e849892ab51ac1f825d5b3d8864b4c4a9a';
  const SESSION_KEY = 'sc_auth_v2';
  const LOCK_KEY    = 'sc_lock';
  const TOKEN       = 'authenticated';

  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function lockData() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { n: 0, until: null }; }
    catch { return { n: 0, until: null }; }
  }
  function saveLock(d) { localStorage.setItem(LOCK_KEY, JSON.stringify(d)); }

  function isLocked() {
    const d = lockData();
    if (!d.until) return false;
    if (Date.now() < d.until) return true;
    saveLock({ n: 0, until: null });
    return false;
  }

  function minsLeft() {
    const d = lockData();
    return d.until ? Math.ceil((d.until - Date.now()) / 60000) : 0;
  }

  function fail() {
    const d = lockData();
    d.n = (d.n || 0) + 1;
    if (d.n >= 5) d.until = Date.now() + 15 * 60 * 1000;
    saveLock(d);
    return 5 - d.n;
  }

  function resetLock() { saveLock({ n: 0, until: null }); }

  return {
    isAuthenticated() { return sessionStorage.getItem(SESSION_KEY) === TOKEN; },

    async login(user, pass) {
      if (isLocked()) return { ok: false, error: `Cuenta bloqueada. Intentá en ${minsLeft()} min.` };
      const [uh, ph] = await Promise.all([sha256(user), sha256(pass)]);
      if (uh === U_HASH && ph === P_HASH) {
        resetLock();
        sessionStorage.setItem(SESSION_KEY, TOKEN);
        return { ok: true };
      }
      const left = fail();
      if (left <= 0) return { ok: false, error: `Cuenta bloqueada 15 min.` };
      return { ok: false, error: `Credenciales incorrectas. Intentos restantes: ${left}` };
    },

    logout() { sessionStorage.removeItem(SESSION_KEY); }
  };
})();

window.AUTH = AUTH;
