# StockControl — Inventario Supermercado

App móvil para control de stock con escaneo de códigos de barras. Lista para GitHub Pages.

## Deploy en GitHub Pages

1. Creá un repositorio en GitHub (puede ser **privado** para más seguridad)
2. Subí los 5 archivos: `index.html`, `styles.css`, `db.js`, `auth.js`, `app.js`
3. Ir a **Settings → Pages → Source: Deploy from branch → main → / (root)**
4. Tu app queda en `https://tuusuario.github.io/nombre-repo`

```bash
# Con Git
git init && git add . && git commit -m "StockControl v2"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
# Activar Pages en Settings del repo
```

## Credenciales

```
Usuario:    admin
Contraseña: SuperMercado2024!
```

### Cambiar contraseña
1. Generá el hash SHA-256: `echo -n "NuevaContraseña" | sha256sum`
2. En `auth.js` reemplazá `U_HASH` y/o `P_HASH`
3. Push a GitHub

## Seguridad
- Contraseñas almacenadas como SHA-256 (nunca texto plano en el código)
- Bloqueo automático tras 5 intentos fallidos (15 min)
- Sesión en `sessionStorage` (se borra al cerrar el navegador)
- Meta `noindex` activo

## Modelo de datos

```
Producto (1) ──→ Lote (N)
  - barcode          - productId
  - name             - qty
  - category         - expiry       ← fecha de vencimiento individual
  - unit             - enteredAt    ← cuándo se registró
                     - price
                     - notes
```

**Ejemplo Axe Apollo:**
- Lote 1: 20 unidades, vto 15/06/2025, ingresó 01/03/2025
- Lote 2: 50 unidades, vto 30/09/2025, ingresó 01/04/2025 (promo)

Cada lote se ve por separado con su fecha y cantidad.
