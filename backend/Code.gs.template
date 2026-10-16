/**
 * Finanzas App · backend en Google Apps Script (Web App) sobre una hoja de Google Sheets.
 *
 * INSTALACIÓN (resumen; la guía completa está en el README):
 *  1. Crea una hoja de cálculo de Google nueva. Menú Extensiones > Apps Script. Borra el código y pega ESTE archivo.
 *  2. Guarda. Recarga la hoja: aparece el menú "💰 Finanzas App". Pulsa "1. Configurar (crear pestañas y token)".
 *     Acepta los permisos (la primera vez Google avisa de "app no verificada": Configuración avanzada > Ir a ...).
 *  3. Implementar > Nueva implementación > Tipo: Aplicación web.
 *     Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier usuario.   Copia la URL que termina en /exec.
 *  4. En la app, Ajustes: pega la URL y el TOKEN que te enseñó el paso 2.
 *
 * SEGURIDAD: la URL es pública, pero TODAS las operaciones exigen el token (secreto). No lo compartas.
 * Si cambias este código, hay que volver a implementar: Implementar > Administrar implementaciones > Editar > Versión nueva.
 */

var APP_VERSION = 1;
var TZ_DEFAULT = 'Europe/Madrid';
var SH = { gastos: 'Gastos', extras: 'Extras', config: 'Config', dic: 'Diccionario' };
var HEAD_GASTOS = ['Fecha', 'Categoría', 'Importe', 'Tipo', 'Detalle', 'Comercio', 'Detalle_Items', 'TicketID', 'Origen', 'ID', 'Creado'];
var HEAD_EXTRAS = ['Fecha', 'Tipo de extra', 'Importe', 'Detalle', 'ID', 'Creado'];
var TIPOS = ['Gasto', 'Devolución 🔄'];

/* Datos de arranque (categorías, sueldo, fijos, diccionario). Se rellenan al ejecutar "Configurar" solo si las pestañas están vacías. */
var SEED = /*SEED*/{"year0":2026,"config":{"categorias":[],"sueldo":[],"fijos":{},"suscripciones":[],"tiposExtra":[],"ahorro":{"inicial":null,"desde":null},"moneda":"€"},"diccionario":[]}/*END*/;

/* ------------------------------------------------------------------ menú y configuración */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 Finanzas App')
    .addItem('1. Configurar (crear pestañas y token)', 'setup')
    .addItem('Mostrar el token', 'showToken')
    .addItem('Regenerar el token (cierra las apps conectadas)', 'regenToken')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getSpreadsheetTimeZone() !== TZ_DEFAULT) ss.setSpreadsheetTimeZone(TZ_DEFAULT);
  if (excelMode_()) return setupExcelMode_();
  ensureSheet_(ss, SH.gastos, HEAD_GASTOS, { 0: 'dd/mm/yyyy', 2: '#,##0.00' }, [100, 260, 90, 100, 320, 160, 260, 120, 90, 110, 150]);
  ensureSheet_(ss, SH.extras, HEAD_EXTRAS, { 0: 'dd/mm/yyyy', 2: '#,##0.00' }, [100, 220, 90, 320, 110, 150]);
  var cfg = ensureSheet_(ss, SH.config, ['Clave', 'Valor (JSON)'], {}, [160, 700]);
  var dic = ensureSheet_(ss, SH.dic, ['Clave', 'Categoría', 'Veces', 'Origen'], {}, [200, 320, 70, 100]);
  if (cfg.getLastRow() < 2) {
    var rows = Object.keys(SEED.config).map(function (k) { return [k, JSON.stringify(SEED.config[k])]; });
    cfg.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  if (dic.getLastRow() < 2 && SEED.diccionario.length) {
    var d = SEED.diccionario.map(function (e) { return [e.k, e.c, e.n || 0, e.s || 'semilla']; });
    dic.getRange(2, 1, d.length, 4).setValues(d);
  }
  var token = getToken_(true);
  bump_();
  showMsg_('Listo ✅\n\nTu TOKEN (cópialo en Ajustes de la app):\n\n' + token +
    '\n\nSiguiente paso: Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario) y copia la URL /exec.');
  return token;
}

function showToken() { showMsg_('Tu token:\n\n' + getToken_(true)); }

function regenToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  showMsg_('Token nuevo:\n\n' + getToken_(true) + '\n\nPégalo de nuevo en Ajustes de cada dispositivo.');
}

function showMsg_(text) {
  try { SpreadsheetApp.getUi().alert(text); } catch (e) { Logger.log(text); }
}

function ensureSheet_(ss, name, header, formats, widths) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  Object.keys(formats || {}).forEach(function (c) { sh.getRange(2, +c + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(formats[c]); });
  (widths || []).forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  return sh;
}

function getToken_(create) {
  var p = PropertiesService.getScriptProperties();
  var t = p.getProperty('TOKEN');
  if (!t && create) {
    t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    p.setProperty('TOKEN', t);
  }
  return t;
}

/* ------------------------------------------------------------------ utilidades */
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || TZ_DEFAULT; }

function bump_() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('REV', String((parseInt(p.getProperty('REV'), 10) || 0) + 1));
}

function rev_() {
  if (excelMode_()) return xlRev_();
  var ss = SpreadsheetApp.getActive();
  var g = ss.getSheetByName(SH.gastos), x = ss.getSheetByName(SH.extras);
  var base = PropertiesService.getScriptProperties().getProperty('REV') || '0';
  return base + ':' + (g ? g.getLastRow() : 0) + ':' + (x ? x.getLastRow() : 0);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(msg, code) { return json_({ ok: false, error: msg, code: code || 'error' }); }

function dateOut_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);       // dd/mm/aaaa escrito a mano en la hoja
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function dateIn_(s) { return Utilities.parseDate(s, tz_(), 'yyyy-MM-dd'); }

function str_(v, max) { return String(v == null ? '' : v).slice(0, max || 500); }

function num_(v) {
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* ------------------------------------------------------------------ lectura */
function readGastos_() {
  if (excelMode_()) return xlReadGastos_();
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.gastos);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD_GASTOS.length).getValues();
  var needIds = false, out = [];
  vals.forEach(function (r, i) {
    var imp = num_(r[2]);
    if (!r[1] && imp === null && !r[4]) return;                     // fila vacía
    if (!r[9]) { r[9] = 'h' + Utilities.getUuid().slice(0, 12); needIds = true; sh.getRange(i + 2, 10).setValue(r[9]); }
    out.push({ id: String(r[9]), fecha: dateOut_(r[0]), categoria: String(r[1] || ''), importe: imp || 0,
      tipo: String(r[3] || '') === TIPOS[1] ? TIPOS[1] : TIPOS[0], detalle: String(r[4] || ''), comercio: String(r[5] || ''),
      items: String(r[6] || ''), ticketId: String(r[7] || ''), origen: String(r[8] || 'hoja') });
  });
  return out;
}

function readExtras_() {
  if (excelMode_()) return xlReadExtras_();
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.extras);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD_EXTRAS.length).getValues();
  var out = [];
  vals.forEach(function (r, i) {
    var imp = num_(r[2]);
    if (imp === null) return;
    if (!r[4]) { r[4] = 'h' + Utilities.getUuid().slice(0, 12); sh.getRange(i + 2, 5).setValue(r[4]); }
    out.push({ id: String(r[4]), fecha: dateOut_(r[0]), tipo: String(r[1] || ''), importe: imp, detalle: String(r[3] || '') });
  });
  return out;
}

function readConfig_() {
  if (excelMode_()) return xlReadConfig_();
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.config);
  var cfg = {};
  if (!sh || sh.getLastRow() < 2) return cfg;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (!r[0]) return;
    try { cfg[String(r[0])] = JSON.parse(String(r[1])); } catch (e) { cfg[String(r[0])] = r[1]; }
  });
  return cfg;
}

function readDic_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.dic);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(function (r) { return r[0]; })
    .map(function (r) { return { k: String(r[0]), c: String(r[1]), n: +r[2] || 0, s: String(r[3] || 'app') }; });
}

/* ------------------------------------------------------------------ MODO EXCEL
   Si la hoja es tu Excel subido a Google Sheets (pestañas "📝 Gastos", "🚀 Extras" y "⚙️ Piloto Automático"), la app
   lee y escribe DIRECTAMENTE en esas pestañas, con el mismo diseño de tu Excel: lo que anotas en el móvil sale en la hoja
   y lo que escribes a mano en la hoja lo ve la app. Las cifras de sueldo, fijos y suscripciones se leen del Piloto. */
