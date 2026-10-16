/* Finanzas App · núcleo (lógica pura, sin DOM). Funciona en el navegador (window.Core) y en Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIPO_GASTO = 'Gasto';
  const TIPO_DEV = 'Devolución 🔄';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  /** minúsculas, sin tildes, solo letras/números/espacios */
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** "2,5" "2.50" "1.234,56" "12 €" -> número, o null */
  function parseAmount(s) {
    if (typeof s === 'number') return isFinite(s) ? r2(s) : null;
    let t = String(s == null ? '' : s).replace(/[€\s]/g, '');
    if (!t) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(',', '.');
    if (!/^-?\d*\.?\d+$/.test(t)) return null;
    const n = parseFloat(t);
    return isFinite(n) ? r2(n) : null;
  }

  const fmtEUR = (n) => (n == null || isNaN(n) ? '–' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n));
  const monthKey = (iso) => String(iso).slice(0, 7);
  const monthLabel = (mk) => `${MESES[parseInt(mk.slice(5, 7), 10) - 1]} ${mk.slice(0, 4)}`;
  function shiftMonth(mk, d) {
    const y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10) - 1 + d;
    const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
    return `${yy}-${String(mm + 1).padStart(2, '0')}`;
  }
  function todayISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** Valor vigente de una serie [{desde:'YYYY-MM', importe}]: el último con desde <= mes (igual que la herencia del Excel). 0 si aún no empieza. */
  function effectiveAt(serie, mk) {
    let best = null;
    (serie || []).forEach((e) => { if (e.desde <= mk && (!best || e.desde >= best.desde)) best = e; });
    return best ? Number(best.importe) || 0 : 0;
  }

  /* ------------------------------------------------------------------ cuánto me queda (misma lógica que el Excel) */
  function computeMonth(data, mk) {
    const cfg = data.config || {};
    const cats = (cfg.categorias || []).map((c) => (typeof c === 'string' ? { nombre: c, presupuesto: null } : c));
    const esSusc = (n) => /suscripci/i.test(n);
    const subsTotal = (cfg.suscripciones || []).filter((s) => s.activa !== false).reduce((a, s) => a + (Number(s.importe) || 0), 0);
    const sueldo = effectiveAt(cfg.sueldo, mk);
    const extras = (data.extras || []).filter((e) => monthKey(e.fecha) === mk).reduce((a, e) => a + (Number(e.importe) || 0), 0);

    const porCat = {};
    cats.forEach((c) => {
      const fijo = esSusc(c.nombre) ? subsTotal : effectiveAt((cfg.fijos || {})[c.nombre], mk);
      porCat[c.nombre] = { cat: c.nombre, fijo: r2(fijo), dia: 0, presupuesto: c.presupuesto == null ? null : Number(c.presupuesto) };
    });
    let sin = 0;
    (data.gastos || []).forEach((g) => {
      if (monthKey(g.fecha) !== mk) return;
      const v = (g.tipo === TIPO_DEV ? -1 : 1) * (Number(g.importe) || 0);
      if (porCat[g.categoria]) porCat[g.categoria].dia += v; else sin += v;
    });
    const filas = Object.values(porCat).map((f) => ({ ...f, dia: r2(f.dia), total: r2(f.fijo + f.dia) }));
    if (Math.abs(sin) > 0.001) filas.push({ cat: 'Sin categoría', fijo: 0, dia: r2(sin), total: r2(sin), presupuesto: null });
    const fijos = r2(filas.reduce((a, f) => a + f.fijo, 0));
    const dia = r2(filas.reduce((a, f) => a + f.dia, 0));
    const sale = r2(fijos + dia);
    const entra = r2(sueldo + extras);
    const queda = r2(entra - sale);
    const totalSale = sale > 0 ? sale : 0;
    filas.forEach((f) => { f.pct = totalSale > 0 ? f.total / totalSale : 0; });
    filas.sort((a, b) => b.total - a.total);
    const semaforo = entra === 0 && sale === 0 ? 'vacio' : queda <= 0 ? 'rojo' : entra > 0 && queda < 0.2 * entra ? 'amarillo' : 'verde';
    return { mk, sueldo: r2(sueldo), extras: r2(extras), entra, fijos, subs: r2(subsTotal), dia, sale, queda, filas, semaforo,
      pctLibre: entra > 0 ? Math.max(0, queda / entra) : 0 };
  }

  /* ------------------------------------------------------------------ diccionario de costumbres y autocompletado */
  const PESO_ORIGEN = { app: 3, historial: 2, semilla: 1 };

  function buildIndex(dict) {
    const map = new Map();
    (dict || []).forEach((e) => {
      const k = norm(e.k);
      if (!k) return;
      const prev = map.get(k);
      if (!prev || (PESO_ORIGEN[e.s] || 0) > (PESO_ORIGEN[prev.s] || 0) || (e.s === prev.s && (e.n || 0) > (prev.n || 0))) map.set(k, { k, c: e.c, n: e.n || 0, s: e.s || 'app' });
    });
    return map;
  }

  /** Predice categoría para un concepto: frase exacta > frase que lo contiene > palabra a palabra. */
  function predictCategory(text, index, categorias) {
    const t = norm(text);
    if (!t) return null;
    const valida = (c) => !categorias || categorias.length === 0 || categorias.includes(c);
    const ex = index.get(t);
    if (ex && valida(ex.c)) return { cat: ex.c, key: ex.k, how: 'exacta', src: ex.s };
    let best = null;
    const consider = (e, how, score) => {
      if (!valida(e.c)) return;
      const total = score * 1000 + (PESO_ORIGEN[e.s] || 0) * 100 + Math.min(e.n || 0, 99);
      if (!best || total > best.total) best = { cat: e.c, key: e.k, how, src: e.s, total };
    };
    const tokens = t.split(' ');
    index.forEach((e) => {
      if (t.startsWith(e.k + ' ') || t.endsWith(' ' + e.k) || t.includes(' ' + e.k + ' ')) consider(e, 'contiene', 2 + e.k.length / 100);
      else if (tokens.includes(e.k)) consider(e, 'palabra', 1 + e.k.length / 100);
    });
    return best ? { cat: best.cat, key: best.key, how: best.how, src: best.src } : null;
  }

  /** Sugerencias al escribir: primero conceptos reales de tu historial, luego claves del diccionario. */
  function suggest(text, gastos, index, limit = 6) {
    const t = norm(text);
    if (t.length < 2) return [];
    const out = [], seen = new Set();
    const hist = new Map();
    (gastos || []).forEach((g) => {
      const d = (g.detalle || '').trim();
      if (!d || d.length > 60) return;
      const k = norm(d);
      const h = hist.get(k) || { text: d, cat: g.categoria, n: 0, last: g.fecha, importe: g.importe };
      h.n += 1;
      if (g.fecha >= h.last) { h.last = g.fecha; h.cat = g.categoria; h.importe = g.importe; h.text = d; }
      hist.set(k, h);
    });
    [...hist.entries()].filter(([k]) => k.startsWith(t) || k.split(' ').some((w) => w.startsWith(t)))
      .sort((a, b) => b[1].n - a[1].n || (a[1].last < b[1].last ? 1 : -1)).forEach(([k, h]) => {
        if (out.length < limit && !seen.has(k)) { seen.add(k); out.push({ text: h.text, cat: h.cat, src: 'historial', importe: h.importe }); }
      });
    [...index.values()].filter((e) => e.k.startsWith(t) || e.k.split(' ').some((w) => w.startsWith(t)))
      .sort((a, b) => (PESO_ORIGEN[b.s] || 0) - (PESO_ORIGEN[a.s] || 0) || b.n - a.n).forEach((e) => {
        if (out.length < limit && !seen.has(e.k)) { seen.add(e.k); out.push({ text: e.k, cat: e.c, src: e.s }); }
      });
    return out;
  }

  /** Quick chips: tus conceptos más repetidos (empate: el más reciente). */
  function topChips(gastos, n = 8) {
    const m = new Map();
    (gastos || []).forEach((g) => {
      const d = (g.detalle || '').trim();
      if (!d || d.length > 40 || g.tipo === TIPO_DEV || g.ticketId) return;
      const k = norm(d);
      if (!k || ['no se', 'nose', 'varios', 'x'].includes(k)) return;
      const c = m.get(k) || { text: d, cat: g.categoria, n: 0, last: '', importe: g.importe };
      c.n += 1;
      if (g.fecha >= c.last) { c.last = g.fecha; c.cat = g.categoria; c.text = d; c.importe = g.importe; }
      m.set(k, c);
    });
    return [...m.values()].sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1)).slice(0, n);
  }

  /* ------------------------------------------------------------------ tickets */
  function matchCategory(name, categorias, fallback) {
    if (!name) return fallback;
    if (categorias.includes(name)) return name;
    const n = norm(name);
    const exact = categorias.find((c) => norm(c) === n);
    if (exact) return exact;
    const part = categorias.find((c) => norm(c).includes(n) || (n.length > 4 && n.includes(norm(c).replace(/^\S+ /, '').split(' ')[0])));
    return part || fallback;
  }

  /** Limpia la respuesta de la IA: categorías válidas, números, y una línea de ajuste para que cuadre el total del ticket. */
  function normalizeTicket(raw, categorias, index, opts = {}) {
    const otros = categorias.find((c) => /otros/i.test(c)) || categorias[categorias.length - 1];
    const lineas = (Array.isArray(raw && raw.lineas) ? raw.lineas : []).map((l) => {
      const nombre = String((l && (l.nombre_articulo || l.nombre)) || '').trim().slice(0, 80) || 'Artículo';
      const precio = parseAmount(l && l.precio);
      let cat = matchCategory(l && l.categoria_sugerida, categorias, null);
      const pred = predictCategory(nombre, index, categorias);
      if (pred && (pred.src === 'historial' || pred.src === 'app') && (pred.how === 'exacta' || pred.how === 'contiene')) cat = pred.cat;  // tus costumbres mandan
      if (!cat && pred) cat = pred.cat;
      return { n: nombre, p: precio == null ? 0 : precio, c: cat || otros };
    }).filter((l) => l.p !== 0 || l.n);
    let total = parseAmount(raw && raw.importe_total);
    const suma = r2(lineas.reduce((a, l) => a + l.p, 0));
    if (total == null || total <= 0) total = suma;
    const diff = r2(total - suma);
    let ajuste = null;
    if (Math.abs(diff) >= 0.01 && lineas.length) {
      const dom = dominantCategory(lineas) || otros;
      ajuste = { n: 'Ajuste / descuentos / redondeo', p: diff, c: dom, ajuste: true };
      lineas.push(ajuste);
    }
    const f = String((raw && raw.fecha) || '');
    return { comercio: String((raw && raw.comercio) || '').trim().slice(0, 60), fecha: /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : (opts.hoy || todayISO()),
      total: r2(total), lineas, ajuste: !!ajuste, diff };
  }

  function groupLines(lineas) {
    const m = new Map();
    lineas.forEach((l) => {
      const g = m.get(l.c) || { cat: l.c, total: 0, items: [] };
      g.total += l.p;
      g.items.push(l);
      m.set(l.c, g);
    });
    const arr = [...m.values()].map((g) => ({ ...g, total: r2(g.total) })).sort((a, b) => b.total - a.total);
    const all = arr.reduce((a, g) => a + g.total, 0);
    arr.forEach((g) => { g.pct = all > 0 ? g.total / all : 0; });
    return arr;
  }

  function dominantCategory(lineas) {
    const g = groupLines(lineas);
    return g.length ? g[0].cat : null;
  }

  const legible = (items, max = 230) => {
    const s = items.map((l) => `${l.n} ${r2(l.p).toFixed(2)}€`).join('; ');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  };

  /** Modo "dividir": una fila por categoría; la última absorbe el redondeo para que la suma sea EXACTAMENTE el total. */
  function splitRows(ticket, ticketId, makeId) {
    const grupos = groupLines(ticket.lineas);
    let acum = 0;
    return grupos.map((g, i) => {
      let importe = g.total;
      if (i === grupos.length - 1) importe = r2(ticket.total - acum);
      acum = r2(acum + importe);
      return { id: makeId(), fecha: ticket.fecha, categoria: g.cat, importe, tipo: TIPO_GASTO,
        detalle: `${ticket.comercio || 'Ticket'} · ${legible(g.items)}`, comercio: ticket.comercio, ticketId, origen: 'ticket-split',
        items: JSON.stringify({ v: 1, t: { id: ticketId, c: ticket.comercio, f: ticket.fecha, total: ticket.total }, l: g.items.map((l) => ({ n: l.n, p: l.p, c: l.c })) }) };
    }).filter((r) => r.importe > 0 || grupos.length === 1);
  }

  /** Modo "una sola fila": total completo + desglose guardado dentro. */
  function singleRow(ticket, ticketId, categoria, makeId) {
    return { id: makeId(), fecha: ticket.fecha, categoria: categoria || dominantCategory(ticket.lineas), importe: ticket.total, tipo: TIPO_GASTO,
      detalle: `${ticket.comercio || 'Ticket'} · ${ticket.lineas.length} artículos`, comercio: ticket.comercio, ticketId, origen: 'ticket-uno',
      items: JSON.stringify({ v: 1, t: { id: ticketId, c: ticket.comercio, f: ticket.fecha, total: ticket.total }, l: ticket.lineas.map((l) => ({ n: l.n, p: l.p, c: l.c })) }) };
  }

  function parseItems(s) {
    if (!s) return null;
    try { const o = JSON.parse(s); return o && Array.isArray(o.l) ? o : null; } catch (e) { return null; }
  }

  /** Reconstruye el ticket completo (todas sus filas, si estaba dividido). */
  function ticketOf(gasto, gastos) {
    const own = parseItems(gasto.items);
    if (!gasto.ticketId) return own ? { meta: own.t, lineas: own.l } : null;
    const filas = gastos.filter((g) => g.ticketId === gasto.ticketId);
    const lineas = [];
    let meta = own && own.t;
    filas.forEach((f) => { const it = parseItems(f.items); if (it) { meta = meta || it.t; it.l.forEach((l) => lineas.push(l)); } });
    return lineas.length ? { meta: meta || { c: gasto.comercio, f: gasto.fecha, total: filas.reduce((a, f) => a + f.importe, 0) }, lineas, filas } : null;
  }

  /* ------------------------------------------------------------------ búsqueda: concepto, categoría, comercio y artículos de tickets */
  function searchGastos(gastos, q) {
    const tokens = norm(q).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    const out = [];
    gastos.forEach((g) => {
      const items = (parseItems(g.items) || { l: [] }).l;
      const base = norm([g.detalle, g.categoria, g.comercio].join(' '));
      const hitItems = [];
      let ok = true;
      tokens.forEach((t) => {
        const hit = items.filter((l) => norm(l.n).includes(t));
        hit.forEach((h) => { if (!hitItems.includes(h)) hitItems.push(h); });     // siempre se enseñan los artículos que coinciden
        if (!base.includes(t) && !hit.length) ok = false;
      });
      if (ok) out.push({ g, items: hitItems });
    });
    return out.sort((a, b) => (a.g.fecha < b.g.fecha ? 1 : -1));
  }

  /* ------------------------------------------------------------------ importar desde las filas de un Excel */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  /** filas: [{fecha, categoria, importe, tipo, detalle}] -> con id determinista (reimportar no duplica) */
  function importRows(filas, categorias, hoy) {
    const vistos = {};
    const res = { rows: [], sinFecha: 0, descartadas: 0 };
    filas.forEach((f) => {
      const imp = parseAmount(f.importe);
      if (imp == null || imp <= 0) { res.descartadas++; return; }
      let fecha = f.fecha;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) { fecha = hoy || todayISO(); res.sinFecha++; }
      const cat = matchCategory(f.categoria, categorias, f.categoria || '');
      const tipo = /devol/i.test(String(f.tipo || '')) ? TIPO_DEV : TIPO_GASTO;
      const base = [fecha, cat, imp, tipo, String(f.detalle || '')].join('|');
      vistos[base] = (vistos[base] || 0) + 1;
      res.rows.push({ id: `imp-${hashStr(base)}-${vistos[base]}`, fecha, categoria: cat, importe: imp, tipo, detalle: String(f.detalle || '').slice(0, 200),
        comercio: '', items: '', ticketId: '', origen: 'excel' });
    });
    return res;
  }

  return { TIPO_GASTO, TIPO_DEV, MESES, r2, norm, parseAmount, fmtEUR, monthKey, monthLabel, shiftMonth, todayISO, uuid, effectiveAt, computeMonth,
    buildIndex, predictCategory, suggest, topChips, matchCategory, normalizeTicket, groupLines, dominantCategory, legible, splitRows, singleRow,
    parseItems, ticketOf, searchGastos, hashStr, importRows };
});
