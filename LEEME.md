# NOVA NIIF MASTER PRO — v8

Simulador de certificación IFRS y consultor técnico NIIF con IA. Funciona en español, inglés y portugués, y se puede instalar como app (PWA).

## Qué cambió frente a la v7

- **Error de arranque corregido.** La función inexistente `renderConsultationDefault` dejaba el examen en blanco al abrir la app.
- **El consultor ahora usa IA real.** Antes devolvía una respuesta fija. Ahora razona cada caso con la API de Claude: identifica la norma, calcula paso a paso, propone asientos, cita párrafos y, cuando la pregunta trata de novedades, busca en fuentes oficiales (IFRS Foundation y las grandes firmas).
- **Las aclaraciones son reales.** Cada aclaración continúa el mismo caso con todo el contexto anterior.
- **Licencia PRO.** El usuario ingresa su código y el servidor lo valida. El límite DEMO también se controla en el servidor, por IP, así que ya no basta con borrar los datos del navegador para saltarlo.
- **Examen.** Las opciones se mezclan en cada intento (antes la respuesta casi siempre era la B), y cambiar de idioma ya no borra lo que el usuario había respondido.
- **Panel de novedades.** Ahora se carga desde `updates.json`. Incluye NIIF 18 (con la descripción corregida), NIIF 19, la tercera edición de NIIF para las PYMES, NIC 21, las dos enmiendas a NIIF 9/7, las Mejoras anuales y NIIF 20.
- **PWA.** La caché tiene versión y se carga primero desde la red, así que los usuarios reciben siempre la última versión. Los íconos van incluidos en el paquete.
- **Aviso legal.** Se agregó que la plataforma no está afiliada a la IFRS Foundation ni a ACCA.

## Cómo publicar (importante)

Estructura del proyecto:

```
public/              Lo único que se publica (landing, app, panel, imágenes)
netlify/functions/   Consultor con IA y panel de códigos (se ejecutan en el servidor)
netlify/shared/      Código compartido por las funciones
netlify.toml         Configuración: publica solo "public"
package.json         Librería de almacenamiento (Netlify la instala sola)
```

Las funciones del consultor **no se activan si se sube por arrastre** (Netlify Drop). Usa GitHub:

1. Crea un repositorio **nuevo** en GitHub y sube **todo el contenido** de esta carpeta: `public`, `netlify`, `netlify.toml`, `package.json` y `package-lock.json`. No subas `node_modules`.
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige ese repositorio. No cambies la configuración; `netlify.toml` ya define todo. La publicación tarda entre 1 y 3 minutos.
3. Configura las variables de entorno (ver abajo) y vuelve a publicar con **Deploys → Trigger deploy → Deploy site**.

Si antes creaste un sitio con la versión anterior, bórralo o crea uno nuevo: la versión anterior publicaba toda la carpeta, incluidos miles de archivos internos, y por eso la publicación no terminaba.

## Variables de entorno

Se configuran en Netlify, en **Site configuration → Environment variables**.

| Variable | Obligatoria | Ejemplo | Uso |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | `sk-ant-...` | Clave de la API de Claude (se obtiene en console.anthropic.com) |
| `ADMIN_KEY` | Sí | (mínimo 12 caracteres) | Clave del panel `/admin.html` para crear, renovar y anular códigos PRO |
| `PRO_CODES` | No | `NOVA-7K2P-Q9XM` | Códigos permanentes, sin vencimiento (por ejemplo, para cortesías). Lo normal es crearlos en el panel |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-5-5` | Modelo que usa el consultor (este es el valor por defecto) |
| `DEMO_LIMIT` | No | `2` | Consultas gratuitas por usuario |
| `PRO_MONTHLY_LIMIT` | No | `300` | Consultas por mes por código PRO, incluidas las aclaraciones (uso justo). Debe coincidir con `fairUse` en `index.html` |
| `WEB_SEARCH` | No | `off` | Desactiva la búsqueda web para reducir costos |

Después de agregar o cambiar una variable, vuelve a publicar el sitio.

## Planes, precios y pagos

Los precios y los medios de pago se editan en `index.html`, en el bloque `const PLANS`:

```
monthly: 19, annual: 190            Precio Ecuador (se suma IVA)
intlMonthly: 39, intlAnnual: 390    Precio internacional (PayPal, sin IVA)
ivaEcuador: 15                      % de IVA para Ecuador
fairUse: 300                        Consultas al mes (igual que PRO_MONTHLY_LIMIT)
whatsapp: '593993463014'            WhatsApp para transferencias (sin el 0 inicial)
paypalEmail: 'ingmarcorivera@yahoo.es'
```

- **Ecuador:** el cliente pulsa "Pagar por WhatsApp" y te llega un mensaje con el plan, el total con IVA y la plantilla de sus datos de facturación.
- **Internacional:** el botón de PayPal abre el pago por el precio internacional. Cada pago es único: para renovar, el cliente vuelve a pagar. El cobro automático mes a mes requiere una cuenta PayPal Business con botón de suscripción.

## Panel de administración de códigos (`/admin.html`)

Entra a `https://tu-sitio/admin.html` con tu `ADMIN_KEY`. No aparece en el menú de la app y los buscadores no lo indexan.