var XL = { gastos: '📝 Gastos', extras: '🚀 Extras', piloto: '⚙️ Piloto Automático', first: 10 };

function excelMode_() {
  var ss = SpreadsheetApp.getActive();
  return !!(ss.getSheetByName(XL.gastos) && ss.getSheetByName(XL.piloto));
}

function xlSheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

function xlRows_(sh) { return Math.max(sh.getMaxRows() - (XL.first - 1), 0); }

function todayIso_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function isEmptyCell_(v) { return v === '' || v === null || v === undefined; }

/* Gastos: B fecha · C categoría · D importe · E tipo · F detalle · (G mes, H impacto = fórmulas) · J comercio · K items · L ticketId · M origen · N id */
function xlReadGastos_() {
  var sh = xlSheet_(XL.gastos), n = xlRows_(sh);
  if (n < 1) return [];
  var vals = sh.getRange(XL.first, 2, n, 13).getValues();            // columnas B..N
  var out = [];
  vals.forEach(function (r, i) {
    var imp = num_(r[2]);
    if (imp === null || imp <= 0) return;                            // fila sin importe = vacía
    var row = XL.first + i;
    var fecha = dateOut_(r[0]);
    if (!fecha) { fecha = todayIso_(); sh.getRange(row, 2).setValue(dateIn_(fecha)); }   // sin fecha: se fija hoy
    var id = String(r[12] || '');
    if (!id) { id = 'h' + Utilities.getUuid().slice(0, 12); sh.getRange(row, 14).setValue(id); }
    out.push({ id: id, fecha: fecha, categoria: String(r[1] || ''), importe: imp,
      tipo: String(r[3] || '') === TIPOS[1] ? TIPOS[1] : TIPOS[0], detalle: String(r[4] || ''), comercio: String(r[8] || ''),
      items: String(r[9] || ''), ticketId: String(r[10] || ''), origen: String(r[11] || 'hoja') });
  });
  return out;
}

/* Extras: B fecha · C tipo · D horas · E €/h · F pago fijo · G total (fórmula) · H detalle · I mes (fórmula) · K id */
function xlReadExtras_() {
  var sh = xlSheet_(XL.extras);
  if (!sh) return [];
  var n = xlRows_(sh);
  if (n < 1) return [];
  var vals = sh.getRange(XL.first, 2, n, 10).getValues();            // columnas B..K
  var out = [];
  vals.forEach(function (r, i) {
    var imp = num_(r[5]);                                            // G = total calculado (horas × precio + pago fijo)
    if (imp === null || imp === 0) return;
    var row = XL.first + i;
    var fecha = dateOut_(r[0]);
    if (!fecha) { fecha = todayIso_(); sh.getRange(row, 2).setValue(dateIn_(fecha)); }
    var id = String(r[9] || '');
    if (!id) { id = 'h' + Utilities.getUuid().slice(0, 12); sh.getRange(row, 11).setValue(id); }
    out.push({ id: id, fecha: fecha, tipo: String(r[1] || ''), importe: imp, detalle: String(r[6] || '') });
  });
  return out;
}

/* Configuración: se LEE de tu pestaña Piloto (valores ya calculados: la herencia mes a mes la hace la propia hoja). */
var XL_EXTRA_KEYS = ['deudas', 'ahorros', 'tarifaHora'];

