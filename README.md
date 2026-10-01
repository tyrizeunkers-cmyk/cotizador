# Cotizador — KM Motors / DK Energy

App instalable (PWA) para hacer cotizaciones desde el iPhone o la PC, con el diseño de cada negocio en PDF y los datos sincronizados en la nube.

## Qué hace

- Cambias entre **KM Motors** y **DK Energy** con un toque; cada uno tiene sus colores, campos y su propio PDF.
- **Folios automáticos y sin duplicados**, aunque cotices desde dos dispositivos:
  - KM Motors: `KMS-DDMMAA-NN` (el consecutivo reinicia cada día)
  - DK Energy: `0007`, `0008`, … (continúa después de tu Excel)
- Historial con búsqueda, filtro por estado (borrador, enviada, aceptada, rechazada) y resumen del mes.
- Catálogo de clientes (se guardan solos al guardar una cotización) y de productos o servicios con precio.
- Descuento (% o $) e IVA 16% opcionales.
- Renglones de **nota** sin precio (ej. "Entrega en 2 días hábiles").
- En el iPhone, **Compartir** abre el menú de iOS para mandar el PDF por WhatsApp, correo, etc. En la PC, **Ver PDF** lo abre en una pestaña.

---

## Puesta en marcha (unos 15 minutos, una sola vez)

### 1. Crear la base de datos en Supabase (gratis)

1. Entra a <https://supabase.com>, crea una cuenta y luego un proyecto (**New project**). Elige la región más cercana (por ejemplo, *East US*) y guarda la contraseña de la base de datos.
2. Cuando el proyecto esté listo, ve a **SQL Editor → New query**, pega todo el contenido de `supabase/schema.sql` y presiona **Run**. Debe decir *Success*.
3. Crea tu usuario: **Authentication → Users → Add user → Create new user**. Escribe tu correo y una contraseña, y marca **Auto Confirm User**.
4. Cierra el registro para que nadie más pueda crear cuentas: **Authentication → Sign In / Providers** → desactiva **Allow new users to sign up**.
5. Copia tus llaves: **Project Settings → API** (o **API Keys**):
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - **anon public** o **publishable key**

### 2. Conectar la app

Abre `js/config.js` y pega los dos valores:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';   // o sb_publishable_...
```

> Esta llave es pública por diseño. Tus datos están protegidos por tu usuario y contraseña, y por las reglas de seguridad (RLS) que crea `schema.sql`. **Nunca** pongas aquí la llave `service_role` ni la `secret`.

### 3. Publicarla con GitHub Pages (con GitHub Desktop)

1. En GitHub Desktop: **File → Add local repository…** → elige la carpeta `cotizador` → te ofrecerá **create a repository**; acéptalo.
2. **Publish repository**. Desmarca *Keep this code private* (GitHub Pages gratis requiere repositorio público; tus cotizaciones no quedan expuestas, solo el código).
3. En github.com, abre el repositorio → **Settings → Pages** → *Source*: **Deploy from a branch**, *Branch*: **main** y carpeta **/ (root)** → **Save**.
4. En 1 o 2 minutos tu app estará en `https://TU-USUARIO.github.io/cotizador/`.

> Si prefieres mantener el repositorio privado, puedes publicarlo gratis en **Netlify** o **Vercel**: conectas el repositorio y listo, sin configuración extra.

### 4. Instalarla

- **iPhone:** abre la dirección en **Safari** → botón **Compartir** → **Agregar a pantalla de inicio**.
- **PC (Chrome o Edge):** abre la dirección y haz clic en el ícono de **Instalar** en la barra de direcciones.

Entra con el correo y la contraseña que creaste en el paso 1.3.

---

## Modo local (para probar)

Si `js/config.js` queda vacío, la app funciona sin internet y sin login, pero guarda los datos **solo en ese navegador** (no sincroniza). Sirve para probarla. Para abrirla en tu PC sin publicarla, desde la carpeta del proyecto:

```bash
python -m http.server 8000
```

y abre <http://localhost:8000>. Abrir `index.html` con doble clic no funciona porque el navegador bloquea los módulos.

## Personalizar

| Qué | Dónde |
|---|---|
| Textos de condiciones, contacto, colores, vigencia | `js/empresas.js` |
| Folio inicial de DK (hoy empieza en 0007) | `js/empresas.js` → `folio.inicio` (solo aplica antes de la primera cotización) |
| Diseño del PDF | `js/pdf.js` (`pdfKM` y `pdfDK`) |
| Logos | `assets/` (mismo nombre de archivo) |
| Íconos de la app | `icons/` |

**Después de cambiar archivos**, sube el número en la primera línea de `sw.js` (`cotizador-v1` → `cotizador-v2`) para que el iPhone descargue la versión nueva. Dentro de la app también está **Menú ⋮ → Buscar actualización**.

## Estructura

```
index.html              página principal
css/styles.css          estilos
js/app.js               pantallas y lógica
js/db.js                conexión con Supabase (o almacenamiento local)
js/pdf.js               diseño de los PDF
js/calc.js              totales, IVA y descuentos
js/empresas.js          configuración de cada negocio
js/config.js            llaves de Supabase
supabase/schema.sql     tablas, seguridad y folios
vendor/pdf-lib.min.js   librería para generar PDF (MIT)
sw.js, manifest...      lo que la hace instalable
```
