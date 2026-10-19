/* Finanzas App · interfaz y sincronización. Depende de core.js (window.Core). */
(function () {
  'use strict';
  const C = window.Core;
  const FF = (window.FF = { pcActive: false });      // enganche para la vista de escritorio (pc.js)
  const VERSION = '1.0.0';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ================================================================== estado y almacenamiento */
  const LS = { cfg: 'ff.cfg', data: 'ff.data', queue: 'ff.queue' };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento lleno o bloqueado */ } };

  const cfg = Object.assign({ url: '', token: '', gKey: '', gModel: 'gemini-2.5-flash', gBase: 'https://generativelanguage.googleapis.com' }, load(LS.cfg, {}));
  let data = Object.assign({ rev: null, config: { categorias: [], sueldo: [], fijos: {}, suscripciones: [], tiposExtra: [] }, diccionario: [], gastos: [], extras: [] }, load(LS.data, {}));
  let queue = load(LS.queue, []);
  let index = C.buildIndex(data.diccionario);
  const ui = { mk: C.monthKey(C.todayISO()), view: 'home', cat: null, catAuto: false, tipo: 'Gasto', fecha: null, net: 'idle', histLimit: 60, suggestSel: -1, resMode: 'mes', resYear: new Date().getFullYear(), rFrom: null, rTo: null, resAll: false };
  ui.rTo = C.monthKey(C.todayISO()); ui.rFrom = C.shiftMonth(ui.rTo, -2);
  const DEFAULT_CATS = [
    '🏠 Vivienda (alquiler / hipoteca)', '🛒 Supermercado y comida', '💡 Luz, agua e internet', '🚗 Coche (gasolina, seguro, taller)',
    '🏍️ Moto (gasolina, taller, equipación)', '🚌 Transporte público y otros', '👕 Ropa y calzado', '🍻 Ocio, cenas y salidas',
    '🏥 Salud y cuidado personal', '🎁 Regalos y caprichos', '🎮 Suscripciones', '📈 Inversión',
    '🛡️ Colchón / ahorro', '🕹️ Hobbys y videojuegos', '🖥️ Decoración, periféricos y gaming', '📑 Multas',
    '🧾 Trámites', '🗂️ Gestoría', '🐾 Mascota (comida, veterinario, accesorios)', '📦 Otros'];

  data.config = C.normConfig(data.config);                                    // también lo guardado de otras sesiones
  const cats = () => (Array.isArray(data.config.categorias) ? data.config.categorias : []).map((c) => (typeof c === 'string' ? c : c.nombre));
  const persistData = () => save(LS.data, data);
  const persistQueue = () => save(LS.queue, queue);
  const rebuildIndex = () => { index = C.buildIndex(data.diccionario); };

  /* ================================================================== red: Apps Script */
  const configured = () => !!(cfg.url && cfg.token);

  async function apiGet(params) {
    const u = new URL(cfg.url);
    Object.entries(Object.assign({ token: cfg.token }, params)).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
    return r.json();
  }
  /** Lecturas: por POST, para que el token no quede en la URL (registros, historiales, cabeceras). Con un script ANTIGUO que no lo admite,
      se vuelve al GET una vez y se avisa para que lo actualices. */
  let legacyGet = false, legacyWarned = false;
  async function apiRead(action) {
    if (!legacyGet) {
      const r = await apiPost({ action });
      if (!(r && r.code === 'bad-action')) return r;
      legacyGet = true;
    }
    if (!legacyWarned) { legacyWarned = true; toast('⚠️ Tu script de Google es antiguo: pega el nuevo Code.gs para que el token no viaje en la URL.'); }
    return apiGet({ action });
  }
  async function apiPost(body) {
    // text/plain evita el "preflight" CORS, que Apps Script no admite
    const r = await fetch(cfg.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: cfg.token }, body)) });
    return r.json();
  }

  /** Cola de operaciones: se aplican en local al instante y se envían cuando hay red. Los ids hacen los reintentos seguros. */
  function enqueue(action, payload) {
    queue.push({ qid: C.uuid(), action, payload });
    persistQueue();
    setNet();
    flush();
  }

  let flushing = false;
  async function flush() {
    if (flushing || !configured() || !queue.length) return;
    flushing = true;
    try {
      while (queue.length) {
        const op = queue[0];
        let res;
        try { res = await apiPost(Object.assign({ action: op.action }, op.payload)); } catch (e) { ui.net = 'offline'; break; }
        if (res && res.ok) { queue.shift(); persistQueue(); ui.net = 'idle'; continue; }
        if (res && res.code === 'auth') { ui.net = 'auth'; toast('⚠️ Token incorrecto: revisa Ajustes'); break; }
        if (res && res.code === 'busy' && (op.tries = (op.tries || 0) + 1) < 5) { await wait(1500); continue; }
        queue.shift(); persistQueue();                                       // error de validación: no reintentar eternamente
        toast('⚠️ El servidor rechazó un dato: ' + esc((res && res.error) || 'error'));
      }
    } finally { flushing = false; setNet(); }
  }

  /** Vuelve a aplicar encima de lo descargado lo que aún no se ha enviado. */
  function overlayQueue() {
    queue.forEach((op) => {
      const p = op.payload;
      if (op.action === 'add') p.rows.forEach((r) => { if (!data.gastos.some((g) => g.id === r.id)) data.gastos.push(r); });
      else if (op.action === 'addExtra') p.rows.forEach((r) => { if (!data.extras.some((g) => g.id === r.id)) data.extras.push(r); });
      else if (op.action === 'delete') { if (p.sheet === 'extras') data.extras = data.extras.filter((g) => g.id !== p.id); else data.gastos = data.gastos.filter((g) => g.id !== p.id); }
      else if (op.action === 'update') { const g = data.gastos.find((x) => x.id === p.id); if (g) Object.assign(g, p.fields); }
      else if (op.action === 'dictSet') dictLocal(p.k, p.c, p.s);
      else if (op.action === 'dictDel') data.diccionario = data.diccionario.filter((d) => d.k !== p.k);
    });
  }

  let refreshing = false;
  async function refresh(force) {
    if (!configured() || refreshing) return false;
    refreshing = true;
    try {
      await flush();
      if (queue.length) return false;                                        // no descargar encima de cambios sin enviar
      const meta = await apiRead('rev');
      if (!meta.ok) { ui.net = meta.code === 'auth' ? 'auth' : 'offline'; return false; }
      if (!force && meta.rev === data.rev) { ui.net = 'idle'; return true; }
      const d = await apiRead('data');
      if (!d.ok) { ui.net = 'offline'; return false; }
      data = { rev: d.rev, config: C.normConfig(Object.assign({ categorias: [], sueldo: [], fijos: {}, suscripciones: [], tiposExtra: [] }, d.config)), diccionario: d.diccionario || [], gastos: d.gastos || [], extras: d.extras || [] };
      overlayQueue(); rebuildIndex(); persistData(); ui.net = 'idle';
      if (FF.autoPost) setTimeout(FF.autoPost, 0);
      if (FF.pinSync) setTimeout(FF.pinSync, 0);
      return true;
    } catch (e) { ui.net = 'offline'; return false; } finally { refreshing = false; setNet(); renderAll(); }
  }

  /** Qué responde tu hoja (para entender por qué algo no aparece). */
  async function diagnose() {
    const out = { conectada: configured(), local: { categorias: cats().length, gastos: data.gastos.length, pendientes: queue.length, rev: data.rev } };
    if (!configured()) return out;
    try {
      const i = await apiPost({ action: 'info' });
      if (i && i.code === 'bad-action') { const p = await apiGet({ action: 'ping' }); out.ping = { ok: !!p.ok, version: p.v, modo: p.mode, app: p.app, error: p.error, antiguo: true }; }
      else out.ping = { ok: !!(i && i.ok), version: i && i.v, modo: i && i.mode, app: i && i.app, error: i && i.error };
    } catch (e) { out.ping = { error: String(e.message || e) }; }
    try {
      const d = await apiRead('data');
      if (d.ok) { const k = (d.config || {}).categorias; out.servidor = { categorias: Array.isArray(k) ? k.length : (k == null ? 'no existe' : 'formato raro (' + typeof k + ')'), claves: Object.keys(d.config || {}), gastos: (d.gastos || []).length, extras: (d.extras || []).length }; }
      else out.servidor = { error: d.error || d.code || 'sin respuesta' };
    } catch (e) { out.servidor = { error: String(e.message || e) }; }
    return out;
  }

  function setNet() {
    const el = $('#sync');
    let t = '☁️ Sincronizado', k = 'ok';
    if (!configured()) { t = '🔌 Sin conectar'; k = 'warn'; }
    else if (ui.net === 'auth') { t = '🔑 Token incorrecto'; k = 'bad'; }
    else if (queue.length) { t = `⏳ ${queue.length} pendiente${queue.length > 1 ? 's' : ''}`; k = 'warn'; }
    else if (ui.net === 'offline') { t = '📴 Sin conexión'; k = 'warn'; }
    el.textContent = t; el.className = 'chip ' + k;
    if (FF.onNet) FF.onNet(t, k);
  }

  /* ================================================================== mutaciones locales + cola */
  function dictLocal(k, c, s) {
    k = C.norm(k);
    const e = data.diccionario.find((d) => d.k === k);
    if (e) { e.c = c; e.n = (e.n || 0) + 1; e.s = s || e.s; } else data.diccionario.push({ k, c, n: 1, s: s || 'app' });
  }
  function learn(concept, cat) {
    const k = C.norm(concept);
    if (!k || k.length < 2 || !cat) return;
    const cur = index.get(k);
    if (cur && cur.c === cat && cur.s !== 'semilla') return;                  // ya lo sabía: nada que enviar
    dictLocal(k, cat, 'app'); rebuildIndex();
    enqueue('dictSet', { k, c: cat, s: 'app' });
  }
  function addGastos(rows) {
    rows.forEach((r) => data.gastos.push(r));
    persistData();
    for (let i = 0; i < rows.length; i += 400) enqueue('add', { rows: rows.slice(i, i + 400) });
    budgetNotice(rows);
  }
  /** Aviso al cruzar el 80 % o el 100 % del presupuesto de una categoría (solo la vez que se cruza). */
  function budgetNotice(rows) {
    if (rows.length > 10) return;
    const seen = new Set();
    rows.forEach((r) => {
      if (r.tipo === C.TIPO_DEV || !r.categoria) return;
      const mk = C.monthKey(r.fecha), k = mk + '|' + r.categoria;
      if (seen.has(k)) return;
      seen.add(k);
      const imp = rows.filter((x) => x.categoria === r.categoria && C.monthKey(x.fecha) === mk && x.tipo !== C.TIPO_DEV).reduce((t, x) => t + x.importe, 0);
      const x = C.budgetCrossing(data, mk, r.categoria, imp);
      if (!x) return;
      const cat = esc(r.categoria.replace(/\s*\(.*$/, ''));
      setTimeout(() => toast(x.nivel === 'pasado' ? `🚨 Te has pasado del presupuesto de <b>${cat}</b> (${Math.round(x.pct * 100)}%)` : `⚠️ Llevas el <b>${Math.round(x.pct * 100)}%</b> del presupuesto de <b>${cat}</b> · quedan ${esc(C.fmtEUR(x.queda))}`), 1700);
    });
  }
  function delGasto(id) {
    data.gastos = data.gastos.filter((g) => g.id !== id); persistData();
    enqueue('delete', { id });
  }

  /* ================================================================== utilidades de interfaz */
  let toastTimer = null;
  /** El texto del aviso puede llevar <b>…</b> (lo ponemos nosotros), pero NADA más: cualquier otra etiqueta o atributo se convierte en texto.
      Se analiza en un <template> (inerte: no carga imágenes ni ejecuta nada). Es una segunda barrera por si algún dato llegase sin escapar. */
  const TAGS_OK = { B: 1, STRONG: 1, I: 1, SMALL: 1, BR: 1 };
  function safeHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html == null ? '' : html);
    const out = document.createDocumentFragment();
    const walk = (src, dst) => src.childNodes.forEach((n) => {
      if (n.nodeType === 3) dst.appendChild(document.createTextNode(n.nodeValue));
      else if (n.nodeType === 1) {
        if (TAGS_OK[n.tagName]) { const e = document.createElement(n.tagName.toLowerCase()); walk(n, e); dst.appendChild(e); }
        else dst.appendChild(document.createTextNode(n.textContent));
      }
    });
    walk(t.content, out);
    return out;
  }
  function toast(html, action) {
    const box = $('#toast');
    box.textContent = '';
    const wrap = document.createElement('div'), span = document.createElement('span');
    span.appendChild(safeHtml(html)); wrap.appendChild(span);
    if (action) { const b = document.createElement('button'); b.id = 'toastAct'; b.textContent = String(action.label); b.onclick = () => { box.textContent = ''; action.fn(); }; wrap.appendChild(b); }
    box.appendChild(wrap);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.textContent = ''; }, action ? 6000 : 3200);
  }

  const overlay = $('#overlay');
  const sheets = [];
  function openSheet(html, opts = {}) {
    const el = document.createElement('div');
    el.className = 'sheet' + (opts.full ? ' full' : '');
    el.innerHTML = `<div class="grab"></div>${html}`;
    overlay.appendChild(el); overlay.classList.add('on');
    const api = { el, close() { el.remove(); const i = sheets.indexOf(api); if (i >= 0) sheets.splice(i, 1); if (!sheets.length) overlay.classList.remove('on'); if (opts.onClose) opts.onClose(); } };
    sheets.push(api);
    return api;
  }
  $('#overlay .bk').onclick = () => { const s = sheets[sheets.length - 1]; if (s && !s.locked) s.close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const s = sheets[sheets.length - 1]; if (s && !s.locked) s.close(); } });

  /** Selector de categoría: devuelve la elegida o null */
  function pickFrom(title, list, current) {
    return new Promise((resolve) => {
      let done = false;
      const vacio = !list.length;
      const esCat = /categor/i.test(title);
      const body = vacio
        ? `<div class="empty">${esCat ? 'Todavía no tienes categorías.' : (configured() ? 'No hay opciones todavía.' : 'Primero conecta tu hoja de Google en Ajustes.')}</div>
           ${esCat ? '<button class="btn pri js-defcats">➕ Cargar las categorías de ejemplo</button>' : '<button class="btn sec js-goset">⚙️ Abrir ajustes</button>'}`
        : `<div class="pick">${list.map((c, i) => `<button data-i="${i}" class="${c === current ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>`;
      const sh = openSheet(`<h3>${esc(title)}</h3>${body}`, { onClose: () => { if (!done) resolve(null); } });
      sh.el.onclick = (e) => {
        if (e.target.closest('.js-defcats')) { loadDefaultCats(); sh.close(); return; }
        if (e.target.closest('.js-goset')) { sh.close(); go('set'); return; }
        const b = e.target.closest('button[data-i]'); if (!b) return; done = true; resolve(list[+b.dataset.i]); sh.close();
      };
    });
  }
  function loadDefaultCats() {
    const value = DEFAULT_CATS.map((nombre) => ({ nombre, presupuesto: null }));
    data.config.categorias = value; persistData();
    enqueue('configSet', { key: 'categorias', value });
    renderAll(); toast('✓ Categorías cargadas. Puedes editarlas en Piloto Automático.');
  }
  const pickCategory = (current) => pickFrom('Categoría', cats(), current);

  const dayLabel = (iso) => {
    const t = C.todayISO(), y = C.todayISO(new Date(Date.now() - 864e5));
    if (iso === t) return 'Hoy'; if (iso === y) return 'Ayer';
    const [Y, M, D] = iso.split('-').map(Number);
    return `${D} ${C.MESES[M - 1].slice(0, 3)} ${Y !== new Date().getFullYear() ? Y : ''}`.trim();
  };

  /* ================================================================== cabecera: cuánto me queda */
  function renderHeader() {
    const m = C.computeMonth(data, ui.mk);
    const cur = ui.mk === C.monthKey(C.todayISO());
    $('#mLabel').textContent = C.monthLabel(ui.mk);
    $('#qLbl').textContent = cur ? 'Te quedan este mes' : (ui.mk > C.monthKey(C.todayISO()) ? 'Te quedarían (previsión)' : 'Te quedaron');
    const q = $('#queda'); q.textContent = C.fmtEUR(m.queda); q.classList.toggle('neg', m.queda < 0);
    const fill = $('#batFill');
    const colores = { verde: 'var(--acc)', amarillo: 'var(--warn)', rojo: 'var(--bad)', vacio: 'var(--line)' };
    const wPct = m.semaforo === 'vacio' ? 0 : Math.max(3, Math.min(100, m.pctGastado * 100));
    fill.style.width = wPct + '%';
    fill.style.backgroundSize = (wPct ? 10000 / wPct : 100) + '% 100%';          // el degradado cian → naranja → rojo pertenece al carril, no a la barra
    fill.style.boxShadow = `0 0 14px ${colores[m.semaforo] === 'var(--line)' ? 'transparent' : colores[m.semaforo]}`;
    const msg = C.semaforoMsg(m);
    const bm = $('#batMsg'); bm.textContent = msg; bm.style.color = colores[m.semaforo] === 'var(--line)' ? 'var(--mut)' : colores[m.semaforo];
  }

  /* ================================================================== HOY: formulario rápido */
  function setCat(c, auto) {
    ui.cat = c; ui.catAuto = !!auto;
    const t = $('#catTxt');
    t.textContent = c || (ui.tipo === 'extra' ? 'Elige tipo de ingreso' : 'Elige categoría'); t.className = c ? '' : 'mut';
    $('#catBadge').innerHTML = c && auto ? '<span class="badge">auto ✨</span>' : '';
    $('#catBtn').classList.remove('need');
  }
  function renderDate() { $('#dateTxt').textContent = ui.fecha ? dayLabel(ui.fecha) : 'Hoy'; }

  function renderSuggest() {
    const box = $('#sug'), t = $('#con').value;
    if (ui.tipo === 'extra') { box.innerHTML = ''; return; }
    const s = C.suggest(t, data.gastos, index, 5);
    ui.suggestions = s;
    box.innerHTML = s.map((x, i) => `<button type="button" data-i="${i}"><span>${esc(x.text)}</span><small>${esc((x.cat || '').slice(0, 26))}${x.src === 'historial' ? ' · tuyo' : ''}</small></button>`).join('');
  }

  function onConceptInput() {
    renderSuggest();
    if (ui.tipo === 'extra') return;
    const txt = $('#con').value;
    let p = C.predictCategory(txt, index, cats());
    if (!p && C.norm(txt).length >= 3) {                                     // "caf", "figu", "mot": la mejor sugerencia decide
      const s = (ui.suggestions || [])[0];
      if (s && cats().includes(s.cat)) p = { cat: s.cat };
    }
    if (p && (ui.catAuto || !ui.cat)) setCat(p.cat, true);
    else if (!p && ui.catAuto) setCat(null, false);
  }

  function chooseSuggestion(s) {
    $('#con').value = s.text; $('#sug').innerHTML = '';
    setCat(s.cat, true);
    if (s.importe) $('#amt').placeholder = String(s.importe).replace('.', ',');
    $('#amt').focus();
  }

  function renderChips() {
    const chips = C.topChips(data.gastos, 8);
    $('#chipsCard').hidden = !chips.length;
    $('#chips').innerHTML = chips.map((c, i) => `<button data-i="${i}">${esc(c.text)}<small>${esc(C.fmtEUR(c.importe))}</small></button>`).join('');
    ui.chips = chips;
  }

  function itemRow(g) {
    const sign = g.tipo === C.TIPO_DEV ? '−' : '';
    const sub = [g.categoria ? g.categoria.replace(/\s*\(.*$/, '') : 'Sin categoría', dayLabel(g.fecha)].join(' · ');
    const it = g.items ? C.parseItems(g.items) : null;
    const titulo = it ? `🧾 ${g.comercio || (it.t && it.t.c) || 'Ticket'} · ${it.l.length} art.` : (g.detalle || g.categoria || '—');
    return `<div class="item" data-id="${esc(g.id)}"><div class="l"><div class="t">${esc(titulo)}</div><div class="s">${esc(sub)}</div></div><div class="amt ${g.tipo === C.TIPO_DEV ? 'dev' : ''}">${sign}${esc(C.fmtEUR(g.importe))}</div></div>`;
  }
  function renderRecent() {
    const last = data.gastos.slice(-6).reverse();
    $('#recent').innerHTML = last.length ? last.map(itemRow).join('') : '<div class="empty">Aún no hay gastos. Escribe el primero arriba 👆</div>';
  }

  async function saveQuick() {
    const imp = C.parseAmount($('#amt').value);
    if (imp == null || imp <= 0) { const a = $('#amt'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); a.focus(); toast('Pon un importe mayor que 0'); return; }
    const fecha = ui.fecha || C.todayISO();
    const concept = $('#con').value.trim();
    if (ui.tipo === 'extra') {
      if (!ui.cat) { $('#catBtn').classList.add('need'); const c = await pickFrom('Tipo de ingreso extra', data.config.tiposExtra || [], null); if (!c) return; setCat(c, false); }
      const row = { id: C.uuid(), fecha, tipo: ui.cat, importe: imp, detalle: concept };
      data.extras.push(row); persistData(); enqueue('addExtra', { rows: [row] });
      const pe = FF.payApply ? FF.payApply('extra', imp) : '', pidE = FF.payLastId;
      toast(`💵 Extra guardado · Te quedan <b>${esc(C.fmtEUR(C.computeMonth(data, ui.mk).queda))}</b>${pe ? ' · ' + esc(pe) : ''}`, { label: 'Deshacer', fn: () => { if (pe && FF.payApply) FF.payApply('extra', imp, pidE); data.extras = data.extras.filter((x) => x.id !== row.id); persistData(); enqueue('delete', { sheet: 'extras', id: row.id }); renderAll(); } });
    } else {
      if (!ui.cat) { $('#catBtn').classList.add('need'); const c = await pickCategory(null); if (!c) return; setCat(c, false); }
      const row = { id: C.uuid(), fecha, categoria: ui.cat, importe: imp, tipo: ui.tipo, detalle: concept, comercio: '', items: '', ticketId: '', origen: 'app' };
      addGastos([row]);
      const pg = FF.payApply ? FF.payApply(ui.tipo === C.TIPO_DEV ? C.TIPO_DEV : C.TIPO_GASTO, imp) : '', pidG = FF.payLastId;
      if (concept) learn(concept, ui.cat);
      const q = C.computeMonth(data, C.monthKey(fecha)).queda;
      toast(`✓ Guardado · Te quedan <b>${esc(C.fmtEUR(q))}</b>${pg ? ' · ' + esc(pg) : ''}`, { label: 'Deshacer', fn: () => { delGasto(row.id); if (pg && FF.payApply) FF.payApply(ui.tipo === C.TIPO_DEV ? C.TIPO_DEV : C.TIPO_GASTO, imp, pidG); renderAll(); } });
    }
    $('#amt').value = ''; $('#con').value = ''; $('#amt').placeholder = '0,00'; $('#sug').innerHTML = '';
    ui.fecha = null; renderDate(); setCat(null, false);
    if (C.monthKey(fecha) !== ui.mk) ui.mk = C.monthKey(fecha);
    renderAll(); $('#amt').focus();
  }

  /* ================================================================== HISTORIAL y detalle */
  function renderHist() {
    const q = $('#q').value.trim(), box = $('#hist');
    if (q) {
      const res = C.searchGastos(data.gastos, q);
      box.innerHTML = res.length ? res.slice(0, 80).map(({ g, items }) => itemRow(g).replace('</div></div><div class="amt', `</div>${items.length ? `<div class="s">${items.slice(0, 3).map((l) => `<mark>${esc(l.n)}</mark> ${esc(C.fmtEUR(l.p))}`).join(' · ')}</div>` : ''}</div><div class="amt`)).join('')
        : `<div class="empty">Nada con “${esc(q)}”.</div>`;
      return;
    }
    const all = data.gastos.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    if (!all.length) { box.innerHTML = '<div class="empty">Todavía no hay gastos.</div>'; return; }
    let html = '', last = '';
    all.slice(0, ui.histLimit).forEach((g) => { if (g.fecha !== last) { last = g.fecha; html += `<div class="day">${esc(dayLabel(g.fecha))}</div>`; } html += itemRow(g); });
    if (all.length > ui.histLimit) html += '<button class="btn sec" id="more" style="margin-top:12px">Ver más</button>';
    box.innerHTML = html;
  }

  function openDetail(id) {
    const g = data.gastos.find((x) => x.id === id);
    if (!g) return;
    const tk = C.ticketOf(g, data.gastos);
    const tkHtml = tk ? `<h2 style="margin-top:14px">🧾 Ticket${tk.meta && tk.meta.c ? ' · ' + esc(tk.meta.c) : ''}${tk.meta && tk.meta.total ? ' · ' + esc(C.fmtEUR(tk.meta.total)) : ''}</h2>
      ${C.groupLines(tk.lineas.map((l) => ({ n: l.n, p: l.p, c: l.c }))).map((gr) => `<div style="margin:8px 0"><div class="kv" style="padding:0"><b>${esc(gr.cat)}</b><b>${esc(C.fmtEUR(gr.total))}</b></div>${gr.items.map((l) => `<div class="kv small mut" style="padding:2px 0"><span>${esc(l.n)}</span><span>${esc(C.fmtEUR(l.p))}</span></div>`).join('')}</div>`).join('')}` : '';
    const sh = openSheet(`<h3>${esc(tk ? `🧾 ${g.comercio || 'Ticket'} · parte de ${(g.categoria || '').replace(/\s*\(.*$/, '')}` : (g.detalle || g.categoria || 'Gasto'))}</h3>
      <div class="mut small" style="margin-bottom:10px">${esc(dayLabel(g.fecha))} · ${esc(g.categoria || 'Sin categoría')}${g.origen ? ' · ' + esc(g.origen) : ''}</div>
      <div class="big" style="font-size:30px">${g.tipo === C.TIPO_DEV ? '−' : ''}${esc(C.fmtEUR(g.importe))}</div>
      ${tkHtml}
      <div class="grid2" style="margin-top:16px"><button class="btn sec" id="dCat">🏷️ Cambiar categoría</button><button class="btn bad" id="dDel">🗑️ Eliminar</button></div>`, { full: !!tk });
    $('#dCat', sh.el).onclick = async () => {
      const c = await pickCategory(g.categoria); if (!c) return;
      g.categoria = c; persistData(); enqueue('update', { id: g.id, fields: { categoria: c } });
      if (g.detalle) learn(g.detalle, c);
      sh.close(); renderAll(); toast('Categoría cambiada');
    };
    $('#dDel', sh.el).onclick = () => { if (confirm('¿Eliminar este gasto?')) { delGasto(g.id); sh.close(); renderAll(); toast('Eliminado'); } };
  }

  /* ================================================================== RESUMEN */
  function resRange() {
    const hoy = C.monthKey(C.todayISO());
    if (ui.resMode === 'anio') {
      const y = ui.resYear, ini = `${y}-01`, fin = `${y}-12`;
      const hasta = ini <= hoy && fin > hoy ? hoy : fin;                       // año en curso: hasta el mes actual (sin mezclar previsiones)
      return { from: ini, to: hasta, label: `Año ${y}${hasta !== fin ? ' · hasta ' + C.MESES[+hasta.slice(5) - 1].toLowerCase() : ''}` };
    }
    if (ui.resMode === 'rango') {
      const [a, b] = ui.rFrom <= ui.rTo ? [ui.rFrom, ui.rTo] : [ui.rTo, ui.rFrom];
      return { from: a, to: b, label: `${C.monthLabel(a)} → ${C.monthLabel(b)}` };
    }
    return { from: ui.mk, to: ui.mk, label: C.monthLabel(ui.mk) };
  }

  function renderResCtl() {
    $$('#resSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === ui.resMode));
    $('#resAll').checked = ui.resAll;
    const box = $('#resExtra');
    if (ui.resMode === 'anio') box.innerHTML = `<div class="row"><button class="nav-btn" data-y="-1" aria-label="Año anterior">‹</button><div class="grow center"><b>${ui.resYear}</b></div><button class="nav-btn" data-y="1" aria-label="Año siguiente">›</button></div>`;
    else if (ui.resMode === 'rango') box.innerHTML = `<div class="grid2"><div><label class="f" for="rFrom">Desde</label><input type="month" class="t" id="rFrom" value="${esc(ui.rFrom)}"></div><div><label class="f" for="rTo">Hasta</label><input type="month" class="t" id="rTo" value="${esc(ui.rTo)}"></div></div>`;
    else box.innerHTML = '<div class="small mut">Cambia de mes con las flechas de arriba.</div>';
  }

  function renderRes() {
    const rg = resRange();
    const m = C.computeRange(data, rg.from, rg.to);
    const multi = m.n > 1;
    const neg = (n) => esc((n > 0.004 ? '−' : '') + C.fmtEUR(n));
    $('#resTot').innerHTML = `<h2>${esc(rg.label)}${multi ? ` <span class="small" style="text-transform:none">· ${m.n} meses</span>` : ''}</h2>
      <div class="kv"><span>💵 Sueldo</span><b>${esc(C.fmtEUR(m.sueldo))}</b></div>
      <div class="kv"><span>🚀 Extras</span><b>${esc(C.fmtEUR(m.extras))}</b></div>
      <div class="kv"><span>⚙️ Gastos fijos</span><b>${neg(m.fijos - m.subs)}</b></div>
      <div class="kv"><span>🎮 Suscripciones</span><b>${neg(m.subs)}</b></div>
      <div class="kv"><span>📝 Día a día (menos devoluciones)</span><b>${neg(m.dia)}</b></div>
      ${multi ? `<div class="kv mut"><span>Gasto medio al mes</span><b>${esc(C.fmtEUR(m.mediaSale))}</b></div>` : ''}
      <div class="kv tot"><span>🔥 ${multi ? 'Te ha quedado' : 'Te queda'}</span><b style="color:${m.queda < 0 ? 'var(--bad)' : 'var(--acc2)'}">${esc(C.fmtEUR(m.queda))}</b></div>
      ${rg.to > C.monthKey(C.todayISO()) ? '<div class="small mut" style="margin-top:8px">Los meses que aún no han llegado son una previsión (sueldo y gastos fijos repetidos).</div>' : ''}`;

    const mm = $('#resMeses');
    mm.hidden = !multi;
    if (multi) mm.innerHTML = `<h2>Mes a mes</h2>${m.meses.map((x) => `<div class="kv"><span>${esc(C.monthLabel(x.mk))}</span><span class="small mut">${esc(C.fmtEUR(x.entra))} − ${esc(C.fmtEUR(x.sale))}</span><b style="color:${x.queda < 0 ? 'var(--bad)' : 'var(--acc2)'}">${esc(C.fmtEUR(x.queda))}</b></div>`).join('')}`;

    const filas = ui.resAll ? m.filas : m.filas.filter((f) => Math.abs(f.total) > 0.004);
    const max = Math.max(...filas.map((f) => f.pct), 0.0001);
    $('#resCats').innerHTML = filas.length ? filas.map((f) => {
      const over = f.presupuesto != null && f.total > f.presupuesto;
      const w = f.presupuesto != null && f.presupuesto > 0 ? Math.min(100, (f.total / f.presupuesto) * 100) : (f.pct / max) * 100;
      return `<div style="margin-bottom:14px"><div class="kv" style="padding:0"><span>${esc(f.cat)}</span><b>${esc(C.fmtEUR(f.total))}</b></div>
        <div class="bar ${over ? 'over' : ''}"><i style="width:${Math.max(f.total > 0.004 ? 2 : 0, w).toFixed(1)}%"></i></div>
        <div class="small mut">${f.presupuesto != null && f.presupuesto > 0 ? `${Math.round((f.total / f.presupuesto) * 100)}% de ${esc(C.fmtEUR(f.presupuesto))}` : `${Math.round(f.pct * 100)}% de lo gastado`}${f.fijo ? ` · fijo ${esc(C.fmtEUR(f.fijo))}` : ''}</div></div>`;
    }).join('') : '<div class="empty">Sin movimientos en este periodo.</div>';
  }

  /* ================================================================== AJUSTES */
  function renderSettings() {
    $('#sUrl').value = cfg.url; $('#sTok').value = cfg.token; $('#sKey').value = cfg.gKey; $('#sMod').value = cfg.gModel; $('#sBase').value = cfg.gBase;
    settingsStats();
  }
  function settingsStats() {
    $('#ver').textContent = `Finanzas ${VERSION} · ${data.gastos.length} gastos · ${data.diccionario.length} palabras en el diccionario`;
    renderDict();
  }
  function renderDict() {
    const f = C.norm($('#dq').value);
    const list = data.diccionario.slice().sort((a, b) => (b.n - a.n) || a.k.localeCompare(b.k)).filter((d) => !f || d.k.includes(f) || C.norm(d.c).includes(f)).slice(0, 80);
    $('#dictList').innerHTML = list.map((d) => `<div class="item"><div class="l"><div class="t">${esc(d.k)}</div><div class="s">${esc(d.c)} · ${esc(d.s)}</div></div><button data-del="${esc(d.k)}" aria-label="Borrar" style="font-size:18px">✕</button></div>`).join('') || '<div class="empty">Nada.</div>';
  }
  /** Solo se acepta una URL de Google Apps Script (o local, para pruebas): si no, el token y tus datos podrían enviarse a un servidor ajeno. */
  const GEM_BASE = 'https://generativelanguage.googleapis.com';
  const gemBaseOk = (u) => { try { const x = new URL(u); return (x.protocol === 'https:' && x.hostname === 'generativelanguage.googleapis.com' && !x.username && !x.password) || (x.protocol === 'http:' && (x.hostname === '127.0.0.1' || x.hostname === 'localhost')); } catch (e) { return false; } };
  function saveCfg() {
    const url = $('#sUrl').value.trim(), base = ($('#sBase').value.trim() || GEM_BASE).replace(/\/+$/, ''), model = $('#sMod').value.trim() || 'gemini-2.5-flash';
    let ok = true;
    if (url && !hostOk(url)) { toast('⚠️ La URL debe ser de Google Apps Script (https://script.google.com/macros/s/…/exec)'); $('#sUrl').value = cfg.url; ok = false; } else cfg.url = url;
    if (!gemBaseOk(base)) { toast('⚠️ La dirección de Gemini solo puede ser ' + esc(GEM_BASE)); $('#sBase').value = cfg.gBase; ok = false; } else cfg.gBase = base;
    if (!/^[A-Za-z0-9._\-]{1,60}$/.test(model)) { toast('⚠️ Nombre de modelo no válido'); $('#sMod').value = cfg.gModel; ok = false; } else cfg.gModel = model;
    cfg.token = $('#sTok').value.trim(); cfg.gKey = $('#sKey').value.trim();
    save(LS.cfg, cfg); setNet(); renderAll();
    return ok;
  }
  async function testConn() {
    if (!saveCfg()) return;
    const msg = $('#sMsg');
    if (!cfg.url) { msg.textContent = 'Pega primero la URL.'; return; }
    msg.textContent = 'Probando…';
    try {
      const p = await (await fetch(cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'action=ping', { redirect: 'follow' })).json();
      if (!p.ok) { msg.textContent = '❌ La URL responde, pero no parece la app de Finanzas.'; return; }
      const d = await apiRead('rev');
      msg.textContent = d.ok ? '✅ Conectado correctamente.' : (d.code === 'auth' ? '🔑 La URL es correcta pero el token no.' : '❌ ' + (d.error || 'error'));
      if (d.ok) refresh(true);
    } catch (e) { msg.textContent = '❌ No se pudo conectar. ¿Está la implementación como "Cualquier usuario"? ¿Tienes conexión?'; }
  }

  /* ================================================================== enlace de configuración para otro móvil
     Formato: #c=<base64(JSON {u: url, t: token})>. El hash no viaja a ningún servidor. Solo se aceptan servidores de
     Google Apps Script (o local, para pruebas) y siempre con confirmación, para que un enlace ajeno no pueda desviar tus datos. */
  const b64enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const b64dec = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
  const hostOk = (u) => {
    try {
      const x = new URL(u);
      if (x.username || x.password) return false;
      if (x.protocol === 'https:') return (x.hostname === 'script.google.com' && x.pathname.startsWith('/macros/')) || x.hostname === 'script.googleusercontent.com';
      return x.protocol === 'http:' && (x.hostname === '127.0.0.1' || x.hostname === 'localhost');
    } catch (e) { return false; }
  };

  function shareLink() {
    if (!configured()) { toast('Configura primero la conexión'); return; }
    const link = location.origin + location.pathname + '#c=' + b64enc(JSON.stringify({ u: cfg.url, t: cfg.token }));
    const sh = openSheet(`<h3>Enlace de configuración</h3>
      <p class="small mut">Ábrelo en el otro móvil y quedará conectado sin escribir nada. Contiene tu token: envíatelo solo a ti (una nota o un mensaje a ti mismo) y no lo compartas.</p>
      <textarea class="t" id="lnk" rows="4" readonly>${esc(link)}</textarea>
      <div class="grid2" style="margin-top:12px"><button class="btn sec" id="lnkX">Cerrar</button><button class="btn pri" id="lnkC">📋 Copiar</button></div>`);
    $('#lnkX', sh.el).onclick = () => sh.close();
    $('#lnkC', sh.el).onclick = async () => {
      try { await navigator.clipboard.writeText(link); toast('📋 Enlace copiado'); } catch (e) { $('#lnk', sh.el).select(); toast('Selecciona el texto y cópialo'); }
    };
  }

  /** Guarda una clave de configuración (deudas, ahorros, sueldo, fijos…) en local y en la hoja. */
  function setConfig(key, value) { data.config[key] = value; persistData(); enqueue('configSet', { key, value }); }
  function addExtraRow(row) { data.extras.push(row); persistData(); enqueue('addExtra', { rows: [row] }); }
  function delExtra(id) { data.extras = data.extras.filter((x) => x.id !== id); persistData(); enqueue('delete', { sheet: 'extras', id }); }

  function applyHashConfig() {
    const m = location.hash.match(/^#c=([A-Za-z0-9+/=]+)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);       // quita el token de la barra de direcciones
    let o;
    try { o = JSON.parse(b64dec(m[1])); } catch (e) { toast('Enlace de configuración inválido'); return; }
    if (!o || typeof o.u !== 'string' || typeof o.t !== 'string' || o.t.length < 16 || !hostOk(o.u)) { toast('⚠️ Enlace no válido o de un servidor desconocido'); return; }
    const sh = openSheet(`<h3>¿Conectar esta app?</h3><p>Se conectará a la hoja del servidor <b>${esc(new URL(o.u).host)}</b>. Acepta solo si el enlace lo has generado tú.</p>
      <div class="grid2"><button class="btn sec" id="hcNo">Cancelar</button><button class="btn pri" id="hcOk">Conectar</button></div>`);
    $('#hcNo', sh.el).onclick = () => sh.close();
    $('#hcOk', sh.el).onclick = () => { cfg.url = o.u; cfg.token = o.t; save(LS.cfg, cfg); renderSettings(); sh.close(); setNet(); toast('🔗 Conectado'); refresh(true); };
  }

  /* ================================================================== ESCÁNER DE TICKETS */
  async function compressImage(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
    }
    const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight, k = Math.min(1, 1280 / Math.max(W, H));
    const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    let q = 0.78, url = cv.toDataURL('image/jpeg', q);
    while (url.length > 0.9e6 && q > 0.5) { q -= 0.12; url = cv.toDataURL('image/jpeg', q); }
    return { b64: url.split(',')[1], mime: 'image/jpeg', bytes: Math.round(url.length * 0.75), w: cv.width, h: cv.height };
  }

  const ticketPrompt = () => C.buildTicketPrompt(cats(), data.diccionario);

  async function callGemini(img) {
    if (!cfg.gKey) { const e = new Error('Falta la API key de Gemini'); e.code = 'nokey'; throw e; }
    const codes = cats().map((_, i) => String(i + 1));       // la IA responde con el nº de categoría: menos tokens de salida que el nombre completo
    const body = {
      contents: [{ role: 'user', parts: [{ text: ticketPrompt() }, { inline_data: { mime_type: img.mime, data: img.b64 } }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', required: ['t', 'l'], properties: {
          f: { type: 'STRING' }, s: { type: 'STRING' }, t: { type: 'NUMBER' },
          l: { type: 'ARRAY', items: { type: 'OBJECT', required: ['n', 'p', 'c'], properties: {
            n: { type: 'STRING' }, p: { type: 'NUMBER' }, c: codes.length ? { type: 'STRING', enum: codes } : { type: 'STRING' } } } } } } },
    };
    if (/2\.5-flash/i.test(cfg.gModel)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };   // leer un ticket no necesita "pensar": ahorra muchos tokens
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
    let res;
    const post = () => fetch(`${cfg.gBase}/v1beta/models/${encodeURIComponent(cfg.gModel)}:generateContent`, { method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.gKey }, body: JSON.stringify(body) });
    try {
      res = await post();
      if (res.status === 400 && body.generationConfig.thinkingConfig) {                    // modelo que no admite desactivar el pensamiento: reintenta sin eso
        const j = await res.clone().json().catch(() => ({}));
        if (/think/i.test((j.error && j.error.message) || '')) { delete body.generationConfig.thinkingConfig; res = await post(); }
      }
    } catch (e) { const er = new Error(e.name === 'AbortError' ? 'Gemini tardó demasiado (60 s). Prueba con mejor cobertura.' : 'No hay conexión con Gemini.'); er.code = 'net'; throw er; }
    finally { clearTimeout(to); }
    const js = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = (js.error && js.error.message) || ('HTTP ' + res.status);
      const er = new Error(res.status === 400 || res.status === 403 ? 'La API key no es válida o no tiene permiso (' + m + ')' : res.status === 429 ? 'Has superado el límite de uso de Gemini. Espera un minuto.' : 'Gemini devolvió un error: ' + m);
      er.code = 'api'; throw er;
    }
    const txt = js.candidates && js.candidates[0] && js.candidates[0].content && js.candidates[0].content.parts && js.candidates[0].content.parts.map((p) => p.text || '').join('');
    if (!txt) { const er = new Error('Gemini no devolvió texto (¿foto ilegible?).'); er.code = 'empty'; throw er; }
    try { return C.decodeTicket(JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim()), cats()); } catch (e) { const er = new Error('La respuesta de Gemini no era JSON válido.'); er.code = 'json'; throw er; }
  }

  async function scanFile(file) {
    if (!file) return;
    if (!cats().length) { toast('Sincroniza primero para cargar tus categorías'); return; }
    const sh = openSheet('<div class="center" style="padding:22px 0"><div class="spinner"></div><b id="scMsg">Preparando la foto…</b><div class="small mut" style="margin-top:6px">Esto suele tardar 5-15 segundos</div></div>');
    sh.locked = true;
    try {
      const img = await compressImage(file);
      $('#scMsg', sh.el).textContent = `Leyendo ticket… (${Math.round(img.bytes / 1024)} KB)`;
      const raw = await callGemini(img);
      const ticket = C.normalizeTicket(raw, cats(), index);
      sh.locked = false; sh.close();
      if (!ticket.lineas.length) { toast('No he encontrado artículos. Prueba otra foto más cerca y con luz.'); return; }
      openTicket(ticket);
    } catch (e) {
      sh.locked = false; sh.close();
      if (e.code === 'nokey') { toast('Falta la API key de Gemini', { label: 'Ajustes', fn: () => go('set') }); return; }
      openSheet(`<h3>No he podido leer el ticket</h3><p>${esc(e.message)}</p><button class="btn sec" id="okE">Vale</button>`).el.querySelector('#okE').onclick = () => sheets[sheets.length - 1].close();
    }
  }

  function openTicket(t) {
    const orig = t.lineas.map((l) => l.c);
    let singleCat = C.dominantCategory(t.lineas);
    const sh = openSheet('', { full: true });
    function paint() {
      const groups = C.groupLines(t.lineas), max = Math.max(...groups.map((g) => g.pct), 0.0001);
      sh.el.innerHTML = `<div class="grab"></div>
        <div class="row"><div class="grow"><h3>🧾 Rayos X del ticket</h3><div class="mut small">${esc(t.comercio || 'Comercio sin nombre')} · ${esc(dayLabel(t.fecha))}</div></div><button class="nav-btn" id="tkX" aria-label="Cerrar">✕</button></div>
        <div class="big" style="font-size:34px;margin:8px 0">${esc(C.fmtEUR(t.total))}</div>
        ${t.ajuste ? `<div class="warnbox">⚠️ Los artículos suman ${esc(C.fmtEUR(C.r2(t.total - t.diff)))} y el total es ${esc(C.fmtEUR(t.total))}: he añadido una línea de <b>ajuste</b> de ${esc(C.fmtEUR(t.diff))} (descuentos, redondeo o algo que no he leído). Revísala.</div>` : ''}
        <h2>¿De dónde sale cada euro?</h2>
        ${groups.map((g) => `<div style="margin-bottom:12px"><div class="kv" style="padding:0"><span>${esc(g.cat)}</span><b>${esc(C.fmtEUR(g.total))} <span class="mut small">· ${Math.round(g.pct * 100)}%</span></b></div><div class="bar"><i style="width:${Math.max(2, (g.pct / max) * 100).toFixed(1)}%"></i></div></div>`).join('')}
        <h2 style="margin-top:16px">Artículos <span class="small" style="text-transform:none">(toca la categoría para cambiarla)</span></h2>
        ${t.lineas.map((l, i) => `<div class="tk-line"><span class="n ${l.ajuste ? 'mut' : ''}">${esc(l.n)}</span><b class="amt">${esc(C.fmtEUR(l.p))}</b><button class="c" data-i="${i}">${esc(l.c.replace(/\s*\(.*$/, ''))}</button></div>`).join('')}
        <div style="margin-top:16px;display:grid;gap:10px">
          <button class="btn pri" id="tkSplit">✂️ Dividir por categorías (${groups.length} ${groups.length === 1 ? 'fila' : 'filas'})</button>
          <button class="btn sec" id="tkOne">📎 Una sola fila con detalle</button>
          <div class="small mut center" id="tkOneCat">${groups.length > 1 ? 'La fila única irá en: <b></b> · <a href="#" id="tkChg" style="color:var(--blue)">cambiar</a>' : ''}</div>
        </div>`;
      const oc = $('#tkOneCat b', sh.el); if (oc) oc.textContent = singleCat;
      $('#tkX', sh.el).onclick = () => sh.close();
      $$('.tk-line .c', sh.el).forEach((b) => { b.onclick = async () => { const i = +b.dataset.i; const c = await pickCategory(t.lineas[i].c); if (!c) return; t.lineas[i].c = c; t.lineas[i].manual = true; if (!groupsHas(c, singleCat)) singleCat = C.dominantCategory(t.lineas); paint(); }; });
      const chg = $('#tkChg', sh.el); if (chg) chg.onclick = async (e) => { e.preventDefault(); const c = await pickCategory(singleCat); if (c) { singleCat = c; paint(); } };
      $('#tkSplit', sh.el).onclick = () => finish('split');
      $('#tkOne', sh.el).onclick = () => finish('one');
    }
    const groupsHas = (c, cur) => cur === c || C.groupLines(t.lineas).some((g) => g.cat === cur);
    function finish(mode) {
      const tid = 'T' + C.uuid().slice(0, 8);
      const mk = () => C.uuid();
      const rows = mode === 'split' ? C.splitRows(t, tid, mk) : [C.singleRow(t, tid, singleCat, mk)];
      addGastos(rows);
      t.lineas.forEach((l, i) => { if (l.manual && l.c !== orig[i] && !l.ajuste) learn(l.n, l.c); });   // aprende lo que corriges
      sh.close();
      if (C.monthKey(t.fecha) !== ui.mk) ui.mk = C.monthKey(t.fecha);
      renderAll();
      toast(`🧾 Ticket guardado (${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}) · Te quedan <b>${esc(C.fmtEUR(C.computeMonth(data, ui.mk).queda))}</b>`);
    }
    paint();
  }

  /* ================================================================== EXCEL: importar / exportar (SheetJS, carga bajo demanda) */
  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el módulo de Excel')); document.head.appendChild(s); });
    return xlsxLoading;
  }
  const dateIso = (v) => {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10);   // +12 h: evita saltos de día por zona horaria
    const s = String(v == null ? '' : v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  };

  async function importXlsx(file) {
    if (file.size > 15e6) { toast('Ese archivo es demasiado grande (máximo 15 MB)'); return; }
    try {
      await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const toAoa = (ws) => { const r = XLSX.utils.decode_range(ws['!ref'] || 'A1'); r.s.r = 0; r.s.c = 0; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: r }); };   // siempre desde A1: las columnas no se desplazan
      const aoaOf = (re) => { const n = wb.SheetNames.find((x) => re.test(x)); return n ? { n, aoa: toAoa(wb.Sheets[n]) } : null; };
      const dateIso = (v) => C.isoOf(v) || null;
      const norm = (x) => C.norm(x);

      // gastos (pestaña "Gastos" o la primera)
      let imp = { rows: [], sinFecha: 0, sinCat: 0 }, gName = '';
      const gs = aoaOf(/gastos/i) || { n: wb.SheetNames[0], aoa: toAoa(wb.Sheets[wb.SheetNames[0]]) };
      const hi = gs.aoa.findIndex((r) => { const h = (r || []).map(norm); return h.some((x) => x.startsWith('fecha')) && h.some((x) => x.startsWith('categoria')) && h.some((x) => x.startsWith('importe')); });
      if (hi >= 0) {
        gName = gs.n;
        const h = gs.aoa[hi].map(norm), col = (p) => h.findIndex((x) => x.startsWith(p));
        const cF = col('fecha'), cC = col('categoria'), cI = col('importe'), cT = col('tipo'), cD = Math.max(col('detalle'), col('concepto'));
        const filas = gs.aoa.slice(hi + 1).map((r) => (r = r || [], { fecha: dateIso(r[cF]), categoria: r[cC] == null ? '' : String(r[cC]), importe: r[cI], tipo: cT >= 0 ? r[cT] : '', detalle: cD >= 0 && r[cD] != null ? String(r[cD]) : '' }))
          .filter((f) => f.importe != null && f.importe !== '' && typeof f.importe !== 'object');
        imp = C.importRows(filas, cats(), C.todayISO());
      }
      const nuevas = imp.rows.filter((r) => !data.gastos.some((g) => g.id === r.id));

      // extras (con horas), deudas, ahorros y piloto (categorías, sueldo, fijos, suscripciones)
      const ex = aoaOf(/extras/i), exAll = ex ? C.parseExtras(ex.aoa) : [];
      const exNew = exAll.filter((e) => !data.extras.some((x) => x.id === e.id));
      const de = aoaOf(/deudas/i), deAll = de ? C.parseDeudas(de.aoa) : [];
      const deNew = deAll.filter((d) => !(data.config.deudas || []).some((x) => x.id === d.id));
      const ah = aoaOf(/ahorros/i), ahorros = ah ? C.parseAhorros(ah.aoa) : null;
      const pi = aoaOf(/piloto/i), piloto = pi ? C.parsePiloto(pi.aoa) : null;
      const puedeConfig = piloto && data.config.fuente !== 'excel';
      if (!nuevas.length && !exNew.length && !deNew.length && !puedeConfig && !(ahorros && (ahorros.base || ahorros.desde))) { toast('No encuentro nada nuevo que importar (¿pestañas Gastos, Extras, Deudas, Ahorros, Piloto?)'); return; }

      const li = [];
      if (puedeConfig) li.push(`⚙️ <b>Piloto</b>: ${piloto.categorias.length} categorías, sueldo, ${Object.keys(piloto.fijos).length} gastos fijos, ${piloto.suscripciones.length} suscripciones y ${piloto.tiposExtra.length} tipos de extra <span class="mut">(sustituye los actuales)</span>`);
      if (nuevas.length) li.push(`📝 <b>${nuevas.length}</b> gastos nuevos de “${esc(gName)}”${imp.rows.length - nuevas.length ? ` (${imp.rows.length - nuevas.length} ya estaban)` : ''}${imp.sinFecha ? `, ${imp.sinFecha} sin fecha → hoy` : ''}${imp.sinCat ? `, ${imp.sinCat} sin categoría` : ''}`);
      if (exNew.length) li.push(`🚀 <b>${exNew.length}</b> extras nuevos`);
      if (deNew.length) li.push(`🤝 <b>${deNew.length}</b> deudas nuevas`);
      if (ahorros && (ahorros.base || ahorros.desde)) li.push(`🏦 Ahorros: ${esc(C.fmtEUR(ahorros.base))}${ahorros.desde ? ' desde ' + esc(C.monthLabel(ahorros.desde)) : ''}`);
      const sh = openSheet(`<h3>Importar desde tu Excel</h3><ul style="padding-left:18px;line-height:1.7">${li.map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="small mut">Es seguro repetirlo: lo que ya está importado no se duplica.</p>
        <div class="grid2" style="margin-top:12px"><button class="btn sec" id="imNo">Cancelar</button><button class="btn pri" id="imOk">Importar</button></div>`);
      $('#imNo', sh.el).onclick = () => sh.close();
      $('#imOk', sh.el).onclick = () => {
        if (puedeConfig) {
          setConfig('categorias', piloto.categorias); setConfig('sueldo', piloto.sueldo); setConfig('fijos', piloto.fijos);
          setConfig('suscripciones', piloto.suscripciones); setConfig('tiposExtra', piloto.tiposExtra);
        }
        if (nuevas.length) addGastos(nuevas);
        if (exNew.length) { data.extras.push(...exNew); persistData(); for (let i = 0; i < exNew.length; i += 40) enqueue('addExtra', { rows: exNew.slice(i, i + 40) }); }
        if (deNew.length) setConfig('deudas', (data.config.deudas || []).concat(deNew));
        if (ahorros && (ahorros.base || ahorros.desde)) setConfig('ahorros', ahorros);
        rebuildIndex(); sh.close(); renderAll(); toast('✓ Importado desde tu Excel');
      };
    } catch (e) { toast('No pude leer ese archivo: ' + esc(e.message)); }
  }

  async function exportXlsx() {
    try {
      await loadXLSX();
      const ord = data.gastos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      const toD = (iso) => new Date(iso + 'T12:00:00');
      const g = ord.map((r) => ({ 'Fecha': toD(r.fecha), 'Categoría': r.categoria, 'Importe': r.importe, 'Tipo': r.tipo === C.TIPO_DEV ? r.tipo : 'Gasto', 'Detalle': r.detalle, 'Comercio': r.comercio, 'TicketID': r.ticketId }));
      const lineas = [];
      ord.forEach((r) => { const it = C.parseItems(r.items); if (it) it.l.forEach((l) => lineas.push({ 'Fecha': toD(r.fecha), 'Comercio': (it.t && it.t.c) || r.comercio, 'TicketID': r.ticketId, 'Artículo': l.n, 'Precio': l.p, 'Categoría': l.c })); });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(g, { cellDates: true }), 'Gastos');
      if (data.extras.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.extras.map((e) => ({ 'Fecha': toD(e.fecha), 'Tipo de extra': e.tipo, 'Importe': e.importe, 'Detalle': e.detalle })), { cellDates: true }), 'Extras');
      if (lineas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineas, { cellDates: true }), 'Artículos de tickets');
      XLSX.writeFile(wb, `finanzas_${C.todayISO()}.xlsx`, { cellDates: true });
      toast(`⬇️ Exportados ${g.length} gastos`);
    } catch (e) { toast('No pude exportar: ' + esc(e.message)); }
  }

  /* ================================================================== navegación y eventos */
  function go(view) {
    if (FF.pageOpen && FF.closePage) FF.closePage(true);
    if (FF.pcActive && FF.pcGo) { FF.pcGo(view); return; }
    goMobile(view);
  }
  function goMobile(view) {
    ui.view = view;
    ['home', 'hist', 'res', 'set'].forEach((v) => { $('#v-' + v).hidden = v !== view; });
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.go === view));
    if (view === 'set') renderSettings();
    window.scrollTo(0, 0);
    renderAll();
    if (view === 'home') setTimeout(() => { if (!sheets.length && !('ontouchstart' in window)) $('#amt').focus(); }, 50);
  }

  function renderAll() {
    renderHeader(); setNet();
    if (FF.payFill) FF.payFill();
    $('#onboard').hidden = configured();
    $('#noCats').hidden = !!cats().length;
    if (ui.view === 'home') { renderChips(); renderRecent(); }
    else if (ui.view === 'hist') renderHist();
    else if (ui.view === 'res') { renderResCtl(); renderRes(); }
    else if (ui.view === 'set') settingsStats();
    if ((FF.pcActive || FF.pageOpen) && FF.onRender) FF.onRender();
  }

  function bind() {
    $('#resCtl').addEventListener('click', (e) => {
      const m = e.target.closest('#resSeg button[data-m]'); if (m) { ui.resMode = m.dataset.m; renderResCtl(); renderRes(); return; }
      const y = e.target.closest('button[data-y]'); if (y) { ui.resYear += +y.dataset.y; renderResCtl(); renderRes(); }
    });
    $('#resCtl').addEventListener('change', (e) => {
      if (e.target.id === 'resAll') { ui.resAll = e.target.checked; renderRes(); }
      else if (e.target.id === 'rFrom' && e.target.value) { ui.rFrom = e.target.value; renderRes(); }
      else if (e.target.id === 'rTo' && e.target.value) { ui.rTo = e.target.value; renderRes(); }
    });
    document.addEventListener('click', (e) => { if (e.target.closest('#noCats .js-defcats')) loadDefaultCats(); });
    $('#tabs').onclick = (e) => { const b = e.target.closest('button[data-go]'); if (b) go(b.dataset.go); };
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b && !b.closest('#tabs')) go(b.dataset.go); });
    $('#mPrev').onclick = () => { ui.mk = C.shiftMonth(ui.mk, -1); renderAll(); };
    $('#mNext').onclick = () => { ui.mk = C.shiftMonth(ui.mk, 1); renderAll(); };
    $('#mLabel').onclick = () => { ui.mk = C.monthKey(C.todayISO()); renderAll(); };

    $('#con').addEventListener('input', onConceptInput);
    $('#con').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveQuick(); } });
    $('#amt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#con').focus(); } });
    $('#sug').onclick = (e) => { const b = e.target.closest('button[data-i]'); if (b) chooseSuggestion(ui.suggestions[+b.dataset.i]); };
    $('#chips').onclick = (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const c = ui.chips[+b.dataset.i]; ui.tipo = 'Gasto'; syncSeg(); $('#con').value = c.text; setCat(c.cat, true); $('#sug').innerHTML = ''; $('#amt').placeholder = String(c.importe).replace('.', ','); $('#amt').focus(); };
    $('#catBtn').onclick = async () => { const list = ui.tipo === 'extra' ? (data.config.tiposExtra || []) : cats(); const c = await pickFrom(ui.tipo === 'extra' ? 'Tipo de ingreso extra' : 'Categoría', list, ui.cat); if (c) setCat(c, false); };
    $('#tipoSeg').onclick = (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; ui.tipo = b.dataset.t; setCat(null, false); syncSeg(); $('#catLbl').textContent = ui.tipo === 'extra' ? 'Tipo de ingreso' : 'Categoría'; $('#sug').innerHTML = ''; if (ui.tipo !== 'extra') onConceptInput(); };
    $('#dateBtn').onclick = () => { const d = $('#dateIn'); d.value = ui.fecha || C.todayISO(); if (d.showPicker) { try { d.showPicker(); return; } catch (er) { /* sigue */ } } d.focus(); d.click(); };
    $('#dateIn').onchange = (e) => { ui.fecha = e.target.value && e.target.value !== C.todayISO() ? e.target.value : null; renderDate(); };
    $('#saveBtn').onclick = saveQuick;
    $('#camBtn').onclick = () => $('#camIn').click();
    $('#camIn').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; scanFile(f); };

    document.addEventListener('click', (e) => { const it = e.target.closest('.item[data-id]'); if (it && !e.target.closest('button')) openDetail(it.dataset.id); });
    let qt; $('#q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(renderHist, 120); });
    document.addEventListener('click', (e) => { if (e.target.id === 'more') { ui.histLimit += 60; renderHist(); } });

    ['sUrl', 'sTok', 'sKey', 'sMod', 'sBase'].forEach((id) => $('#' + id).addEventListener('change', saveCfg));
    $('#sTest').onclick = testConn;
    $('#sLink').onclick = shareLink;
    $('#sSync').onclick = async () => { if (!saveCfg()) return; toast((await refresh(true)) ? '🔄 Sincronizado' : '⚠️ No se pudo sincronizar'); };
    $('#xExp').onclick = exportXlsx;
    $('#xImp').onclick = () => $('#xIn').click();
    $('#xIn').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importXlsx(f); };
    $('#dq').addEventListener('input', renderDict);
    $('#dictList').onclick = (e) => { const b = e.target.closest('button[data-del]'); if (!b) return; const k = b.dataset.del; data.diccionario = data.diccionario.filter((d) => d.k !== k); rebuildIndex(); persistData(); enqueue('dictDel', { k }); renderDict(); };
    $('#sClear').onclick = () => { if (confirm('Se borrarán los datos guardados en este dispositivo (no los de tu hoja). ¿Seguir?')) { localStorage.removeItem(LS.data); localStorage.removeItem(LS.queue); location.reload(); } };

    window.addEventListener('online', () => { ui.net = 'idle'; refresh(false); });
    window.addEventListener('offline', () => { ui.net = 'offline'; setNet(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
    setInterval(() => { if (!document.hidden) refresh(false); }, 30000);
  }
  function syncSeg() { $$('#tipoSeg button').forEach((b) => b.classList.toggle('on', b.dataset.t === ui.tipo)); }

  /* ================================================================== arranque */
  function init() {
    bind(); renderSettings(); renderDate(); renderAll(); applyHashConfig();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (configured()) refresh(true); else go('home');
    if (new URLSearchParams(location.search).get('cam') === '1') setTimeout(() => $('#camIn').click(), 300);
    /* OJO: data/cfg/index/queue se REASIGNAN (p. ej. al sincronizar con la hoja). Con Object.assign y un "get" se copiaría el valor del momento
       y las pantallas de pc.js verían datos viejos para siempre: deben ser accesos EN VIVO. */
    Object.defineProperties(FF, {
      data: { get: () => data, enumerable: true }, cfg: { get: () => cfg, enumerable: true },
      index: { get: () => index, enumerable: true }, queue: { get: () => queue, enumerable: true },
    });
    Object.assign(FF, { ui, enqueue, addGastos, addExtraRow, delExtra, delGasto,
      learn, persist: persistData, openSheet, pickCategory, scan: scanFile, toast, esc, cats, openDetail, goMobile, renderAll, refresh, flush, rebuildIndex, loadDefaultCats,
      shareLink, exportXlsx, importXlsx, renderSettings, configured, setConfig, diagnose, defaultCats: DEFAULT_CATS.slice(), loadXLSX: () => loadXLSX() });
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__ff = { get data() { return data; }, get queue() { return queue; }, get cfg() { return cfg; }, ui, refresh, flush, go, renderAll, scan: scanFile, save: saveCfg };
  }
  init();
})();