function xlReadConfig_() {
  var sh = xlSheet_(XL.piloto);
  var maxR = Math.min(sh.getMaxRows(), 100), maxC = Math.min(sh.getMaxColumns(), 99);
  var v = sh.getRange(1, 1, maxR, maxC).getValues();
  var lab = function (r) { return String(v[r][1] || ''); };
  var find = function (test, from) { for (var r = from || 0; r < v.length; r++) if (test(lab(r))) return r; return -1; };

  var yearRow = find(function (t) { return t.indexOf('Primer año') === 0; });
  var year0 = yearRow >= 0 ? parseInt(v[yearRow][2], 10) : new Date().getFullYear();
  var hdr = find(function (t) { return t.indexOf('Concepto') === 0; });
  var totRow = find(function (t) { return t.indexOf('TOTAL GASTOS FIJOS') === 0; });
  if (hdr < 0 || totRow < 0) throw new Error('No encuentro la estructura de la pestaña Piloto Automático');
  var sueldoRow = hdr + 1;
  var nMonths = maxC - 3;
  var mk = function (m) { return (year0 + Math.floor(m / 12)) + '-' + ('0' + (m % 12 + 1)).slice(-2); };

  var serie = function (row) {                                       // [{desde, importe}] solo donde cambia el valor
    var out = [], prev = 0;
    for (var m = 0; m < nMonths; m++) {
      var x = num_(v[row][3 + m]) || 0;
      if (x !== prev) { out.push({ desde: mk(m), importe: x }); prev = x; }
    }
    return out;
  };

  var categorias = [], fijos = {};
  for (var r = sueldoRow + 1; r < totRow; r++) {
    var name = lab(r);
    if (!name) continue;
    categorias.push({ nombre: name, presupuesto: null });
    if (!/suscripci/i.test(name)) { var s = serie(r); if (s.length) fijos[name] = s; }
  }
  var subsHdr = find(function (t) { return t === 'Nombre'; }, totRow);
  var subs = [];
  if (subsHdr >= 0) {
    for (var q = subsHdr + 1; q <= subsHdr + 20 && q < v.length; q++) {
      if (!v[q][1]) continue;
      subs.push({ nombre: String(v[q][1]), importe: num_(v[q][2]) || 0, activa: String(v[q][4] || '') !== 'No' });
    }
  }
  var extHdr = find(function (t) { return t.indexOf('Nombre (') === 0; }, totRow);
  var tipos = [];
  if (extHdr >= 0) for (var t = extHdr + 1; t <= extHdr + 6 && t < v.length; t++) if (v[t][1]) tipos.push(String(v[t][1]));
  var out = { categorias: categorias, sueldo: serie(sueldoRow), fijos: fijos, suscripciones: subs, tiposExtra: tipos, moneda: '€', fuente: 'excel' };
  var extra = SpreadsheetApp.getActive().getSheetByName(SH.config);       // lo que la app guarda además de tu Piloto: deudas, ahorros, tarifa por hora
  if (extra && extra.getLastRow() > 1) {
    extra.getRange(2, 1, extra.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (XL_EXTRA_KEYS.indexOf(String(r[0])) < 0) return;
      try { out[String(r[0])] = JSON.parse(String(r[1])); } catch (e) { /* valor ilegible: se ignora */ }
    });
  }
  return out;
}

/* Huella para saber si algo cambió (el contador de la app consulta esto cada 30 s). */
function xlRev_() {
  var base = PropertiesService.getScriptProperties().getProperty('REV') || '0';
  var g = xlSheet_(XL.gastos), x = xlSheet_(XL.extras), cnt = 0, sum = 0, xs = 0;
  var n = xlRows_(g);
  if (n > 0) g.getRange(XL.first, 4, n, 1).getValues().forEach(function (r) { var a = num_(r[0]); if (a !== null && a > 0) { cnt++; sum += a; } });
  if (x) { var m = xlRows_(x); if (m > 0) x.getRange(XL.first, 7, m, 1).getValues().forEach(function (r) { var a = num_(r[0]); if (a !== null) xs += a; }); }
  return base + ':' + cnt + ':' + Math.round(sum * 100) + ':' + Math.round(xs * 100);
}

function xlFreeRows_(sh, firstCol, nCols, extraCol, needed) {
  var n = xlRows_(sh), vals = sh.getRange(XL.first, firstCol, n, nCols).getValues();
  var extra = extraCol ? sh.getRange(XL.first, extraCol, n, 1).getValues() : null;
  var free = [];
  for (var i = 0; i < n && free.length < needed; i++) {
    var empty = vals[i].every(isEmptyCell_) && (!extra || isEmptyCell_(extra[i][0]));
    if (empty) free.push(XL.first + i);
  }
  if (free.length < needed) throw new Error('La pestaña está llena: no quedan filas libres');
  return free;
}

/* agrupa filas consecutivas para escribir por bloques (menos llamadas = más rápido) */
function xlRuns_(rows) {
  var runs = [], cur = null;
  rows.forEach(function (r, i) {
    if (cur && r === cur.rows[cur.rows.length - 1] + 1) { cur.rows.push(r); cur.idx.push(i); }
    else { cur = { rows: [r], idx: [i] }; runs.push(cur); }
  });
  return runs;
}

