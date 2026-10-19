# Guía paso a paso: conectar la app con tu Google Sheet

Tiempo: unos 10 minutos, **una sola vez**. Después, la app del móvil y la del PC comparten los mismos datos.

Hay **tres sitios distintos** y es fácil confundirlos:

| Sitio | Qué es | Para qué lo usas |
|---|---|---|
| **La hoja de Google** (sheets.new) | Tu hoja de cálculo | Menú **💰 Finanzas App**: sacar el token |
| **Apps Script** (Extensiones → Apps Script) | El editor de código de la hoja | Pegar `Code.gs` e **Implementar** (sacar la URL) |
| **La app** (imsothe.github.io/Finanzas) | La app de gastos | **Ajustes**: pegar la URL y el token |

Vas a **copiar dos cosas de Google** (el *token* y la *URL*) y pegarlas en la app.

## Paso 1 · Crear la hoja
Abre **https://sheets.new**. Ponle un nombre (por ejemplo «Finanzas»). Usa tu cuenta personal de Gmail y, si tienes varias cuentas abiertas, mejor una ventana de incógnito con una sola.

## Paso 2 · Pegar el código
1. En la hoja: **Extensiones → Apps Script** (se abre otra pestaña).
2. Borra el código que haya y pega el contenido de `Code.gs` (el genérico está en `backend/Code.gs`).
3. Pulsa el disquete **Guardar** (Ctrl+S).

## Paso 3 · Sacar el TOKEN (en la hoja, no en la app)
1. Vuelve a la pestaña de la hoja y **recárgala** (F5). Tras unos segundos aparece un menú nuevo al final de la barra: **💰 Finanzas App**.
2. Menú **💰 Finanzas App → 1. Configurar (crear pestañas y token)**.
3. Google pide permisos. Si dice *«Google no ha verificado esta aplicación»*: **Configuración avanzada → Ir a … (no seguro) → Permitir**. Es tu propio script.
4. Sale una ventana «Listo ✅» con el **token** (una cadena larga). **Cópialo** y guárdalo en un bloc de notas. Si lo pierdes: menú 💰 Finanzas App → *Mostrar el token*.
5. Se crean las pestañas Gastos, Extras, Config y Diccionario.

## Paso 4 · Sacar la URL (en Apps Script)
1. En la pestaña de Apps Script: botón azul **Implementar** (arriba a la derecha) → **Nueva implementación**.
2. Pulsa el engranaje ⚙️ junto a *Seleccionar tipo* → **Aplicación web**.
3. **Ejecutar como: Yo** (tu correo).
4. **Quién tiene acceso: Cualquier usuario.**
   > ⚠️ **No** elijas «Cualquier usuario con cuenta de Google» ni «Solo yo»: con esas opciones el navegador bloquea la app (error CORS) y no conecta.
5. **Implementar** → autoriza los permisos otra vez si los pide.
6. Copia la **URL de la aplicación web**. Tiene que ser así: `https://script.google.com/macros/s/…/exec`.
   Si la perdiste: **Implementar → Administrar implementaciones**.

**Comprobación:** abre esa URL en una **ventana de incógnito**. Debe salir `{"ok":true,"app":"FinanzasApp"}` sin pedirte iniciar sesión.

## Paso 5 · Conectar la app
1. Abre la app → **Ajustes → Conexión con tu hoja de Google**.
2. Pega la **URL** y el **token** (sin espacios al principio ni al final).
3. Pulsa **Probar**. Debe decir **✅ Conectado correctamente**.
4. Pulsa **Sincronizar**.

<img src="img/07-ajustes-conexion.png" width="300" alt="Ajustes: conexión con tu hoja de Google">

## Paso 6 · El móvil
En el PC: **Ajustes → 🔗 Enlace para configurar otro móvil**. Cópialo, mándatelo a ti mismo (no lo compartas: lleva tu token) y ábrelo en el móvil → **Conectar**.
Para instalarla: Android/Chrome ⋮ → *Instalar app*; iPhone/Safari → Compartir → *Añadir a pantalla de inicio*.

## Paso 7 · Traer tu Excel (opcional)
**Ajustes → Importar .xlsx** → elige tu archivo. Te enseña un resumen antes de importar y no duplica si lo repites.

---

## Errores típicos

| Qué ves | Causa y arreglo |
|---|---|
| No encuentro «Configurar» en la app | Está en el **menú de la hoja de Google** (💰 Finanzas App), no en la app. Recarga la hoja con F5 si no sale el menú. |
| «La URL debe ser de Google Apps Script» | Pegaste la URL de la hoja o del editor. Debe empezar por `https://script.google.com/macros/s/` y acabar en `/exec`. |
| «No se pudo implementar» | Cuenta equivocada o de trabajo. Usa una ventana de incógnito con **una sola cuenta personal**, ejecuta `setup` desde el editor, autoriza y repite. |
| «No se pudo conectar» + error **CORS** en la consola (F12) | La implementación no es **Cualquier usuario**. Implementar → Administrar implementaciones → ✏️ → Quién tiene acceso: Cualquier usuario → Versión: Nueva versión → Implementar. |
| «Token incorrecto» | Token mal copiado o con espacios. Menú 💰 Finanzas App → *Mostrar el token*. |
| «No se pudo sincronizar» | Cambios pendientes que no se enviaron o el script devolvió un error. Abre **Empieza aquí → 🩺 Diagnóstico**: dice qué responde tu hoja. |
| Cambié `Code.gs` y no se nota | Hay que volver a implementar: Administrar implementaciones → ✏️ → **Nueva versión**. |
