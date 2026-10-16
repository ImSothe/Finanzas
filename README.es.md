# Finanzas · guía en español

> Documentación completa en inglés: [README.md](README.md). **App en línea:** https://imsothe.github.io/Finanzas/ (solo la interfaz: no guarda datos; la conectas a *tu* hoja de Google).

App web (PWA) para llevar tus gastos sin pereza, conectada a **Google Sheets**:

- **Gasto pequeño en 3 segundos** (un café): importe, concepto, y la categoría se elige sola según tu diccionario de costumbres.
- **Rayos X de tickets**: haces foto a un ticket grande (una compra de 170 €) y la IA (Gemini) lo desglosa **artículo por artículo**, te enseña de qué categoría sale cada euro y lo guarda dividido por categorías o en una sola fila con el detalle.
- **"Cuánto me queda este mes"** siempre arriba, con la misma fórmula que el Excel de origen (sueldo + extras − fijos − suscripciones − gastos del día a día + devoluciones).
- Funciona **sin conexión** (cola de envío) y se instala en la pantalla de inicio como una app.

```
┌───────────────┐  fetch   ┌──────────────────────┐   lee/escribe   ┌───────────────┐
│  PWA (móvil)  │ ───────► │ Google Apps Script   │ ──────────────► │ Google Sheets │
│  app/         │ ◄─────── │ backend/Code.gs      │ ◄────────────── │ (tu base)     │
└──────┬────────┘   JSON   └──────────────────────┘                 └───────────────┘
       │ foto del ticket (JPEG comprimido, directo)
       ▼
  Gemini API (gemini-2.5-flash)
```

## Qué hay en el repositorio

| Ruta | Para qué |
|---|---|
| `app/` | La web app (HTML + JS sin build): `index.html`, `app.js` (interfaz), `core.js` (lógica pura), `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/xlsx.full.min.js` (SheetJS) |
| `backend/Code.gs` | Backend **genérico** para pegar en Google Apps Script |
| `tools/build_seed.py` | Lee **tu** Excel de finanzas y extrae categorías, sueldo, fijos, suscripciones y diccionario de costumbres → `seed/` (no se sube a git) |
| `tools/build_gs.py` | Genera `dist/Code.gs`: el mismo backend **con tus datos de arranque** dentro (no se sube a git) |
| `tools/dev_server.js` | Servidor de pruebas local: sirve la app, ejecuta el `Code.gs` real sobre una hoja simulada y simula a Gemini |
| `tests/` | Pruebas automáticas (`npm test`) |

## Puesta en marcha (≈ 10 minutos)

### 1. Preparar tu `Code.gs` personal
```bash
pip install openpyxl
python tools/build_seed.py "C:/ruta/tu_excel_de_finanzas.xlsx"   # -> seed/seed.json (categorías, sueldo, diccionario…)
python tools/build_gs.py                                         # -> dist/Code.gs  (listo para pegar)
```
Si no quieres partir de un Excel, usa `backend/Code.gs` (genérico): las pestañas se crean vacías y editas la pestaña **Config** de la hoja.

### 2. Crear la base en Google Sheets
1. Crea una **hoja de cálculo de Google** nueva (sheets.new).
2. **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de `dist/Code.gs`. Guarda.
3. Recarga la hoja: aparece el menú **💰 Finanzas App**. Pulsa **1. Configurar**. Google pedirá permisos la primera vez (*"app no verificada" → Configuración avanzada → Ir a…*; es tu propio script).
4. Te muestra un **TOKEN**. Cópialo.
5. **Implementar → Nueva implementación → Aplicación web**: *Ejecutar como*: **Yo**; *Quién tiene acceso*: **Cualquier usuario**. Copia la URL que termina en `/exec`.

> Cada vez que cambies `Code.gs` hay que volver a implementar (*Administrar implementaciones → Editar → Versión nueva*).

### 3. Publicar la app (necesita HTTPS: la cámara y la instalación no funcionan sin él)
Ya está publicada en **https://imsothe.github.io/Finanzas/** (GitHub Pages, automático al hacer push a `app/`). Si prefieres alojarla tú, sirve la carpeta `app/` desde cualquier hosting estático con HTTPS (**Netlify**, **Cloudflare Pages**…).