function xlAddGastos_(rows) {
  var sh = xlSheet_(XL.gastos), seen = {}, n = xlRows_(sh), skipped = 0, now = [];
  sh.getRange(XL.first, 14, n, 1).getValues().forEach(function (r) { if (r[0]) seen[String(r[0])] = true; });
  rows.slice(0, 500).forEach(function (r) {
    var imp = num_(r.importe), f = /^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha)) ? String(r.fecha) : null, id = str_(r.id, 60);
    if (imp === null || imp < 0 || !f || !id) throw new Error('Fila inválida (fecha/importe/id)');
    if (seen[id]) { skipped++; return; }
    seen[id] = true;
    now.push({ b: [dateIn_(f), str_(r.categoria, 120), imp, r.tipo === TIPOS[1] ? TIPOS[1] : TIPOS[0], str_(r.detalle, 1000)],
      j: [str_(r.comercio, 200), str_(r.items, 45000), str_(r.ticketId, 60), str_(r.origen || 'app', 20), id] });
  });
  if (now.length) {
    var free = xlFreeRows_(sh, 2, 5, 14, now.length);                // B..F vacías y sin id en N
    xlRuns_(free).forEach(function (run) {
      sh.getRange(run.rows[0], 2, run.rows.length, 5).setValues(run.idx.map(function (i) { return now[i].b; }));
      sh.getRange(run.rows[0], 10, run.rows.length, 5).setValues(run.idx.map(function (i) { return now[i].j; }));
    });
  }
  return { added: now.length, skipped: skipped };
}

function xlAddExtras_(rows) {
  var sh = xlSheet_(XL.extras), seen = {}, n = xlRows_(sh), skipped = 0, now = [];
  sh.getRange(XL.first, 11, n, 1).getValues().forEach(function (r) { if (r[0]) seen[String(r[0])] = true; });
  rows.slice(0, 200).forEach(function (r) {
    var imp = num_(r.importe), f = /^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha)) ? String(r.fecha) : null, id = str_(r.id, 60);
    if (imp === null || imp < 0 || !f || !id) throw new Error('Fila inválida (fecha/importe/id)');
    if (seen[id]) { skipped++; return; }
    seen[id] = true;
    now.push({ b: [dateIn_(f), str_(r.tipo, 120), '', '', imp], h: [str_(r.detalle, 1000)], k: [id] });
  });
  if (now.length) {
    var free = xlFreeRows_(sh, 2, 5, 11, now.length);                // B..F vacías y sin id en K
    xlRuns_(free).forEach(function (run) {
      sh.getRange(run.rows[0], 2, run.rows.length, 5).setValues(run.idx.map(function (i) { return now[i].b; }));
      sh.getRange(run.rows[0], 8, run.rows.length, 1).setValues(run.idx.map(function (i) { return now[i].h; }));
      sh.getRange(run.rows[0], 11, run.rows.length, 1).setValues(run.idx.map(function (i) { return now[i].k; }));
    });
  }
  return { added: now.length, skipped: skipped };
}

function xlFindRow_(sh, col, id) {
  if (!id) return -1;
  var n = xlRows_(sh);
  if (n < 1) return -1;
  var vals = sh.getRange(XL.first, col, n, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(id)) return XL.first + i;
  return -1;
}

function xlUpdateGasto_(id, f) {
  var sh = xlSheet_(XL.gastos), row = xlFindRow_(sh, 14, id);
  if (row < 0) throw new Error('No existe ese gasto');
  var map = { fecha: 2, categoria: 3, importe: 4, tipo: 5, detalle: 6, comercio: 10, items: 11 };
  Object.keys(f).forEach(function (k) {
    if (!map[k]) return;
    var val = f[k];
    if (k === 'fecha') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(val))) throw new Error('Fecha inválida'); val = dateIn_(String(val)); }
    else if (k === 'importe') { val = num_(val); if (val === null || val < 0) throw new Error('Importe inválido'); }
    else if (k === 'tipo') val = val === TIPOS[1] ? TIPOS[1] : TIPOS[0];
    else val = str_(val, k === 'items' ? 45000 : 1000);
    sh.getRange(row, map[k]).setValue(val);
  });
  return { updated: 1 };
}

