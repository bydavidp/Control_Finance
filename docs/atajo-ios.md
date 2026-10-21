# Atajo de iOS: añade gastos desde el Centro de Control

Con esto puedes registrar un gasto sin abrir la app: el Atajo pregunta el monto y
la categoría, envía el movimiento a Supabase y la PWA lo muestra al sincronizar.

> **Nota sobre widgets:** una PWA no puede instalar un widget nativo de iOS. Lo que
> sí funciona —y se siente nativo— es un **Atajo** en el **Centro de Control**
> (iOS 18+) o en un **widget de Atajos** en la pantalla de inicio. Un widget con
> saldo dibujado a medida requeriría una app nativa en SwiftUI/Xcode.

## Antes de empezar

- iPhone con iOS 18 o superior para el Centro de Control. En iOS 17 puedes usar
  el widget de Atajos o Siri.
- La app instalada en la pantalla de inicio.
- El proyecto de Supabase configurado y el esquema `supabase/schema.sql` ejecutado.
- Una cuenta creada dentro de la app (Perfil → Cuenta y nube).

## 1. Crea tu cuenta en la app

1. Abre **Control Finance**.
2. Ve a **Perfil → Cuenta y nube**.
3. Escribe tu email y una contraseña (mínimo 6 caracteres).
4. Toca **Crear cuenta**.
5. Si Supabase tiene la confirmación de correo activada, confirma el email y
   vuelve a entrar con **Entrar**.

Tus movimientos locales se suben a la nube la primera vez que entras.

## 2. Genera el token del Atajo

1. En **Perfil**, baja hasta **Atajo de iOS**.
2. Toca **Generar token del atajo**.
3. Toca **Copiar token**.

El token es un secreto de solo inserción: sirve para agregar movimientos, no para
leerlos. Si se filtra, genera otro y actualiza el Atajo. También puedes tocar
**Copiar configuración del atajo** para copiar la URL, la `apikey` y el cuerpo
JSON de referencia.

## 3. Crea el Atajo

Abre **Atajos** → **+** y nómbralo **Gasto rápido**.

### Acción 1: pedir el monto

1. Busca **Pedir entrada**.
2. Tipo: **Número**.
3. Pregunta: `¿Cuánto gastaste?`.

La salida de esta acción es el monto. Si quieres asegurarte de que sea un número,
añade **Obtener número de la entrada** y usa esa salida.

### Acción 2: elegir la categoría

1. Busca **Elegir del menú**.
2. Pregunta: `Categoría`.
3. Añade las opciones:
   - Comida
   - Transporte
   - Hogar
   - Ocio
   - Salud
   - Compras
   - Otros

La salida de **Elegir del menú** es la opción elegida; úsala como categoría.

### Acción 3 (opcional): una nota

Añade **Pedir entrada** → tipo **Texto** → pregunta `¿Nota?`.
Si no la quieres, omite esta acción y no envíes `p_note`.

### Acción 4: enviar a Supabase

Añade **Obtener contenido de URL** y configura:

- **URL:**
  `https://TU-PROYECTO.supabase.co/rest/v1/rpc/cf_quick_add`
- **Método:** `POST`
- **Cabeceras:**
  - `apikey`: tu clave **anon public** de Supabase
  - `Content-Type`: `application/json`
- **Cuerpo de la solicitud:** `JSON`

Añade estos campos:

| Campo | Valor |
|---|---|
| `p_token` | tu token del Atajo (texto) |
| `p_amount` | la variable **Monto** (número) |
| `p_type` | `expense` |
| `p_category` | la variable **Categoría** |
| `p_note` | la variable **Nota** (opcional) |

`p_date` es opcional: si no lo envías, Supabase usa la fecha de hoy. Para enviar
una fecha concreta, añade **Fecha actual → Formatear fecha** con formato
personalizado `yyyy-MM-dd` y usa esa variable como `p_date`.

> **Importante:** `p_amount` debe viajar como número, no como texto entre comillas.
> Si el editor JSON lo pone entre comillas, usa la salida de **Obtener número de
> la entrada**.

### Acción 5: confirmar

Añade **Mostrar notificación** con el texto `Gasto guardado`.

### Probar

1. Ejecuta el Atajo.
2. Escribe `25000`, elige `Comida`.
3. Debe aparecer la notificación.
4. Abre la app → **Perfil → Sincronizar ahora** (o espera: la app sincroniza al
   abrir y cada 30 segundos mientras está visible).

## 4. Añádelo al Centro de Control o a la pantalla de inicio

### Centro de Control (iOS 18+)

1. Desliza para abrir el **Centro de Control**.
2. Toca **+** (arriba a la izquierda) → **Añadir un control**.
3. Busca **Atajos**.
4. Elige **Gasto rápido**.

También puedes hacerlo desde **Ajustes → Centro de Control**.

### Widget de Atajos (pantalla de inicio)

1. Mantén pulsada la pantalla de inicio.
2. Toca **+** → **Atajos**.
3. Añade el widget y elige **Gasto rápido**.

Este es el equivalente práctico a un widget: un botón nativo que ejecuta el Atajo
con un toque.

### Siri

Di: **“Oye Siri, Gasto rápido”**.

## 5. Crea el Atajo de ingresos (opcional)

Duplica **Gasto rápido**, cámbiale el nombre a **Ingreso rápido** y en el cuerpo
JSON usa:

- `p_type`: `income`
- `p_category`: `Salario`, `Freelance`, `Ventas` u otra.

Puedes añadir los dos Atajos al Centro de Control o hacer un menú
**Gasto / Ingreso** dentro de un solo Atajo.

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `Token inválido` o 401 | El token no coincide. Genera uno nuevo en la app y actualízalo en el Atajo. |
| `Monto inválido` o 400 | `p_amount` debe ser mayor que 0 y numérico. |
| 404 | La URL debe terminar en `/rest/v1/rpc/cf_quick_add`. |
| No aparece en la app | Abre la app y toca **Sincronizar ahora**; revisa internet. |
| El Atajo funciona pero la app está cerrada | Es normal: se sincroniza al abrirla. |
| Cambié el token y dejó de funcionar | Vuelve a copiar el token nuevo en el Atajo. |
| La app se reinstaló y no veo el token | Inicia sesión y genera uno nuevo; el anterior queda invalidado. |

## Seguridad

- La **anon key** es pública por diseño; no pasa nada si aparece en el Atajo.
- **Nunca** uses la clave `service_role` en la app ni en el Atajo.
- El token del Atajo solo permite **insertar** movimientos; no puede leer tus datos.
- Puedes revocarlo cuando quieras generando otro.
- El token se guarda en el Atajo y en el llavero de Atajos; protege tu iPhone.
- Las filas están protegidas con RLS: cada usuario solo ve las suyas.
