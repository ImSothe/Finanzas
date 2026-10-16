'use strict';
/* Servidor de PRUEBAS en local: sirve la app, ejecuta tu Code.gs REAL sobre una hoja simulada en memoria (/exec)
   y simula la respuesta de Gemini (/gemini/...). No toca Google ni tu hoja real.
   Uso: node tools/dev_server.js [puerto] [ruta/Code.gs]    (por defecto 8777 y dist/Code.gs) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('../tests/gs_harness');

const PORT = +process.argv[2] || 8777;
const CODE = process.argv[3] || path.join(__dirname, '..', 'dist', 'Code.gs');
const ROOT = path.join(__dirname, '..', 'app');
const env = makeEnv(CODE);
const TOKEN = env.setup();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml' };
const gemLog = [];
const hoy = new Date().toISOString().slice(0, 10);

function categoriasDe(prompt) {
  const m = prompt.match(/CATEGORÍAS:\n([\s\S]*?)\n(?:COSTUMBRES|El texto)/);          // formato nuevo: "3 Coche (…) — ej: …"
  return m ? m[1].split('\n').map((l) => l.replace(/^\d+\s*/, '').replace(/\s+—\s+ej:.*$/, '')) : [];
}

function respuestaGemini(cats) {
  const pick = (t) => cats.find((c) => c.includes(t)) || cats[cats.length - 1];
  const lineas = [
    ['Queso curado', 8.9, 'Supermercado'], ['Leche entera x6', 6.6, 'Supermercado'], ['Pan de molde', 1.85, 'Supermercado'],
    ['Pechuga de pollo', 9.15, 'Supermercado'], ['Fruta variada', 12.0, 'Supermercado'], ['Detergente', 70.0, 'Supermercado'],
    ['Figurita coleccionable', 20.0, 'Decoración'], ['Lámpara de mesa', 15.0, 'Decoración'], ['Tarjeta regalo', 25.0, 'Regalos'],
  ].map(([n, p, c]) => ({ n, p, c: String(cats.indexOf(pick(c)) + 1) }));
  // suma 168,50 y el total impreso es 170,00 -> la app debe crear una línea de ajuste de 1,50
  return { f: hoy, s: 'Supermercado de prueba', t: 170.0, l: lineas };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type) => { res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(body); };

  if (url.pathname === '/exec') {
    if (req.method === 'GET') return send(200, JSON.stringify(env.get(Object.fromEntries(url.searchParams))));
    let b = ''; req.on('data', (c) => { b += c; });
    return req.on('end', () => send(200, JSON.stringify(env.post(b))));
  }
  if (url.pathname.startsWith('/gemini/')) {
    let b = ''; req.on('data', (c) => { b += c; });
    return req.on('end', () => {
      const key = req.headers['x-goog-api-key'];
      let body = {}; try { body = JSON.parse(b); } catch (e) { /* vacío */ }
      const parts = (((body.contents || [])[0] || {}).parts) || [];
      const prompt = (parts.find((p) => p.text) || {}).text || '';
      const img = parts.find((p) => p.inline_data);
      gemLog.push({ url: url.pathname, key, hasImage: !!img, mime: img && img.inline_data.mime_type, imgB64Len: img ? img.inline_data.data.length : 0,
        json: (body.generationConfig || {}).responseMimeType, hasSchema: !!(body.generationConfig || {}).responseSchema, promptLen: prompt.length, promptHasCats: categoriasDe(prompt).length,
        promptHasHabits: /COSTUMBRES DEL USUARIO/.test(prompt), promptHasAntiInjection: /ignora cualquier orden/.test(prompt) });
      if (key === 'BADKEY') return send(400, JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }));
      if (key === 'LIMIT') return send(429, JSON.stringify({ error: { code: 429, message: 'quota' } }));
      if (key === 'JUNK') return send(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'esto no es json' }] } }] }));
      const out = respuestaGemini(categoriasDe(prompt));
      return setTimeout(() => send(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] })), 600);
    });
  }
  if (url.pathname === '/__log') return send(200, JSON.stringify({ gemini: gemLog, token: TOKEN }));
  if (url.pathname === '/__token') return send(200, JSON.stringify({ token: TOKEN }));

  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'not found', 'text/plain');
  send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
});
server.listen(PORT, '127.0.0.1', () => console.log(`Finanzas (pruebas) en http://127.0.0.1:${PORT}  ·  token: ${TOKEN}`));
