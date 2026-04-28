# actividades-norte · registro.actividadesnorte.com

Repo completo, listo para borrar todo lo viejo y pegar esto.

## Estructura

```
actividades-norte/
├── api/
│   ├── actividad.js              ← sin cambios
│   ├── actividades-lista.js      ← sin cambios
│   ├── payment-intent.js         ★ MODIFICADO (cuota desde Airtable, metadata, idempotency)
│   └── submit.js                 ★ MODIFICADO (capacity check, email dup, idAsistente robusto)
├── assets/
│   ├── css/
│   │   ├── site.css              ← sin cambios
│   │   └── catalogo.css          ← sin cambios
│   ├── js/
│   │   ├── catalogo.js           ← sin cambios
│   │   ├── mobile-nav.js         ← sin cambios
│   │   └── reveal.js             ← sin cambios
│   └── png/                      ← TÚ AGREGAS (no en este ZIP)
├── pages/
│   ├── femenil/index.html        ← sin cambios
│   ├── registro/index.html       ★ tuyo + 2 ajustes:
│   │                                · BASE_URL → location.origin
│   │                                · &genero en return_url
│   ├── success/index.html        ★ MODIFICADO (verifica PI, ficha OXXO si aplica)
│   ├── v/index.html              ← sin cambios
│   └── varonil/index.html        ← sin cambios
├── index.html                    ← homepage del root, sin cambios
├── vercel.json                   ★ MODIFICADO (rewrites + headers + cache)
└── README.md
```

## URLs públicas

Los `rewrites` en `vercel.json` mantienen las URLs limpias:

| URL pública      | Sirve archivo                        |
|------------------|--------------------------------------|
| `/`              | `/index.html`                        |
| `/varonil`       | `/pages/varonil/index.html`          |
| `/femenil`       | `/pages/femenil/index.html`          |
| `/v?id=AV024`    | `/pages/v/index.html`                |
| `/registro?id=…` | `/pages/registro/index.html`         |
| `/success?id=…`  | `/pages/success/index.html`          |

## Páginas que NO te incluí (porque no me las mandaste)

Si tu repo viejo tenía estas, **deberás recrearlas o conservarlas**:

- `/contacto` → `/pages/contacto/index.html`
- `/terminos` → `/pages/terminos/index.html`
- `/privacidad` → `/pages/privacidad/index.html`
- `/politicas` → `/pages/politicas/index.html`
- `/apartado` → `/pages/apartado/index.html`

Si las recreas en `/pages/contacto/index.html`, etc., **agrega los rewrites correspondientes** en `vercel.json`:

```json
{ "source": "/contacto",   "destination": "/pages/contacto/index.html" },
{ "source": "/terminos",   "destination": "/pages/terminos/index.html" },
{ "source": "/privacidad", "destination": "/pages/privacidad/index.html" },
{ "source": "/politicas",  "destination": "/pages/politicas/index.html" },
{ "source": "/apartado",   "destination": "/pages/apartado/index.html" }
```

---

## Después de descomprimir

### 1. Pega tu carpeta `assets/png/`
La que dijiste que agregas tú.

### 2. Variables de entorno en Vercel
- `STRIPE_SECRET_KEY_VARONIL`
- `STRIPE_SECRET_KEY_FEMENIL`
- `AIRTABLE_PAT_ACTIVIDADES`
- `AIRTABLE_PAT_VARONIL`
- `AIRTABLE_PAT_FEMENIL`
- `PUBLIC_BASE_URL` (opcional, default: `https://registro.actividadesnorte.com`)

### 3. Activar OXXO en Stripe Dashboard
En **ambas cuentas** (varonil y femenil): Settings → Payment methods → OXXO.

### 4. Actualizar Airtable Automation Scripts
Reemplaza los scripts viejos con `airtable-script-varonil.js` y `airtable-script-femenil.js`
(entregados por separado, no en este ZIP).

---

## Resumen de los cambios principales

### Bug crítico: "pagos sin metadata" → resuelto
El flow viejo usaba **Stripe Checkout Sessions** (redirect) con metadata SOLO en la
Session. Los webhooks `payment_intent.*` y el dashboard de Payments leen del
**PaymentIntent**, que NO heredaba la metadata.

**Solución:** ahora se usa **Stripe Elements embebido** dentro de tu form de registro
(ya estaba implementado), y `payment-intent.js` pone la metadata DIRECTA en el PI.

### Otros fixes
- **Cuota desde Airtable** (no del cliente) — cierra agujero de monto manipulable
- **Capacity check** en submit.js (409 si actividad llena)
- **Email duplicado** en submit.js (409 si ya hay registro con ese email + actividad)
- **idAsistente de 6 dígitos** con retry contra colisiones
- **MSI** activado en tarjeta
- **OXXO** con vencimiento de 2 días + ficha visible en `/success`
- **Idempotency-Key** contra dobles clicks
- **Headers de seguridad** y cache en `vercel.json`
- **CORS** en submit.js (faltaba)
- **BASE_URL dinámico** en registro (usa `location.origin`)
- **&genero** en return_url para que `/success` use la PK correcta

## Flujo

```
/varonil o /femenil      →  catálogo (catalogo.js + /api/actividades-lista)
       ↓
/v?id=AV024              →  detalle de actividad (botón Registrarme)
       ↓
/registro?id=AV024       →  form 4 pasos:
                            1. Datos personales
                            2. Tipo y método de pago
                            3. Términos
                            4. Stripe Elements EMBEBIDO (mismo URL)
       ↓ stripe.confirmPayment
/success?id=…&genero=…   →  éxito o ficha OXXO según método elegido
```