### 4. Conectar y usar
1. Abre la URL en el móvil → **Ajustes**: pega la **URL `/exec`** y el **token** → *Probar*.
2. (Opcional, escáner) pega tu **API key de Gemini** ([Google AI Studio](https://aistudio.google.com/apikey)). El modelo por defecto es `gemini-2.5-flash`.
3. (Opcional) **Ajustes → Importar .xlsx** y elige tu Excel: trae tu historial (no duplica si lo repites).
4. **Instalar**: Android/Chrome → menú ⋮ → *Instalar app*. iPhone/Safari → Compartir → *Añadir a pantalla de inicio*.
5. **Otro móvil**: Ajustes → *🔗 Enlace para configurar otro móvil* → te lo envías a ti mismo y lo abres allí (te pide confirmar el servidor; así no escribes el token a mano).

## Cómo se usa

- **➕ Hoy**: escribe el importe → concepto → Guardar. Al escribir `caf`, `figu`, `moto`… sugiere y **elige la categoría solo** (marca *auto ✨*; pulsa para cambiarla). Si le corriges una categoría, **lo aprende** y lo guarda en la hoja (pestaña *Diccionario*).
- **🖥️ Vista de escritorio**: en pantallas anchas (≥ 1000 px) la app cambia al **Modo avanzado**, un diseño tipo Excel con menú lateral: *Centro de Mando* (entra / sale / queda, batería con alarma a partir del 80 % gastado, barra de alta rápida, tabla por categorías), **tabla de gastos editable**, *Devoluciones*, *Extras* (horas × tarifa o pago fijo), *Resumen del Año* (12 meses + filas de ahorros), *Ahorros*, *Deudas* (me debe / debo) y *Piloto Automático* (sueldo, fijos por mes, suscripciones, tipos de extra, tarifa por hora). En el móvil cada sección se abre a pantalla completa desde Ajustes → Más secciones. Mismos datos en ambos. Cambias con los botones “Vista simplificada” / “Modo avanzado” o lo fuerzas en Ajustes → Vista.
- **🏦 Ahorros y 🤝 Deudas**: los ahorros crecen solos cada mes (`entra − sale + lo apartado en inversión/colchón`) desde el mes en que empiezas a contar, y pasan al año siguiente. Las deudas llevan lo prestado, lo devuelto y lo pendiente. Todo se guarda en la pestaña Config de la hoja, así móvil y PC van sincronizados.
- **🗓️ Suscripciones de verdad**: mensuales, trimestrales, semestrales, anuales o **cada N meses** (también "cada 9"), con su **día** y el **mes** de un cobro, y en la categoría que quieras (el seguro del coche va a *Coche*). Las **compartidas** cuentan solo **tu parte** (precio ÷ personas). Las cuentas **repartidas por meses** (una anual de 120 € = 10 €/mes) o **en el mes del cobro** (120 € de golpe), como prefieras. Una tarjeta de *Próximos cobros* te dice lo que viene.
- **🚦 Presupuestos**: pones un límite mensual por categoría (Piloto) y cada categoría muestra su barrita; te avisa justo al pasar del **80 %** y otra vez al pasar del **100 %** (una sola vez, no en cada gasto).
- **📈 Gráficos**: reparto del gasto por categoría (rosco) y 12 meses de ganado frente a gastado con la línea de lo que queda. SVG puro, sin librerías.
- **🎯 Metas de ahorro**: "500 € para el viaje" con barra de progreso, lo que falta y cuánto apartar al mes hasta la fecha elegida.
- **🔒 Candado y copia de seguridad**: PIN opcional (4–8 cifras, guardado solo como hash SHA-256 con sal) al abrir y tras un minuto fuera: aleja a los curiosos, pero los datos del navegador no están cifrados. **Descarga de copia** (JSON) y **restauración** que solo añade lo que falta.
- **👋 Asistente de bienvenida y tour**: la primera vez, 4 pantallas cortas (cuánto cobras → qué categorías usas → dónde guardar los datos → listo, enseñándote lo que te queda este mes), con *Saltar* siempre a mano y un camino de *importar mi Excel*. Después, un tour que resalta la pantalla real (pasos distintos para el Modo avanzado y la Vista simplificada). Y una lista *Empieza aquí* que se marca sola según tus datos. No hace falta Google Sheets para empezar.
- **👁️ Ocultar importes**: un ojo difumina todos los importes (también el aviso al guardar) y se acuerda de tu elección.
- **📅 Resumen del Año: hasta hoy / año completo**: por defecto solo cuenta hasta el mes actual; con *Año completo* ves además la previsión de los meses que faltan.
- **💼 Cartera**: tus posiciones (cripto, acciones, ETF, otros) con cantidad y precio medio de compra → valor actual, ganancia o pérdida en € y %, variación de 24 h y reparto. Cripto con precio en directo (CoinGecko, sin clave); acciones y ETF de EE. UU. en directo con una clave gratuita opcional de Finnhub (pasado a euros con Frankfurter), o con el precio a mano. Guarda los últimos precios para verlos sin conexión. Datos informativos, pueden llevar retraso: no es asesoramiento financiero.
- **📥 Importar tu Excel completo**: una sola importación lee *Gastos*, *Extras* (con horas), *Deudas*, *Ahorros* y el *Piloto Automático* (categorías tal cual, sueldo, fijos, suscripciones, tipos de extra). Repetirla no duplica nada.
- **Escáner más barato y más listo**: Gemini responde con el *número* de categoría y claves cortas, sin "pensar" en 2.5 Flash, con un prompt sin emojis y con ejemplos de uso por categoría (aceite de motor ≠ aceite de cocina, un ratón es periférico); la foto se envía a 1280 px.
- **Modo Excel (opcional)**: el backend puede escribir directamente en una copia en Google Sheets de la plantilla de Excel (detecta las pestañas `📝 Gastos` y `⚙️ Piloto Automático`) sin tocar sus fórmulas.
- **Tus habituales**: botones de 1 toque con tus conceptos más repetidos (con su último importe como referencia).
- **📷 Escanear ticket**: foto → *Rayos X* con el total por categoría y la lista de artículos (toca la categoría de cualquiera para cambiarla). Guardas con:
  - **✂️ Dividir por categorías**: una fila por categoría (la última absorbe el redondeo: la suma es exactamente el total), con el detalle en la columna `Detalle_Items`.
  - **📎 Una sola fila con detalle**: el total en una fila y el desglose completo guardado dentro.
  - Si los artículos no suman el total del ticket, añade una línea de **ajuste** (descuentos/redondeo) y te lo avisa.
- **🧾 Historial**: buscador que mira concepto, categoría, comercio **y los artículos de dentro de los tickets** ("queso", "figurita"). Tocar un gasto de ticket abre el ticket desglosado.
- **📊 Resumen**: cifras del mes y barra por categoría (con presupuesto si pones uno en `Config`).
- **⚙️ Ajustes**: conexión, Gemini, importar/exportar Excel (la exportación trae primero las 5 columnas de tu Excel), diccionario.

## La hoja de Google (modelo de datos)

| Pestaña | Columnas / contenido |
|---|---|
| `Gastos` | Fecha · Categoría · Importe · Tipo (`Gasto`/`Devolución 🔄`) · Detalle · Comercio · **Detalle_Items** (JSON del desglose) · TicketID · Origen · ID · Creado |
| `Extras` | Fecha · Tipo de extra · Importe · Detalle · ID · Creado |
| `Config` | `categorias`, `sueldo` (serie *desde mes → importe*), `fijos`, `suscripciones`, `tiposExtra`, `ahorro` … (JSON editable) |
| `Diccionario` | palabra → categoría · veces · origen (`historial` / `app` / `semilla`) |

Puedes editar la hoja a mano (las filas sin ID reciben uno solas). El sueldo y los fijos **se heredan hacia delante** como en el Excel: una entrada `{"desde":"2026-10","importe":1500}` vale hasta que pongas otra posterior.

## Seguridad y privacidad (léelo)

- La URL de Apps Script es pública, pero **toda operación exige el token** (secreto). Si se filtra: menú *💰 Finanzas App → Regenerar el token*.
- La **API key de Gemini y el token se guardan solo en el navegador** del dispositivo. La foto va **directamente a Google** (Gemini), comprimida; no pasa por ningún servidor tuyo ni mío. Limita la clave en Google AI Studio si puedes.
- El contenido de los tickets se trata como **datos, no como instrucciones** (el prompt lo indica) y todo lo que viene de la hoja o de la IA se **escapa** antes de pintarse (probado con cargas maliciosas).
- Es una app personal pensada para **una sola persona/hoja**; no hay usuarios ni permisos.

## Qué se ha probado y qué NO

Probado automáticamente (`npm test`, 37 pruebas) y en un navegador de escritorio emulando un móvil, contra un servidor local que ejecuta el `Code.gs` real:
alta/edición/borrado, idempotencia de reintentos, cola sin conexión y reenvío, arranque sin red, autocompletado y aprendizaje, ticket dividido y en una fila (suma exacta), búsqueda dentro de tickets, importación del Excel real (sin duplicar al repetir), exportación, errores de Gemini (clave mala, límite, respuesta inválida), escape de HTML, y que el cálculo de *cuánto me queda* coincide con el Excel.

**No probado todavía** (hay que verlo en tu móvil y con tus cuentas):
- El despliegue real en **Google Apps Script** (permisos, CORS desde otro dominio, redirecciones de `script.google.com`).
- **Gemini real con fotos de tickets reales**: la precisión de la lectura depende de la foto. Solo se comprobó que la petición llega a Google con el formato correcto; el servidor de pruebas simula la respuesta.
- Instalación en **iPhone/Android** y comportamiento de la cámara en cada navegador.
- Rendimiento con miles de filas.

## Desarrollo

```bash
npm test                 # pruebas (backend con hoja simulada + núcleo)
npm run dev              # http://127.0.0.1:8777 con hoja y Gemini simulados (token en la consola)
```
`app/core.js` no toca el DOM: toda la lógica de negocio (cálculo del mes, diccionario, tickets, búsqueda) está ahí y es la que prueban los tests.

## Licencia
MIT ([LICENSE](LICENSE)). Incluye [SheetJS](https://sheetjs.com) (Apache-2.0) en `app/vendor/`.
