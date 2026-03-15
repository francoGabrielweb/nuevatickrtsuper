# StockControl — Sistema de Inventario para Supermercado

Aplicación web estática lista para GitHub Pages. Gestiona inventario de productos con escaneo de códigos de barras, control de fechas de vencimiento y reportes.

## 🚀 Deploy en GitHub Pages

### Opción A — Repositorio nuevo

1. Creá un repositorio en GitHub (puede ser privado)
2. Subí los 4 archivos:
   - `index.html`
   - `styles.css`
   - `db.js`
   - `auth.js`
   - `app.js`
3. Ir a **Settings → Pages → Source: Deploy from branch → main → / (root)**
4. En unos minutos tu app estará en `https://tuusuario.github.io/nombre-repo`

### Opción B — Con Git

```bash
git init
git add .
git commit -m "StockControl v1"
git remote add origin https://github.com/TUUSUARIO/REPO.git
git push -u origin main
```

Después activar Pages en Settings del repositorio.

---

## 🔐 Credenciales

```
Usuario:    admin
Contraseña: SuperMercado2024!
```

### Cambiar la contraseña

1. Generá el hash SHA-256 de tu nueva contraseña:
   - En Linux/Mac: `echo -n "TuNuevaContraseña" | sha256sum`
   - Online: https://emn178.github.io/online-tools/sha256.html
   
2. En `auth.js`, reemplazá las líneas:
   ```js
   const VALID_USER_HASH = 'NUEVO_HASH_USUARIO';
   const VALID_PASS_HASH = 'NUEVO_HASH_CONTRASEÑA';
   ```

3. Empujá el cambio a GitHub. Listo.

---

## 🔒 Modelo de seguridad

- Las contraseñas **nunca aparecen en texto plano** en el código fuente
- Se usan hashes **SHA-256** via Web Crypto API (nativa del navegador)
- **Bloqueo automático** tras 5 intentos fallidos (15 minutos)
- La sesión vive en `sessionStorage` (se borra al cerrar la pestaña)
- Metaetiqueta `noindex, nofollow` para evitar indexación

> ⚠️ Para máxima seguridad, usar repositorio **privado** en GitHub.

---

## 📱 Compatibilidad BarcodeDetector

| Navegador | Soporte |
|-----------|---------|
| Chrome/Edge (desktop) | ✅ |
| Chrome Android | ✅ |
| Safari iOS 17+ | ✅ |
| Firefox | ❌ (usar entrada manual) |

Si el navegador no soporta BarcodeDetector, el campo manual sigue funcionando.

---

## 💾 Almacenamiento

Usa **IndexedDB** (no localStorage). Soporta miles de productos y lotes sin límite de tamaño práctico. Los datos quedan en el navegador del dispositivo donde se usa.

---

## 📦 Estructura

```
stockcontrol/
├── index.html    # Estructura HTML, login, pantallas
├── styles.css    # Estilos completos
├── db.js         # Capa de datos (IndexedDB)
├── auth.js       # Autenticación SHA-256 + lockout
└── app.js        # Lógica: scanner, inventario, reportes
```

---

## Funcionalidades

- **Escanear**: BarcodeDetector API + fallback manual
- **Registro automático**: si el producto ya existe, agrega un nuevo lote; si no, pide los datos
- **Inventario**: tabla completa con búsqueda y filtro por categoría
- **Vencimientos**: filtro por rango de días, alertas visuales
- **Reportes**: por categoría, ingresos recientes, alertas críticas
- **Exportar CSV**: inventario completo y reporte de vencimientos
