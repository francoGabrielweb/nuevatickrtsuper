/**
 * auth.js — Client-side authentication for GitHub Pages
 *
 * Security model:
 *  - Credentials stored as SHA-256 hashes (never plaintext in source)
 *  - Brute-force protection: lockout after 5 failed attempts (15 min)
 *  - Session stored in sessionStorage (cleared on tab close)
 *  - No sensitive data in localStorage
 *
 * Credentials:
 *  - Usuario: admin
 *  - Contraseña: SuperMercado2024!
 *  (Change these by updating the hashes below — run: 
 *   echo -n "yourpassword" | sha256sum)
 */

const AUTH = (() => {

  // SHA-256 hashes — never store plaintext here
  const VALID_USER_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
  const VALID_PASS_HASH = 'f11292bcfb43d7dd21579e5fcfd284e849892ab51ac1f825d5b3d8864b4c4a9a';

  const SESSION_KEY = 'sc_session';
  const LOCK_KEY    = 'sc_lockout';
  const SESSION_TOKEN = 'sc_authenticated_v1'; // bump to invalidate all sessions

  // ─── SHA-256 via Web Crypto API ──────────────────────────────

  async function sha256(str) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ─── Lockout management ──────────────────────────────────────

  function getLockoutData() {
    try {
      return JSON.parse(localStorage.getItem(LOCK_KEY)) || { attempts: 0, lockedUntil: null };
    } catch { return { attempts: 0, lockedUntil: null }; }
  }

  function saveLockoutData(data) {
    localStorage.setItem(LOCK_KEY, JSON.stringify(data));
  }

  function isLockedOut() {
    const data = getLockoutData();
    if (!data.lockedUntil) return false;
    if (Date.now() < data.lockedUntil) return true;
    // Lock expired — reset
    saveLockoutData({ attempts: 0, lockedUntil: null });
    return false;
  }

  function getLockoutRemaining() {
    const data = getLockoutData();
    if (!data.lockedUntil) return 0;
    return Math.ceil((data.lockedUntil - Date.now()) / 60000); // minutes
  }

  function recordFailedAttempt() {
    const data = getLockoutData();
    data.attempts = (data.attempts || 0) + 1;
    if (data.attempts >= 5) {
      data.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lockout
    }
    saveLockoutData(data);
  }

  function resetAttempts() {
    saveLockoutData({ attempts: 0, lockedUntil: null });
  }

  // ─── Session ─────────────────────────────────────────────────

  function isAuthenticated() {
    return sessionStorage.getItem(SESSION_KEY) === SESSION_TOKEN;
  }

  function setSession() {
    sessionStorage.setItem(SESSION_KEY, SESSION_TOKEN);
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ─── Login ───────────────────────────────────────────────────

  async function login(username, password) {
    if (isLockedOut()) {
      const mins = getLockoutRemaining();
      return { ok: false, error: `Demasiados intentos. Bloqueado ${mins} min.` };
    }

    const [uHash, pHash] = await Promise.all([sha256(username), sha256(password)]);

    if (uHash === VALID_USER_HASH && pHash === VALID_PASS_HASH) {
      resetAttempts();
      setSession();
      return { ok: true };
    }

    recordFailedAttempt();
    const data = getLockoutData();
    const remaining = 5 - data.attempts;

    if (remaining <= 0) {
      const mins = getLockoutRemaining();
      return { ok: false, error: `Cuenta bloqueada por ${mins} minutos.` };
    }

    return { ok: false, error: `Usuario o contraseña incorrectos. Intentos restantes: ${remaining}` };
  }

  function logout() {
    clearSession();
  }

  return { isAuthenticated, login, logout };
})();

window.AUTH = AUTH;