1. **Confirmas el pago** (transferencia o PayPal) y emites la factura.
2. **Generar código:** escribe el cliente, su WhatsApp, el plan y la forma de pago. El sistema crea un código único (por ejemplo `NOVA-PTR5-5YTT`) y calcula el vencimiento.
3. **Enviar por WhatsApp:** el botón abre WhatsApp con el mensaje de bienvenida, el código y las instrucciones de activación.
4. **Renovar:** cuando el cliente vuelve a pagar, pulsas "Renovar". El vencimiento se extiende y el cliente sigue con el mismo código.
5. **Por vencer y vencidos:** el panel los marca y genera el mensaje de recordatorio para enviarlo por WhatsApp.
6. **Anular:** quita el acceso de inmediato.
7. **Exportar CSV:** descarga la lista de suscripciones para Excel.

Cuando un código vence, la app le avisa al cliente que debe renovar.

## Costos de la API

Cada consulta consume tokens de la API de Claude: unos USD 0.02 por ejercicio o aclaración. Cuando el consultor busca novedades, además se cobra cada búsqueda web (USD 10 por cada 1,000, con un máximo de 2 por consulta), y una consulta así cuesta unos USD 0.08. Conviene fijar un límite de gasto mensual en la consola de Anthropic.

## Cómo actualizar las normas en el futuro

- **Panel de novedades:** edita `updates.json`. Agrega un bloque con la norma, la fuente y los textos en los tres idiomas, cambia la fecha `"updated"` y publica. No hace falta tocar el código.
- **Consultor:** busca por sí mismo en fuentes oficiales cuando le preguntan por cambios recientes, así que puede responder sobre normas emitidas después de la fecha de corte de su conocimiento.
- **Cada nueva versión:** cambia `CACHE_VERSION` en `sw.js` para que los usuarios que tienen la app instalada reciban la actualización.

## Landing page

`index.html` es la página de presentación y `app.html` es la herramienta. Los botones "Probar gratis" abren la app directamente en el consultor (`app.html#profesional`).

- **Fotografías:** se cargan desde Unsplash (licencia gratuita, uso comercial permitido) en varias resoluciones, hasta 3200 px según la pantalla, con un tratamiento de color propio de la marca. Para cambiar una foto, reemplaza el identificador `photo-…` en las tres URL de esa imagen.
- **Capturas de la app:** están en `assets/` a doble resolución (triple en la del celular). Si la app cambia, se pueden regenerar.
- **Precios:** el bloque `const PLANS` de `index.html` debe coincidir con el de `app.html`.

## Archivos

```
public/index.html               Landing page comercial (español)
public/app.html                 App (consultor, simulador, novedades, planes)
public/admin.html               Panel privado de códigos PRO
public/assets/                  Capturas en alta resolución de la app (WebP)
public/updates.json             Panel de novedades normativas (editable)
public/sw.js                    Service worker (PWA)
public/manifest.json, icons/    Instalación como app
netlify/functions/consultor.mjs Motor del consultor (API de Claude + búsqueda web)
netlify.toml, package.json      Configuración de Netlify
```

## Pendientes recomendados

- Ampliar el banco de preguntas del examen. Hoy tiene 5 por idioma; lo ideal son entre 30 y 50 por norma.
- Automatizar la entrega de códigos con un sistema de pagos (hoy se generan en el panel al confirmar el pago).
- Confirmar la nota mínima de aprobación (hoy está en 70%, en la constante `PASS_MARK` de `index.html`).
