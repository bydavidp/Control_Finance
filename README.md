# Control Finance

App de finanzas personales para iPhone (y cualquier navegador moderno). Registra ingresos y gastos, muestra el balance del mes, tu meta de ahorro y en qué categorías se va tu dinero.

Es una **PWA**: se instala desde Safari, funciona sin conexión y se puede usar con o sin cuenta en la nube.

**App en vivo:** <https://bydavidp.github.io/Control_Finance/>

## Funciones

- Ingresos y gastos con monto, categoría, descripción y fecha.
- Balance del mes, comparación con el mes anterior y gastos por semana.
- Movimientos por mes, filtros y detalle con eliminación.
- Meta de ahorro con progreso.
- **Cuenta y nube (opcional):** registro con nombre, inicio de sesión, recuperación de contraseña y sincronización con Supabase.
- **PIN de 4 dígitos** por dispositivo, con bloqueo automático al salir de la app.
- **Atajo de iOS** para agregar gastos desde el Centro de Control.
- **Widget de saldo** con Scriptable (ver [docs/widget-scriptable.md](docs/widget-scriptable.md)).
- Copia de seguridad en JSON (exportar e importar).

## Arquitectura

Vite + TypeScript, sin frameworks de interfaz. Cada capa tiene una responsabilidad:

```
app/
├── index.html              Estructura de pantallas, hojas y acceso
├── vite.config.ts          Build, base de GitHub Pages y PWA
├── .env                    Claves públicas de Supabase (publishable key)
├── src/
│   ├── main.ts             Arranque
│   ├── events.ts           Eventos de la interfaz (delegación)
│   ├── controller.ts       Acciones de usuario (guardar, borrar, exportar…)
│   ├── render.ts           Dibuja la interfaz a partir del estado
│   ├── lifecycle.ts        Sincronización periódica, bloqueo y conexión
│   ├── domain/             Tipos, formato y cálculos (funciones puras)
│   ├── store/              Estado, persistencia en localStorage y migración
│   ├── cloud/              Cliente Supabase, cola de sincronización, tokens
│   ├── auth/               Sesión, recuperación, PIN y pantalla de acceso
│   ├── ui/                 Componentes: hojas, acceso, iconos y avisos
│   ├── views/              Inicio, movimientos y perfil
│   └── styles/             Tokens de diseño, base, componentes y pantallas
└── tests/                  Pruebas de extremo a extremo (Selenium)
```

### Diseño visual

- Tokens de color, espaciado y radios en `src/styles/tokens.css`.
- **Tema claro y oscuro** según la configuración del sistema del iPhone.
- Números con cifras tabulares, áreas seguras de iPhone y campos de 16 px para que iOS no haga zoom.

### Datos

- El estado vive en `localStorage` con la clave `controlfinance.v1`. Es la fuente de verdad sin cuenta y la caché con cuenta.
- Con cuenta, los cambios se encolan y se envían a Supabase. Si no hay conexión, se reintentan al volver.
- Los datos de versiones anteriores se conservan: la clave y el formato no cambiaron.

## Desarrollo

Requisitos: Node 22 o superior.

```bash
cd app
npm install
npm run dev          # servidor local con los datos reales de Supabase
npm run typecheck    # revisa tipos
npm run build        # verifica tipos y genera dist/
```

Para trabajar sin nube, usa `npm run dev:offline` (puerto 5175).

## Pruebas

Las pruebas de extremo a extremo usan un mock de Supabase y Chromium con Selenium:

```bash
# Terminal 1: mock de Supabase
python3 app/tests/mock_supabase.py

# Terminal 2: app con nube simulada
cd app && npm run dev:test

# Terminal 3: app sin nube
cd app && npm run dev:offline

# Terminal 4: pruebas
cd app && python3 tests/e2e.py
```

Las pruebas cubren registro con nombre, mostrar contraseña, alta, filtros, meses, eliminación, ajustes, PIN, recuperación, layout en tres tamaños y modo sin nube.

## Configurar la nube (Supabase)

La app funciona sin nube. Para activarla:

1. Crea un proyecto gratuito en <https://supabase.com/>.
2. En **SQL Editor → New query**, pega todo `supabase/schema.sql` y ejecuta **Run**. Es idempotente.
3. En **Authentication → Sign In / Providers → Email**, deja el proveedor **activado**. Si quieres entrar sin confirmar el correo, desactiva **Confirm email**.
4. En **Authentication → URL Configuration**:
   - **Site URL:** `https://bydavidp.github.io/Control_Finance/`
   - **Redirect URLs:** agrega la misma dirección. Así funciona el enlace de recuperación.
5. Copia **Project URL** y **publishable key** en `app/.env`:

   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

La clave publicable es pública por diseño: la seguridad real está en las reglas RLS del esquema. **Nunca** pongas la clave `service_role` en la app ni en el Atajo.

## Acceso: sesión, recuperación y PIN

- **Iniciar sesión** con email y contraseña. La sesión se conserva en el dispositivo.
- **Crear cuenta** pide tu nombre, que se usa en el saludo.
- **¿Olvidaste tu contraseña?** envía un enlace al correo. Al abrirlo, eliges una contraseña nueva.
- **PIN de 4 dígitos** (Perfil → Bloqueo con PIN): se pide al abrir la app y después de un minuto en segundo plano. Se guarda cifrado en el dispositivo. Tras 5 intentos fallidos, pide la contraseña.

## Atajo de iOS y widget

- Atajo para el Centro de Control y la pantalla de inicio: [docs/atajo-ios.md](docs/atajo-ios.md).
- Widget de saldo con Scriptable: [docs/widget-scriptable.md](docs/widget-scriptable.md).

Una PWA no puede instalar widgets nativos de iOS. Para eso haría falta una app nativa en SwiftUI.

## Despliegue

El workflow `.github/workflows/pages.yml` instala dependencias, verifica tipos, construye `app/` y publica `app/dist` en GitHub Pages en cada push a `main`.

En GitHub: **Settings → Pages → Source: GitHub Actions**.

## Privacidad

Sin cuenta, la app no envía datos a ningún servidor: todo queda en el navegador del dispositivo. Si borras los datos del sitio, se pierden; usa **Exportar copia de seguridad** para respaldos.

Con cuenta, los datos se guardan en **tu** proyecto de Supabase y están protegidos con RLS: cada usuario solo accede a sus filas. El token del Atajo permite insertar movimientos y leer totales; no permite listar ni modificar movimientos.

## Hoja de ruta

- [ ] Presupuestos por categoría.
- [ ] Movimientos recurrentes y búsqueda.
- [ ] Open finance en Colombia con Belvo (conciliación bancaria).
- [ ] Widget nativo con WidgetKit (requiere app SwiftUI).

## Aviso

Es una herramienta de registro personal, no asesoría financiera ni contable.

## CREADO POR DAVID PALACIOS