/* Borrar = vaciar las celdas de entrada (no se elimina la fila: así no se rompen las fórmulas de la hoja). */
function xlDelete_(extras, id) {
  var sh = xlSheet_(extras ? XL.extras : XL.gastos), row = xlFindRow_(sh, extras ? 11 : 14, id);
  if (row < 0) return { deleted: 0 };
  var blank = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return [a]; };
  sh.getRange(row, 2, 1, 5).setValues(blank(5));
  if (extras) { sh.getRange(row, 8, 1, 1).setValues(blank(1)); sh.getRange(row, 11, 1, 1).setValues(blank(1)); }
  else sh.getRange(row, 10, 1, 5).setValues(blank(5));
  return { deleted: 1 };
}

function setupExcelMode_() {
  var ss = SpreadsheetApp.getActive();
  var dic = ensureSheet_(ss, SH.dic, ['Clave', 'Categoría', 'Veces', 'Origen'], {}, [200, 320, 70, 100]);
  if (dic.getLastRow() < 2 && SEED.diccionario.length) {
    var d = SEED.diccionario.map(function (e) { return [e.k, e.c, e.n || 0, e.s || 'semilla']; });
    dic.getRange(2, 1, d.length, 4).setValues(d);
  }
  var cfg = xlReadConfig_();
  var token = getToken_(true);
  bump_();
  showMsg_('Listo ✅ (modo Excel: la app usará las pestañas de tu Excel)\n\nCategorías detectadas: ' + cfg.categorias.length +
    '\n\nTu TOKEN (cópialo en Ajustes de la app):\n\n' + token +
    '\n\nSiguiente paso: Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario) y copia la URL /exec.');
  return token;
}

/* ------------------------------------------------------------------ entrada HTTP */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping' || !p.action) {
      return json_({ ok: true, app: 'FinanzasApp', v: APP_VERSION, configured: !!getToken_(false), mode: excelMode_() ? 'excel' : 'hoja' });
    }
    if (!authOk_(p.token)) return fail_('Token incorrecto', 'auth');
    if (p.action === 'rev') return json_({ ok: true, rev: rev_() });
    if (p.action === 'data') {
      return json_({ ok: true, v: APP_VERSION, rev: rev_(), config: readConfig_(), diccionario: readDic_(),
        gastos: readGastos_(), extras: readExtras_() });
    }
    return fail_('Acción desconocida', 'bad-action');
  } catch (err) {
    return fail_(String(err && err.message ? err.message : err), 'exception');
  }
}

function authOk_(t) {
  var real = getToken_(false);
  return !!real && !!t && String(t) === real;
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return fail_('JSON inválido', 'bad-json'); }
  if (!authOk_(body.token)) return fail_('Token incorrecto', 'auth');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return fail_('Servidor ocupado, reintenta', 'busy'); }
  try {
    var res;
    switch (body.action) {
      case 'add': res = addGastos_(body.rows || []); break;
      case 'addExtra': res = addExtras_(body.rows || []); break;
      case 'update': res = updateGasto_(body.id, body.fields || {}); break;
      case 'delete': res = excelMode_() ? xlDelete_(body.sheet === 'extras', body.id) : deleteById_(body.sheet === 'extras' ? SH.extras : SH.gastos, body.sheet === 'extras' ? 5 : 10, body.id); break;
      case 'dictSet': res = dictSet_(body.k, body.c, body.s); break;
      case 'dictDel': res = dictDel_(body.k); break;
      case 'configSet': res = configSet_(body.key, body.value); break;
      default: return fail_('Acción desconocida', 'bad-action');
    }
    bump_();
    res.ok = true;
    res.rev = rev_();
    return json_(res);
  } catch (err) {
    return fail_(String(err && err.message ? err.message : err), 'exception');
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ escritura */
function existingIds_(sh, col) {
  if (!sh || sh.getLastRow() < 2) return {};
  var o = {};
  sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) o[String(r[0])] = true; });
  return o;
}

