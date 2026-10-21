# Widget de saldo con Scriptable

Este widget muestra en tu pantalla de inicio el balance del mes, tus ingresos y gastos, y el total guardado. Usa la app gratuita **Scriptable** y lee los datos desde Supabase.

> Un widget de Scriptable se actualiza cuando iOS lo decide, no al instante. Normalmente se refresca varias veces al día, y también al abrir Scriptable.

## Antes de empezar

- La función `cf_quick_balance` debe estar en tu proyecto. Vuelve a ejecutar `supabase/schema.sql` en el SQL Editor (es idempotente).
- Debes tener el token del Atajo: **Perfil → Atajo de iOS → Generar token**.

## 1. Instala Scriptable

Descarga **Scriptable** desde la App Store (es gratis).

## 2. Crea el script

1. Abre **Scriptable** y toca **+**.
2. Pon de nombre **Control Finance**.
3. Abre en Safari el archivo [`docs/widget-scriptable.js`](widget-scriptable.js) del repositorio y copia todo su contenido.
4. Pégalo en el script de Scriptable, reemplazando lo que haya.
5. Toca **Listo**.

## 3. Guarda tu token

1. Toca **▶** (ejecutar) en el script.
2. Pega el token en el campo y toca **Guardar**.
3. Verás una vista previa del widget.

El token se guarda en el **Llavero de iOS**. Si cambias el token en la app, vuelve a ejecutar el script: si la conexión falla, te pedirá uno nuevo.

## 4. Añade el widget a la pantalla de inicio

1. Mantén pulsada la pantalla de inicio y toca **+**.
2. Busca **Scriptable** y elige el tamaño **Mediano**.
3. Toca **Añadir widget**.
4. Mantén pulsado el widget → **Editar widget**.
5. En **Script**, elige **Control Finance**.

Al tocar el widget se abre la app.

## Qué muestra

- **Balance del mes:** ingresos menos gastos del mes actual.
- **↑ ingresos y ↓ gastos** del mes.
- **Total guardado:** todos los movimientos desde el inicio.

## Seguridad

- El token permite **insertar** movimientos y leer **totales**. No permite ver la lista de movimientos ni modificarlos.
- El token queda solo en tu iPhone (Llavero de iOS).
- Si lo compartes o se filtra, genera uno nuevo en la app: el anterior deja de funcionar.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| "Token inválido" | Genera un token nuevo en la app y ejecuta el script para pegarlo. |
| "Sin conexión" | Revisa internet. El widget se actualizará solo más tarde. |
| El saldo no cambia al instante | Es normal: los widgets se actualizan cuando iOS lo decide. Ejecuta el script para forzarlo. |
| El widget dice "Control Finance" pero no aparece el script | En el widget, pulsa **Editar widget** y elige **Control Finance** en **Script**. |
