# Control Finance

App de finanzas personales, **mobile-first y local-first**, para registrar ingresos
y gastos reales, ver el balance del mes, tu meta de ahorro y en qué categorías se
va tu dinero.

Hecha como PWA: se instala desde Safari en iPhone (o Chrome en Android) y
funciona sin conexión. Los datos viven en el dispositivo y, si activas la nube,
se sincronizan con Supabase y se pueden añadir desde un **Atajo de iOS** en el
Centro de Control.

**App en vivo:** <https://bydavidp.github.io/Control_Finance/>

![Control Finance](docs/capturas/vista-general.png)

## Instalar en iPhone

1. Abre <https://bydavidp.github.io/Control_Finance/> en **Safari**.
2. Toca **Compartir → Añadir a pantalla de inicio**.
3. Ábrela desde el icono: se ve a pantalla completa y funciona sin conexión.

## Funcionalidad (v0.2)

- Alta de **ingresos y gastos** con monto, categoría, descripción y fecha.
- **Balance del mes**, comparación con el mes anterior y desglose de ingresos/gastos.
- **Movimientos por mes** (navegación ‹ ›), filtros y detalle con eliminación.
- **Gastos por semana** calculados con datos reales.
- **Meta de ahorro** configurable y progreso.
- **Perfil**: nombre, meta, estadísticas, exportar/importar JSON y borrado total.
- **Cuenta y nube (opcional)**: email + contraseña, sincronización con Supabase,
  cola local para cambios sin conexión y actualización automática.
- **Atajo de iOS**: añade gastos desde el Centro de Control o un widget de Atajos.
- PWA instalable y con app shell offline.

## Stack

- HTML + CSS + JavaScript vanilla (sin build).
- `localStorage` versionado (`controlfinance.v1`) como caché y modo local.
- [Supabase](https://supabase.com/) para auth, Postgres, RLS y Realtime.
- `@supabase/supabase-js` alojado en `web/vendor/supabase.js` (sin CDN).
- Service worker para uso offline.
- GitHub Pages + GitHub Actions para despliegue.

## Conectar la nube (Supabase)

La app funciona sin nube. Para activar la sincronización y el Atajo:

1. Crea un proyecto gratuito en <https://supabase.com/>.
2. En **SQL Editor → New query**, copia todo `supabase/schema.sql` y ejecuta **Run**.
   Crea perfiles, movimientos, RLS, el RPC `cf_quick_add` y Realtime.
3. En **Authentication → URL Configuration**, pon como **Site URL** la URL de la
   app (`https://bydavidp.github.io/Control_Finance/`).
4. Para evitar fricción, desactiva **Authentication → Sign In / Providers → Email
   → Confirm email**. Si lo dejas activo, confirma el correo antes de entrar.
5. Copia **Project URL** y **anon public key** en `web/config.js`:

   ```js
   window.CF_CONFIG = {
     supabaseUrl: "https://TU-PROYECTO.supabase.co",
     supabaseAnonKey: "eyJ...",
   };
   ```

6. Despliega. En la app: **Perfil → Cuenta y nube → Crear cuenta**.
7. Genera el token del Atajo y sigue [docs/atajo-ios.md](docs/atajo-ios.md).

> La **anon key** es pública por diseño: la seguridad real está en RLS. Nunca
> pongas la clave `service_role` en `web/config.js` ni en el Atajo.

### Cómo funciona la sincronización

- La nube es la fuente de verdad cuando hay sesión; `localStorage` es caché y
  fallback sin conexión.
- Cada alta, borrado o cambio de ajustes se encola y se envía a Supabase.
- Al volver a abrir o recuperar conexión, se reintenta la cola y se descargan los
  cambios.
- La app consulta cambios al abrir, al volver a primer plano y cada 30 segundos;
  con Realtime configurado, también al instante.
- El Atajo inserta con un token revocable que **solo puede agregar**, no leer.

## Atajo de iOS

Instrucciones completas en **[docs/atajo-ios.md](docs/atajo-ios.md)**.

Resumen:

1. En la app: **Perfil → Atajo de iOS → Generar token** y cópialo.
2. En **Atajos**, crea uno con: pedir monto → elegir categoría → **Obtener
   contenido de URL** (POST a `/rest/v1/rpc/cf_quick_add`) → notificación.
3. Añádelo al **Centro de Control** (iOS 18+) o a un **widget de Atajos**.

## Desarrollo local

```bash
cd web
python3 -m http.server 8000
```

Abre `http://localhost:8000`. Para probar en el teléfono dentro de la misma Wi-Fi,
usa la IP del equipo. Sin claves en `web/config.js`, la app arranca en modo local.

Parámetros útiles:

| URL | Efecto |
|---|---|
| `?demo=1` | Carga datos de ejemplo si no hay datos guardados |
| `?tab=movimientos` | Abre una pestaña concreta |
| `?static=1` | Desactiva animaciones (capturas) |

## Tests manuales rápidos

**Modo local**

1. Primer arranque: aparece la bienvenida.
2. «Probar con datos de ejemplo» → balance y lista con datos.
3. Añadir gasto → el balance baja y el movimiento aparece.
4. Recargar → los datos siguen ahí (localStorage).
5. Filtros Ingresos/Gastos, navegación de meses y borrar movimiento.
6. Exportar JSON → importarlo en otro navegador.

**Nube**

1. Crear cuenta → el badge pasa a **NUBE** y los datos locales se suben.
2. Añadir/borrar un movimiento → se refleja en Supabase.
3. Generar token → ejecutar el Atajo → **Sincronizar ahora** → aparece.
4. Recargar → la sesión sigue y los datos se descargan.
5. Cerrar sesión → badge **LOCAL**; volver a entrar → datos de la nube.

## Despliegue

El workflow `.github/workflows/pages.yml` publica `web/` en GitHub Pages en cada
push a `main`.

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push a `main`.
3. La app queda en `https://bydavidp.github.io/Control_Finance/`.

HTTPS es necesario para que funcionen el service worker, la instalación como PWA
y la generación del token del Atajo.

## Hoja de ruta

- [x] **v0.2** — Cuenta, sincronización con Supabase y Atajo de iOS.
- [ ] **v0.3** — Presupuestos por categoría, movimientos recurrentes y búsqueda.
- [ ] **v0.4** — Open finance en Colombia con Belvo (conexión bancaria) y
      conciliación automática.
- [ ] **v1.0** — Multimoneda, informes exportables y widget nativo (requiere app
      SwiftUI; el Atajo ya cubre el acceso rápido).

## Privacidad

Sin configurar Supabase, la app no envía datos a ningún servidor: todo se guarda
en el navegador del dispositivo. Si borras los datos del sitio o el navegador los
desaloja, se pierden; usa **Exportar datos** para respaldos.

Con Supabase, los datos se guardan en **tu** proyecto y están protegidos con RLS:
cada usuario solo accede a sus filas. La `anon key` es pública, pero no permite
leer datos ajenos. El token del Atajo solo permite insertar movimientos.

## Aviso

Es una herramienta de registro personal, no asesoría financiera ni contable.