function addGastos_(rows) {
  if (excelMode_()) return xlAddGastos_(rows);
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.gastos);
  var seen = existingIds_(sh, 10), out = [], skipped = 0, now = new Date();
  rows.slice(0, 500).forEach(function (r) {
    var imp = num_(r.importe), f = /^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha)) ? String(r.fecha) : null;
    var id = str_(r.id, 60);
    if (imp === null || imp < 0 || !f || !id) throw new Error('Fila inválida (fecha/importe/id)');
    if (seen[id]) { skipped++; return; }                              // reintento de la cola offline: no duplicar
    seen[id] = true;
    out.push([dateIn_(f), str_(r.categoria, 120), imp, r.tipo === TIPOS[1] ? TIPOS[1] : TIPOS[0], str_(r.detalle, 1000),
      str_(r.comercio, 200), str_(r.items, 45000), str_(r.ticketId, 60), str_(r.origen || 'app', 20), id, now]);
  });
  if (out.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, out.length, HEAD_GASTOS.length).setValues(out);
    sh.getRange(start, 1, out.length, 1).setNumberFormat('dd/mm/yyyy');
    sh.getRange(start, 3, out.length, 1).setNumberFormat('#,##0.00');
  }
  return { added: out.length, skipped: skipped };
}

function addExtras_(rows) {
  if (excelMode_()) return xlAddExtras_(rows);
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.extras);
  var seen = existingIds_(sh, 5), out = [], skipped = 0, now = new Date();
  rows.slice(0, 200).forEach(function (r) {
    var imp = num_(r.importe), f = /^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha)) ? String(r.fecha) : null;
    var id = str_(r.id, 60);
    if (imp === null || imp < 0 || !f || !id) throw new Error('Fila inválida (fecha/importe/id)');
    if (seen[id]) { skipped++; return; }
    seen[id] = true;
    out.push([dateIn_(f), str_(r.tipo, 120), imp, str_(r.detalle, 1000), id, now]);
  });
  if (out.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, out.length, HEAD_EXTRAS.length).setValues(out);
    sh.getRange(start, 1, out.length, 1).setNumberFormat('dd/mm/yyyy');
  }
  return { added: out.length, skipped: skipped };
}

function findRow_(sh, col, id) {
  if (!sh || sh.getLastRow() < 2 || !id) return -1;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(id)) return i + 2;
  return -1;
}

function updateGasto_(id, f) {
  if (excelMode_()) return xlUpdateGasto_(id, f);
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.gastos);
  var row = findRow_(sh, 10, id);
  if (row < 0) throw new Error('No existe ese gasto');
  var map = { fecha: 1, categoria: 2, importe: 3, tipo: 4, detalle: 5, comercio: 6, items: 7 };
  Object.keys(f).forEach(function (k) {
    if (!map[k]) return;
    var v = f[k];
    if (k === 'fecha') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('Fecha inválida'); v = dateIn_(String(v)); }
    else if (k === 'importe') { v = num_(v); if (v === null || v < 0) throw new Error('Importe inválido'); }
    else if (k === 'tipo') v = v === TIPOS[1] ? TIPOS[1] : TIPOS[0];
    else v = str_(v, k === 'items' ? 45000 : 1000);
    sh.getRange(row, map[k]).setValue(v);
  });
  return { updated: 1 };
}

function deleteById_(sheetName, col, id) {
  var sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  var row = findRow_(sh, col, id);
  if (row < 0) return { deleted: 0 };
  sh.deleteRow(row);
  return { deleted: 1 };
}

function dictSet_(k, c, s) {
  k = str_(k, 120).trim(); c = str_(c, 160);
  if (!k || !c) throw new Error('Clave y categoría obligatorias');
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.dic);
  var row = findRow_(sh, 1, k);
  if (row > 0) {
    var cur = sh.getRange(row, 3).getValue();
    sh.getRange(row, 2, 1, 3).setValues([[c, (+cur || 0) + 1, str_(s || 'app', 20)]]);
  } else {
    sh.appendRow([k, c, 1, str_(s || 'app', 20)]);
  }
  return { saved: 1 };
}

function dictDel_(k) { return deleteById_(SH.dic, 1, str_(k, 120)); }

function configSet_(key, value) {
  key = str_(key, 60);
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) throw new Error('Clave de configuración inválida');
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SH.config) || ensureSheet_(ss, SH.config, ['Clave', 'Valor (JSON)'], {}, [160, 700]);
  var row = findRow_(sh, 1, key);
  var txt = JSON.stringify(value);
  if (txt.length > 45000) throw new Error('Configuración demasiado grande para una celda');
  if (row > 0) sh.getRange(row, 2).setValue(txt); else sh.appendRow([key, txt]);
  bump_();
  return { saved: 1 };
}
