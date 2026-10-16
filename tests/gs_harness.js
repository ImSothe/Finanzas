'use strict';
/* Entorno simulado de Google Apps Script: ejecuta el Code.gs REAL en un contexto vm con una hoja de cálculo en memoria. */
const fs = require('fs');
const vm = require('vm');

function makeSheet(name) {
  const sh = { name, grid: [], frozen: 0, fmt: {}, danger: [] };
  /* En Google Sheets un texto que empieza por = + - @ se interpreta como FÓRMULA salvo que la celda tenga formato "texto plano" (@). */
  const marca = (r, c, v) => { if (typeof v === 'string' && /^[=+\-@]/.test(v) && sh.fmt[r + ',' + c] !== '@') sh.danger.push({ r, c, v }); };
  const ensure = (r, c) => {
    while (sh.grid.length < r) sh.grid.push([]);
    for (let i = 0; i < sh.grid.length; i++) while (sh.grid[i].length < c) sh.grid[i].push('');
  };
  sh.getLastRow = () => {
    let last = 0;
    sh.grid.forEach((row, i) => { if (row.some((v) => v !== '' && v != null)) last = i + 1; });
    return last;
  };
  sh.getMaxRows = () => sh.maxRows || Math.max(sh.grid.length, 1000);
  sh.getMaxColumns = () => sh.maxCols || (sh.grid[0] ? sh.grid[0].length : 26);
  sh.setFrozenRows = (n) => { sh.frozen = n; };
  sh.setColumnWidth = () => sh;
  sh.appendRow = (arr) => { const r = sh.getLastRow() + 1; ensure(r, arr.length); arr.forEach((v, i) => { marca(r, i + 1, v); sh.grid[r - 1][i] = v; }); };
  sh.deleteRow = (r) => { sh.grid.splice(r - 1, 1); };
  sh.getRange = (r, c, nr = 1, nc = 1) => {
    const rng = {
      getValues: () => { ensure(r + nr - 1, c + nc - 1); return sh.grid.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc).map((v) => v)); },
      getValue: () => { ensure(r, c); return sh.grid[r - 1][c - 1]; },
      setValues: (vals) => { ensure(r + nr - 1, c + nc - 1); vals.forEach((row, i) => row.forEach((v, j) => { marca(r + i, c + j, v); sh.grid[r - 1 + i][c - 1 + j] = v; })); return rng; },
      setValue: (v) => { ensure(r, c); marca(r, c, v); sh.grid[r - 1][c - 1] = v; return rng; },
      setNumberFormat: (f) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.fmt[(r + i) + ',' + (c + j)] = f; return rng; }, setFontWeight: () => rng, setBackground: () => rng, setFontColor: () => rng,
    };
    return rng;
  };
  return sh;
}

function makeEnv(codePath, opts = {}) {
  const sheets = {};
  const props = {};
  let tz = opts.tz || 'UTC';
  let uuid = 0;
  const ss = {
    getSpreadsheetTimeZone: () => tz,
    setSpreadsheetTimeZone: (z) => { tz = z; },
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
  };
  const pad = (n) => String(n).padStart(2, '0');
  const sandbox = {
    console, JSON, Date, Math, parseInt, parseFloat, isFinite, String, Number, Object, Array, RegExp, Error,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActive: () => ss,
      getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }), alert: (t) => { env.lastAlert = t; } }),
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + (++uuid).toString(16).padStart(8, '0') + '-aaaa-bbbb-cccc-' + String(1000 + uuid).padStart(12, '0'),
      formatDate: (d, _tz, fmt) => (fmt === 'yyyy-MM-dd' ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : d.toISOString()),
      parseDate: (s, _tz, _fmt) => { const [y, m, dd] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }),
    },
  };
  const ctx = vm.createContext(sandbox);
  const env = { ctx, sheets, props, lastAlert: null, ss };
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: codePath });
  env.call = (fn, ...a) => vm.runInContext(`${fn}`, ctx)(...a);
  env.get = (params) => JSON.parse(vm.runInContext('doGet', ctx)({ parameter: params }).getContent());
  env.post = (body) => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  env.read = (action, token) => env.post({ token, action });          // lecturas: por POST, el token nunca va en la URL
  env.setup = () => vm.runInContext('setup', ctx)();
  return env;
}

module.exports = { makeEnv };
