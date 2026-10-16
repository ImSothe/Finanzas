# Seguridad / Security

Finanzas es una app web sin servidor propio: los datos viven **en tu navegador** y, si lo conectas, **en tu propia hoja de Google** (a través de un script de Apps Script que ejecuta tu cuenta). No hay cuentas, ni base de datos mía, ni nadie con acceso a tus datos salvo tú.

*Finanzas is a serverless web app: your data lives in your browser and, if you connect it, in your own Google Sheet (through an Apps Script that runs under your own account). There is no backend of mine and nobody else has access to your data.*

## Cómo reportar una vulnerabilidad
Abre un aviso privado en la pestaña **Security → Report a vulnerability** del repositorio (si no está disponible, abre un *issue* sin detalles sensibles y te contesto para seguir en privado). Gracias por avisar antes de publicarlo.

## Qué se protege y cómo

| Riesgo | Defensa |
|---|---|
| **XSS** (que un dato como el detalle de un gasto ejecute código) | Todo dato se escapa al dibujarlo; los avisos pasan por un sanitizador que solo deja texto y `<b>`; **política CSP** que prohíbe scripts en línea, `eval` y conexiones a destinos no previstos; sin `eval`, `new Function`, `document.write` ni `insertAdjacentHTML` (lo comprueba un test). Probado con una batería de ataques sobre las 34 pantallas (`tools/xss_fuzz.js`). |
| **Inyección de fórmulas en Google Sheets** (`=IMPORTDATA(...)` colado desde un ticket, un Excel o una copia manipulada) | El script guarda **todo texto externo como texto plano** (formato `@`) antes de escribirlo, valida los ID (`[A-Za-z0-9_-]{1,60}`) y limita tamaños. Probado contra el script anterior (que sí era vulnerable) y el actual. |
| **Token en la URL** (queda en registros e historiales) | Las lecturas van por **POST**; el `GET` solo responde a `ping` con `{ok, app}` y rechaza el resto. Comparación del token en tiempo constante. |
| **Datos manipulados** (hoja editada a mano, copia de seguridad o Excel hostiles) | Esquema estricto de la configuración (tipos, rangos, longitudes, topes de tamaño), nombres como `__proto__`/`constructor` rechazados, diccionarios sin prototipo, importes con tope, límite de tamaño de archivos (15 MB Excel, 25 MB copia). |
| **Desvío de tus datos a un servidor ajeno** | La URL de conexión solo puede ser de Google Apps Script (o local, para pruebas) y el enlace `#c=` siempre pide confirmación; la dirección de Gemini solo puede ser la de Google. La CSP lo refuerza. |
| **Permisos del script** | `@OnlyCurrentDoc`: el script solo toca **esta** hoja, no el resto de tu Drive. |
| **Clickjacking** | `boot.js` oculta la app si alguien la incrusta en otra web (GitHub Pages no permite cabeceras HTTP; `frame-ancestors` no funciona en una meta). |
| **Cadena de suministro** | Sin dependencias de ejecución. SheetJS incluida en `app/vendor/` con versión, origen, huella y licencia documentadas (≥ 0.20.2: corrige CVE-2023-30533 y CVE-2024-22363). Acciones de GitHub **fijadas por huella** + Dependabot; permisos mínimos en los workflows. |
| **PIN** | Opcional. PBKDF2-SHA-256 (210.000 iteraciones) con sal, bloqueo creciente tras 5 fallos que sobrevive a recargas, PIN triviales rechazados. |

## Lo que NO protege (conviene saberlo)
- **El token es la llave de tu hoja.** Quien tenga la URL `/exec` **y** el token puede leer y escribir tus datos. Va guardado en este dispositivo. Si lo pierdes o lo enseñas, usa en tu hoja **💰 Finanzas App → Regenerar el token** (cierra todos los dispositivos conectados).
- **El PIN es una barrera de interfaz, no cifrado.** Los datos del navegador no están cifrados: quien controle el dispositivo desbloqueado y sepa abrir las herramientas del navegador puede leerlos. Usa el bloqueo de pantalla de tu móvil/PC.
- **La clave de Gemini** se guarda en el dispositivo y se envía solo a Google. Restríngela en Google AI Studio / Cloud (por **referente HTTP** a `imsothe.github.io` o a tu dominio, y con un límite de cuota) y cámbiala si sospechas de una fuga.
- **Los tickets que escaneas se envían a Google (Gemini)**; los precios de la Cartera se piden a CoinGecko, Finnhub y Frankfurter (ven tu IP y qué activos sigues, nunca cuánto tienes).
- **No hay límite de intentos de token en el servidor.** El token tiene ~244 bits (dos UUID v4): adivinarlo no es viable; limitar intentos permitiría a un tercero bloquearte.
- **Un script antiguo** (anterior a esta versión) sigue funcionando, pero la app te avisa: el token viaja en la URL y no protege contra fórmulas maliciosas. Pega el nuevo `Code.gs` y vuelve a implementarlo (*Implementar → Administrar implementaciones → Editar → Versión nueva*).

## Comprobaciones automáticas
`npm test` ejecuta, además de las pruebas funcionales: pruebas de seguridad del backend (`tests/security_backend.test.js`, con un simulador de Sheets que detecta cualquier celda que se evaluaría como fórmula), del núcleo (`tests/security_core.test.js`) y guardias estáticas (`tests/security_static.test.js`: CSP, sin código en línea, versión de SheetJS, workflows, sin secretos rastreados…).
