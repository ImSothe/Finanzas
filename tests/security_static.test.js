'use strict';
/* Guardias estáticas: si alguien (yo incluido) quita una protección sin querer, estos tests fallan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('app/index.html');
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const dir = (name) => ((csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) || '').slice(name.length + 1).split(/\s+/).filter(Boolean));
const appJs = fs.readdirSync(path.join(ROOT, 'app')).filter((f) => f.endsWith('.js'));

test('CSP: sin scripts en línea ni eval, nada abierto por defecto y destinos de red cerrados a los esperados', () => {
  assert.ok(csp, 'falta la meta Content-Security-Policy');
  assert.deepEqual(dir('default-src'), ["'none'"]);
  assert.deepEqual(dir('script-src'), ["'self'"]);                                 // sin 'unsafe-inline' ni 'unsafe-eval' para scripts
  assert.deepEqual(dir('object-src'), ["'none'"]); assert.deepEqual(dir('base-uri'), ["'none'"]); assert.deepEqual(dir('form-action'), ["'none'"]);
  assert.deepEqual(dir('worker-src'), ["'self'"]); assert.deepEqual(dir('manifest-src'), ["'self'"]);
  const conn = dir('connect-src');
  assert.ok(conn.length >= 2 && conn[0] === "'self'");
  for (const c of conn.slice(1)) {
    assert.match(c, /^https:\/\//, 'connect-src solo por https: ' + c);
    assert.ok(!/^https:\/\/\*\.?$/.test(c) && c !== 'https:' && c !== '*', 'comodín demasiado amplio: ' + c);
  }
  for (const permitido of ['script.google.com', 'generativelanguage.googleapis.com', 'api.coingecko.com', 'finnhub.io', 'api.frankfurter.dev']) assert.ok(conn.some((c) => c.includes(permitido)), permitido);
  assert.ok(!/frame-ancestors/.test(csp), 'frame-ancestors no funciona en una meta: la defensa es boot.js');
});

test('HTML: ningún script en línea, ningún on*= ni javascript: (lo exige la CSP) y referrer cerrado', () => {
  assert.deepEqual([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((m) => m[0]), [], 'hay <script> en línea');
  assert.deepEqual([...html.matchAll(/\son[a-z]+\s*=/gi)].map((m) => m[0]), [], 'hay atributos de evento en línea');
  assert.ok(!/javascript:/i.test(html));
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.ok(!/user-scalable\s*=\s*no/i.test(html), 'bloquear el zoom perjudica la accesibilidad');
  assert.match(html, /<script src="boot\.js"><\/script>/);
});

test('boot.js: anti-clickjacking y PIN/privacidad antes de dibujar nada', () => {
  const b = read('app/boot.js');
  assert.match(b, /window\.top !== window\.self/); assert.match(b, /ff\.pin/); assert.match(b, /ff\.priv/);
});

test('todos los scripts de index.html existen y están en la caché del service worker (funciona sin conexión)', () => {
  const sw = read('app/sw.js');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 7, scripts.join(","));
  for (const s of scripts) { assert.ok(fs.existsSync(path.join(ROOT, 'app', s)), s); assert.ok(sw.includes(`'./${s}'`), 'falta en sw.js: ' + s); }
});

test('el código de la app no usa eval, new Function, document.write, insertAdjacentHTML ni outerHTML', () => {
  for (const f of appJs) {
    const src = read('app/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const mal of [/\beval\s*\(/, /new\s+Function\s*\(/, /document\.write\s*\(/, /insertAdjacentHTML\s*\(/, /\.outerHTML\s*=/, /\bsrcdoc\b/, /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/]) assert.ok(!mal.test(src), `${f}: ${mal}`);
  }
});

test('SheetJS: versión sin las vulnerabilidades conocidas (>= 0.20.2) y con licencia y huella documentadas', () => {
  const lib = read('app/vendor/xlsx.full.min.js');
  const v = (lib.match(/version="(\d+)\.(\d+)\.(\d+)"/g) || []).map((x) => x.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number)).find(([a, b]) => a === 0 && b >= 18);
  assert.ok(v, 'no encuentro la versión');
  assert.ok(v[1] > 20 || (v[1] === 20 && v[2] >= 2), `SheetJS demasiado antigua: 0.${v[1]}.${v[2]}`);
  assert.ok(fs.existsSync(path.join(ROOT, 'app/vendor/xlsx.LICENSE.txt')));
  const crypto = require('crypto');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'app/vendor/xlsx.full.min.js'))).digest('hex');
  assert.ok(read('app/vendor/README.txt').includes(sha), 'la huella de README.txt no coincide con el archivo');
});

test('workflows: permisos mínimos declarados y todas las acciones fijadas por huella (40 hex)', () => {
  for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows'))) {
    const y = read('.github/workflows/' + f);
    assert.match(y, /^permissions:/m, `${f}: falta permissions`);
    assert.ok(!/permissions:\s*write-all/.test(y));
    for (const m of y.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${f}: acción sin fijar: ${m[1]}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, '.github/dependabot.yml')));
});

test('backend: permisos mínimos, sin appendRow con texto de fuera y backend/Code.gs idéntico a la plantilla', () => {
  const t = read('backend/Code.gs.template');
  assert.match(t, /@OnlyCurrentDoc/);
  assert.ok(!/appendRow\s*\(/.test(t), 'appendRow no puede dar formato de texto plano antes de escribir');
  assert.match(t, /function plain_\(/); assert.match(t, /function idOk_\(/); assert.match(t, /use-post/);
  assert.equal(read('backend/Code.gs'), t, 'backend/Code.gs no está regenerado (python tools/build_gs.py): el CI probaría un script distinto');
  assert.ok(!/token=|searchParams\.set\(.token/.test(read('app/app.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace("{ token: cfg.token }", '')), 'el token no puede ir en la URL');
});

test('proyecto: sin dependencias de ejecución (superficie de ataque mínima) y sin secretos ni datos personales rastreados', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), []);
  const { execFileSync } = require('child_process');
  let ficheros = [];
  try { ficheros = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { return; }      // sin git (p. ej. un zip): no se comprueba
  for (const f of ficheros) assert.ok(!/(^|\/)(\.env|.*\.pem|.*\.key|seed\/|dist\/|.*\.xlsx$)/i.test(f), 'fichero sensible rastreado: ' + f);
  const patrones = [/AIza[0-9A-Za-z_-]{30,}/, /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /xox[baprs]-[A-Za-z0-9-]{10,}/];
  for (const f of ficheros.filter((x) => !x.startsWith('app/vendor/') && !x.endsWith('.png') && !x.endsWith('.json'))) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const p of patrones) assert.ok(!p.test(s), `posible secreto en ${f}`);
  }
});
