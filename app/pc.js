/* Finanzas App · vista de escritorio (parecida a tu Excel). Se activa sola en pantallas anchas; en el móvil no cambia nada.
   Usa los mismos datos y la misma lógica que la vista móvil (window.FF las expone desde app.js). */
(function () {
  'use strict';
  const C = window.Core;
  const FF = window.FF;
  if (!FF || !FF.ui) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => FF.esc(s);
  const fmt = (n) => C.fmtEUR(n);
  const mq = window.matchMedia('(min-width: 1000px)');
  const KEY = 'ff.layout';
  let pref = 'auto';
  try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { /* sin almacenamiento */ }
  let view = 'cmd';
  let pending = false;
  const st = { gMes: null, gQ: '', gLimit: 150, anio: new Date().getFullYear(), q: { imp: '', con: '', fec: '', tipo: 'Gasto', cat: '', auto: false }, x: { fec: '', tipo: '', imp: '', det: '' } };
  const data = () => FF.data;
  const cats = () => FF.cats();
  const hoy = () => C.todayISO();
  const active = () => pref === 'pc' || (pref === 'auto' && mq.matches);
  const mesCorto = (m) => C.MESES[m - 1].slice(0, 3);

  /* ------------------------------------------------------------------ estructura */
  const nav = document.createElement('aside');
  nav.id = 'pcNav'; nav.hidden = true;
  nav.innerHTML = `<div class="pc-logo">💰 Finanzas</div>
    <button data-v="cmd">📊 Centro de Mando</button>
    <button data-v="gastos">📝 Gastos</button>
    <button data-v="extras">🚀 Extras</button>
    <button data-v="anio">📅 Resumen del Año</button>
    <button data-v="ajustes">⚙️ Ajustes</button>
    <div class="pc-foot"><span id="pcSync" class="chip">…</span><button id="pcToMobile" class="pc-link" type="button">📱 Ver como móvil</button></div>`;
  const pcMain = document.createElement('section');
  pcMain.id = 'pcMain'; pcMain.hidden = true;
  document.body.append(nav, pcMain);

  function apply() {
    const on = active();
    FF.pcActive = on;
    document.body.classList.toggle('pc', on);
    nav.hidden = !on;
    const main = $('main');
    if (on) {
      pcMain.hidden = view === 'ajustes';
      main.hidden = view !== 'ajustes';
      if (view === 'ajustes') FF.goMobile('set');
      $$('#pcNav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
      render();
    } else {
      pcMain.hidden = true; main.hidden = false;
      FF.goMobile(FF.ui.view || 'home');
    }
    syncLayoutSelect();
  }

  const MAP = { home: 'cmd', hist: 'gastos', res: 'anio', set: 'ajustes' };
  FF.pcGo = (v) => { view = MAP[v] || v; apply(); window.scrollTo(0, 0); };
  FF.onNet = (t, k) => { const c = $('#pcSync'); if (c) { c.textContent = t; c.className = 'chip ' + k; } };
  FF.onRender = () => {
    if (view === 'ajustes') return;
    const a = document.activeElement;
    if (a && pcMain.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { pending = true; return; }   // no interrumpir mientras escribes
    render();
  };
  document.addEventListener('focusout', () => { if (pending) setTimeout(() => { const a = document.activeElement; if (!(a && pcMain.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) { pending = false; if (FF.pcActive && view !== 'ajustes') render(); } }, 120); });
  mq.addEventListener('change', apply);

  /* ------------------------------------------------------------------ piezas comunes */
  const semaforo = (m) => {
    const col = { verde: 'var(--acc)', amarillo: 'var(--warn)', rojo: 'var(--bad)', vacio: 'var(--line)' }[m.semaforo];
    const msg = { vacio: '⏳ Sin datos todavía: configura tu sueldo en la hoja', rojo: m.queda < 0 ? `🚨 ¡TE QUEDAS SIN PASTA! Te pasas ${fmt(-m.queda)}` : '🚨 ¡TE QUEDAS SIN PASTA!',
      amarillo: `⚠️ Ojo: te queda menos del 20% del sueldo (${Math.round(m.pctLibre * 100)}%)`, verde: `✅ Vas sobrado: te queda el ${Math.round(m.pctLibre * 100)}% del sueldo` }[m.semaforo];
    const w = m.semaforo === 'vacio' ? 0 : Math.max(2, Math.min(100, m.pctLibre * 100));
    return `<div class="pc-bat"><div class="pc-batbar"><i style="width:${w.toFixed(1)}%;background:${col}"></i></div><div class="pc-batmsg" style="color:${m.semaforo === 'vacio' ? 'var(--mut)' : col}">${esc(msg)}</div></div>`;
  };

  function yearsList() {
    const set = new Set([new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]);
    data().gastos.forEach((g) => { if (g.fecha) set.add(+g.fecha.slice(0, 4)); });
    data().extras.forEach((g) => { if (g.fecha) set.add(+g.fecha.slice(0, 4)); });
    return [...set].sort((a, b) => a - b);
  }

  const monthSelect = () => {
    const [Y, M] = FF.ui.mk.split('-').map(Number);
    return `<select id="pcMes" class="t pc-sel">${C.MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === M ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select id="pcAnio" class="t pc-sel">${yearsList().map((y) => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
  };

  const head = (titulo, extra = '') => `<div class="pc-h"><h1>${titulo}</h1><div class="pc-hr">${extra}</div></div>`;

  /** gasto / devolución por categoría de un mes (para el desglose estilo Excel) */
  function catRows(mk, m) {
    const g = {};
    data().gastos.forEach((x) => {
      if (C.monthKey(x.fecha) !== mk) return;
      const b = g[x.categoria] || (g[x.categoria] = { g: 0, d: 0 });
      if (x.tipo === C.TIPO_DEV) b.d += x.importe; else b.g += x.importe;
    });
    const fijoBy = {};
    m.filas.forEach((f) => { fijoBy[f.cat] = f.fijo; });
    const nombres = cats().slice();
    Object.keys(g).forEach((n) => { if (!nombres.includes(n)) nombres.push(n); });
    const all = nombres.map((n) => { const b = g[n] || { g: 0, d: 0 }, fijo = fijoBy[n] || 0; return { cat: n, fijo, gasto: C.r2(b.g), dev: C.r2(b.d), neto: C.r2(fijo + b.g - b.d) }; });
    const tot = all.reduce((a, r) => ({ fijo: a.fijo + r.fijo, gasto: a.gasto + r.gasto, dev: a.dev + r.dev, neto: a.neto + r.neto }), { fijo: 0, gasto: 0, dev: 0, neto: 0 });
    return { all, tot: { fijo: C.r2(tot.fijo), gasto: C.r2(tot.gasto), dev: C.r2(tot.dev), neto: C.r2(tot.neto) } };
  }

  /* ------------------------------------------------------------------ 📊 CENTRO DE MANDO */
  function quickBar() {
    const q = st.q, extra = q.tipo === 'extra';
    const lista = extra ? (data().config.tiposExtra || []) : cats();
    return `<div class="card pc-quick">
      <div class="pc-qrow">
        <div><label class="f">Importe</label><input id="qImp" class="t" inputmode="decimal" placeholder="0,00" value="${esc(q.imp)}" autocomplete="off" style="text-align:right;font-weight:700"></div>
        <div class="pc-grow"><label class="f">Concepto</label><input id="qCon" class="t" list="qDl" placeholder="café, gasolina, figurita…" value="${esc(q.con)}" autocomplete="off"><datalist id="qDl"></datalist></div>
        <div class="pc-grow"><label class="f">${extra ? 'Tipo de ingreso' : 'Categoría'} ${q.auto ? '<span class="badge">auto ✨</span>' : ''}</label>
          <select id="qCat" class="t"><option value="">— elige —</option>${lista.map((c) => `<option ${c === q.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div><label class="f">Tipo</label><select id="qTipo" class="t"><option value="Gasto" ${q.tipo === 'Gasto' ? 'selected' : ''}>Gasto</option><option value="${C.TIPO_DEV}" ${q.tipo === C.TIPO_DEV ? 'selected' : ''}>↩ Devolución</option><option value="extra" ${extra ? 'selected' : ''}>＋ Ingreso extra</option></select></div>
        <div><label class="f">Fecha</label><input id="qFec" type="date" class="t" value="${esc(q.fec || hoy())}"></div>
        <div class="pc-btns"><button class="btn pri" id="qSave" type="button">💾 Guardar</button><button class="btn cam" id="qCam" type="button" title="Escanear un ticket con IA">📷</button></div>
      </div>
      <input type="file" id="pcCam" accept="image/*" hidden>
    </div>`;
  }

  function cmdView() {
    const mk = FF.ui.mk, m = C.computeMonth(data(), mk), cr = catRows(mk, m);
    const ex = {};
    data().extras.filter((e) => C.monthKey(e.fecha) === mk).forEach((e) => { ex[e.tipo || 'Sin tipo'] = (ex[e.tipo || 'Sin tipo'] || 0) + e.importe; });
    const tipos = (data().config.tiposExtra || []).slice();
    Object.keys(ex).forEach((t) => { if (!tipos.includes(t)) tipos.push(t); });
    const totalSale = cr.tot.neto > 0 ? cr.tot.neto : 0;
    return head('📊 Centro de Mando', monthSelect()) + `
      <div class="pc-cards">
        <div class="pc-card g"><div class="l">💵 ENTRA (sueldo + extras)</div><div class="v">${esc(fmt(m.entra))}</div><div class="s">Sueldo ${esc(fmt(m.sueldo))} + extras ${esc(fmt(m.extras))}</div></div>
        <div class="pc-card o"><div class="l">💸 SALE (fijos + suscripciones + día a día)</div><div class="v">${esc(fmt(m.sale))}</div><div class="s">Fijos ${esc(fmt(m.fijos))} + día a día ${esc(fmt(m.dia))}</div></div>
        <div class="pc-card b"><div class="l">🔥 ME QUEDA LIBRE</div><div class="v" style="${m.queda < 0 ? 'color:var(--bad)' : ''}">${esc(fmt(m.queda))}</div><div class="s">Lo que entra menos lo que sale</div></div>
      </div>
      ${semaforo(m)}
      ${quickBar()}
      <div class="pc-grid2">
        <div class="card"><h2>1 · Lo que entra este mes</h2>
          <table class="tbl"><thead><tr><th>Concepto</th><th class="r">Importe</th></tr></thead><tbody>
            <tr><td>💵 Mi sueldo del mes</td><td class="r">${esc(fmt(m.sueldo))}</td></tr>
            ${tipos.map((t) => `<tr><td>${esc(t)}</td><td class="r">${esc(fmt(ex[t] || 0))}</td></tr>`).join('')}
            <tr class="tot"><td>💰 TOTAL QUE ENTRA</td><td class="r">${esc(fmt(m.entra))}</td></tr></tbody></table></div>
        <div class="card"><h2>2 · Lo que sale este mes, por categorías</h2>
          <table class="tbl"><thead><tr><th>Categoría</th><th class="r">⚙️ Fijo</th><th class="r">📝 Día a día</th><th class="r">🔄 Devol.</th><th class="r">Gasto neto</th><th class="r">%</th></tr></thead><tbody>
            ${cr.all.map((r) => { const z = !r.fijo && !r.gasto && !r.dev; return `<tr class="${z ? 'zero' : ''}"><td>${esc(r.cat)}</td><td class="r">${esc(fmt(r.fijo))}</td><td class="r">${esc(fmt(r.gasto))}</td><td class="r">${esc(fmt(r.dev))}</td>
              <td class="r nb"><span class="nbar" style="width:${totalSale > 0 && r.neto > 0 ? Math.min(100, (r.neto / totalSale) * 100 * 1.6).toFixed(1) : 0}%"></span><b>${esc(fmt(r.neto))}</b></td><td class="r mut">${totalSale > 0 && r.neto > 0 ? Math.round((r.neto / totalSale) * 100) + '%' : ''}</td></tr>`; }).join('')}
            <tr class="tot"><td>TOTAL QUE SALE</td><td class="r">${esc(fmt(cr.tot.fijo))}</td><td class="r">${esc(fmt(cr.tot.gasto))}</td><td class="r">${esc(fmt(cr.tot.dev))}</td><td class="r">${esc(fmt(cr.tot.neto))}</td><td></td></tr></tbody></table></div>
      </div>`;
  }

  /* ------------------------------------------------------------------ 📝 GASTOS (tabla editable) */
  function mesesConDatos() {
    const s = new Set([C.monthKey(hoy()), FF.ui.mk]);
    data().gastos.forEach((g) => { if (g.fecha) s.add(C.monthKey(g.fecha)); });
    return [...s].sort().reverse();
  }

  function gastosFiltrados() {
    const mes = st.gMes || FF.ui.mk;
    const q = C.norm(st.gQ);
    let lista = data().gastos.slice();
    if (mes !== 'todos') lista = lista.filter((g) => C.monthKey(g.fecha) === mes);
    if (q) lista = C.searchGastos(lista, st.gQ).map((r) => r.g);
    return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }

  const sumaNeta = (l) => C.r2(l.reduce((a, g) => a + (g.tipo === C.TIPO_DEV ? -g.importe : g.importe), 0));

  function gastoRow(g) {
    const opts = cats().includes(g.categoria) || !g.categoria ? cats() : cats().concat([g.categoria]);
    const t = g.items ? C.parseItems(g.items) : null;
    return `<tr data-row="${esc(g.id)}" class="${g.tipo === C.TIPO_DEV ? 'dev' : ''}">
      <td><input type="date" class="cell" data-id="${esc(g.id)}" data-f="fecha" value="${esc(g.fecha)}"></td>
      <td><select class="cell" data-id="${esc(g.id)}" data-f="categoria">${g.categoria ? '' : '<option value="">— sin categoría —</option>'}${opts.map((c) => `<option ${c === g.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
      <td><input type="number" step="0.01" min="0" class="cell r" data-id="${esc(g.id)}" data-f="importe" value="${g.importe}"></td>
      <td><select class="cell" data-id="${esc(g.id)}" data-f="tipo"><option value="Gasto" ${g.tipo !== C.TIPO_DEV ? 'selected' : ''}>Gasto</option><option value="${C.TIPO_DEV}" ${g.tipo === C.TIPO_DEV ? 'selected' : ''}>↩ Devolución</option></select></td>
      <td><input type="text" class="cell" data-id="${esc(g.id)}" data-f="detalle" value="${esc(g.detalle)}"></td>
      <td class="acc">${t ? `<button class="ib" data-tk="${esc(g.id)}" title="Ver el ticket desglosado">🧾</button>` : ''}<button class="ib" data-del="${esc(g.id)}" title="Eliminar">🗑</button></td></tr>`;
  }

  function gastosView() {
    const mes = st.gMes || FF.ui.mk, lista = gastosFiltrados(), vis = lista.slice(0, st.gLimit);
    const opts = ['todos'].concat(mesesConDatos());
    return head('📝 Gastos', `<select id="gMes" class="t pc-sel">${opts.map((o) => `<option value="${o}" ${o === mes ? 'selected' : ''}>${o === 'todos' ? 'Todos los meses' : C.monthLabel(o)}</option>`).join('')}</select>
      <input id="gQ" class="t pc-sel" type="search" placeholder="🔎 Buscar (también dentro de tickets)" value="${esc(st.gQ)}" style="min-width:260px">`) + `
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl grid"><thead><tr><th style="width:140px">Fecha</th><th style="min-width:260px">Categoría</th><th class="r" style="width:120px">Importe €</th><th style="width:140px">Tipo</th><th>Detalle</th><th style="width:90px"></th></tr></thead>
        <tbody>
          <tr class="newrow"><td><input type="date" class="cell" id="nFec" value="${esc(st.q.fec || hoy())}"></td>
            <td><select class="cell" id="nCat"><option value="">— categoría —</option>${cats().map((c) => `<option>${esc(c)}</option>`).join('')}</select></td>
            <td><input type="number" step="0.01" min="0" class="cell r" id="nImp" placeholder="0,00"></td>
            <td><select class="cell" id="nTipo"><option value="Gasto">Gasto</option><option value="${C.TIPO_DEV}">↩ Devolución</option></select></td>
            <td><input type="text" class="cell" id="nDet" placeholder="Detalle (Enter para guardar)"></td>
            <td class="acc"><button class="ib add" id="nAdd" title="Añadir">＋</button></td></tr>
          ${vis.map(gastoRow).join('') || '<tr><td colspan="6" class="empty">Sin gastos en este periodo.</td></tr>'}
        </tbody>
        <tfoot><tr class="tot"><td colspan="2">${lista.length} gasto${lista.length === 1 ? '' : 's'}${lista.length > vis.length ? ` (se muestran ${vis.length})` : ''}</td><td class="r" id="gTot">${esc(fmt(sumaNeta(lista)))}</td><td colspan="3" class="mut">Total neto (restando devoluciones)</td></tr></tfoot></table>
      </div>
      ${lista.length > vis.length ? '<button class="btn sec" id="gMore" style="margin-top:12px;max-width:260px">Ver más</button>' : ''}`;
  }

  /* ------------------------------------------------------------------ 🚀 EXTRAS */
  function extrasView() {
    const lista = data().extras.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const tipos = data().config.tiposExtra || [];
    return head('🚀 Extras', '') + `<div class="card" style="padding:0;overflow:auto"><table class="tbl grid"><thead><tr><th style="width:140px">Fecha</th><th style="min-width:240px">Tipo de extra</th><th class="r" style="width:130px">Importe €</th><th>Detalle</th><th style="width:60px"></th></tr></thead><tbody>
      <tr class="newrow"><td><input type="date" class="cell" id="xFec" value="${esc(st.x.fec || hoy())}"></td>
        <td><select class="cell" id="xTipo"><option value="">— tipo —</option>${tipos.map((t) => `<option>${esc(t)}</option>`).join('')}</select></td>
        <td><input type="number" step="0.01" min="0" class="cell r" id="xImp" placeholder="0,00"></td>
        <td><input type="text" class="cell" id="xDet" placeholder="Detalle (Enter para guardar)"></td>
        <td class="acc"><button class="ib add" id="xAdd" title="Añadir">＋</button></td></tr>
      ${lista.map((e) => `<tr><td>${esc(e.fecha)}</td><td>${esc(e.tipo)}</td><td class="r">${esc(fmt(e.importe))}</td><td>${esc(e.detalle)}</td><td class="acc"><button class="ib" data-xdel="${esc(e.id)}" title="Eliminar">🗑</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aún no hay extras.</td></tr>'}
      </tbody><tfoot><tr class="tot"><td colspan="2">${lista.length} extra${lista.length === 1 ? '' : 's'}</td><td class="r">${esc(fmt(C.r2(lista.reduce((a, e) => a + e.importe, 0))))}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  }

  /* ------------------------------------------------------------------ 📅 RESUMEN DEL AÑO */
  function anioView() {
    const Y = st.anio, hoyMk = C.monthKey(hoy());
    const meses = Array.from({ length: 12 }, (_, i) => `${Y}-${String(i + 1).padStart(2, '0')}`);
    const ms = meses.map((mk) => C.computeMonth(data(), mk));
    const apart = (m) => m.filas.filter((f) => /inversi|colch/i.test(f.cat)).reduce((a, f) => a + f.total, 0);
    const filas = [
      ['💵 Mi sueldo', (m) => m.sueldo, ''], ['🚀 Dinero extra', (m) => m.extras, ''], ['💰 TOTAL QUE ENTRA', (m) => m.entra, 'tot g'],
      ['⚙️ Gastos fijos', (m) => m.fijos - m.subs, ''], ['🎮 Suscripciones', (m) => m.subs, ''], ['📝 Día a día (menos devoluciones)', (m) => m.dia, ''],
      ['💸 TOTAL QUE SALE', (m) => m.sale, 'tot o'], ['🔥 ME QUEDA LIBRE', (m) => m.queda, 'tot b'], ['💪 Apartado (inversión + ahorro)', apart, 'ap'],
    ];
    const celda = (v, mk, neg) => `<td class="r ${mk > hoyMk ? 'fut' : ''}" ${neg && v < 0 ? 'style="color:var(--bad);font-weight:700"' : ''}>${v === 0 ? '<span class="mut">–</span>' : esc(fmt(v))}</td>`;
    const totalAnio = ms.reduce((a, m) => a + m.sale, 0);
    return head('📅 Resumen del Año', `<button class="nav-btn" data-y="-1" aria-label="Año anterior">‹</button><b style="min-width:60px;text-align:center;font-size:20px">${Y}</b><button class="nav-btn" data-y="1" aria-label="Año siguiente">›</button>`) + `
      <div class="card" style="padding:0;overflow:auto"><table class="tbl yr"><thead><tr><th style="min-width:250px">Concepto</th>${meses.map((mk, i) => `<th class="r">${mesCorto(i + 1)}</th>`).join('')}<th class="r">TOTAL ${Y}</th></tr></thead><tbody>
        ${filas.map(([n, f, cls]) => `<tr class="${cls}"><td>${esc(n)}</td>${ms.map((m, i) => celda(C.r2(f(m)), meses[i], cls.includes('b'))).join('')}<td class="r"><b>${esc(fmt(C.r2(ms.reduce((a, m) => a + f(m), 0))))}</b></td></tr>`).join('')}
      </tbody></table></div>
      <div class="small mut" style="margin:8px 4px 16px">Los meses futuros (en cursiva) son una previsión: repiten tu sueldo y tus gastos fijos.</div>
      <div class="card" style="padding:0;overflow:auto"><div style="padding:14px 14px 0"><h2>🧾 Gasto por categoría en el año</h2></div><table class="tbl yr"><thead><tr><th style="min-width:250px">Categoría</th>${meses.map((mk, i) => `<th class="r">${mesCorto(i + 1)}</th>`).join('')}<th class="r">TOTAL</th><th class="r">%</th></tr></thead><tbody>
        ${(() => {
    const nombres = cats().slice(); ms.forEach((m) => m.filas.forEach((f) => { if (!nombres.includes(f.cat)) nombres.push(f.cat); }));
    return nombres.map((n) => {
      const vals = ms.map((m) => { const f = m.filas.find((x) => x.cat === n); return f ? f.total : 0; });
      const tot = C.r2(vals.reduce((a, b) => a + b, 0));
      return `<tr class="${tot === 0 ? 'zero' : ''}"><td>${esc(n)}</td>${vals.map((v, i) => celda(C.r2(v), meses[i], false)).join('')}<td class="r"><b>${esc(fmt(tot))}</b></td><td class="r mut">${totalAnio > 0 && tot > 0 ? Math.round((tot / totalAnio) * 100) + '%' : ''}</td></tr>`;
    }).join('');
  })()}
        <tr class="tot"><td>TOTAL QUE SALE</td>${ms.map((m, i) => celda(m.sale, meses[i], false)).join('')}<td class="r">${esc(fmt(C.r2(totalAnio)))}</td><td></td></tr></tbody></table></div>`;
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    if (!FF.pcActive || view === 'ajustes') return;
    $$('#pcNav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    const keepScroll = window.scrollY;
    pcMain.innerHTML = { cmd: cmdView, gastos: gastosView, extras: extrasView, anio: anioView }[view]();
    if (view === 'cmd') { fillDatalist(); }
    window.scrollTo(0, keepScroll);
  }

  function fillDatalist() {
    const dl = $('#qDl'); if (!dl) return;
    dl.innerHTML = C.suggest(st.q.con, data().gastos, FF.index, 8).map((s) => `<option value="${esc(s.text)}">${esc((s.cat || '').slice(0, 30))}</option>`).join('');
  }

  /* ------------------------------------------------------------------ acciones */
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); }

  function quickSave() {
    const q = st.q, imp = C.parseAmount(q.imp), fecha = q.fec || hoy(), extra = q.tipo === 'extra', concept = (q.con || '').trim();
    if (imp == null || imp <= 0) { shake($('#qImp')); FF.toast('Pon un importe mayor que 0'); return; }
    if (!q.cat) { shake($('#qCat')); FF.toast(extra ? 'Elige el tipo de ingreso' : 'Elige una categoría'); return; }
    if (extra) {
      FF.addExtraRow({ id: C.uuid(), fecha, tipo: q.cat, importe: imp, detalle: concept });
      FF.toast(`💵 Extra guardado · Te quedan <b>${esc(fmt(C.computeMonth(data(), C.monthKey(fecha)).queda))}</b>`);
    } else {
      const row = { id: C.uuid(), fecha, categoria: q.cat, importe: imp, tipo: q.tipo, detalle: concept, comercio: '', items: '', ticketId: '', origen: 'app' };
      FF.addGastos([row]);
      if (concept) FF.learn(concept, q.cat);
      FF.toast(`✓ Guardado · Te quedan <b>${esc(fmt(C.computeMonth(data(), C.monthKey(fecha)).queda))}</b>`, { label: 'Deshacer', fn: () => { FF.delGasto(row.id); FF.renderAll(); } });
    }
    Object.assign(st.q, { imp: '', con: '', fec: '', cat: '', auto: false, tipo: extra ? 'Gasto' : q.tipo });
    if (C.monthKey(fecha) !== FF.ui.mk) FF.ui.mk = C.monthKey(fecha);
    pending = false; FF.renderAll();
    setTimeout(() => { const i = $('#qImp'); if (i) i.focus(); }, 30);
  }

  function nuevaFila() {
    const imp = C.parseAmount($('#nImp').value), cat = $('#nCat').value, fecha = $('#nFec').value || hoy();
    if (imp == null || imp <= 0) { shake($('#nImp')); return; }
    if (!cat) { shake($('#nCat')); FF.toast('Elige una categoría'); return; }
    const row = { id: C.uuid(), fecha, categoria: cat, importe: imp, tipo: $('#nTipo').value, detalle: $('#nDet').value.trim(), comercio: '', items: '', ticketId: '', origen: 'app' };
    FF.addGastos([row]); if (row.detalle) FF.learn(row.detalle, cat);
    FF.toast('✓ Gasto añadido'); pending = false; FF.renderAll();
    setTimeout(() => { const i = $('#nImp'); if (i) i.focus(); }, 30);
  }

  function nuevoExtra() {
    const imp = C.parseAmount($('#xImp').value), tipo = $('#xTipo').value;
    if (imp == null || imp <= 0) { shake($('#xImp')); return; }
    if (!tipo) { shake($('#xTipo')); return; }
    FF.addExtraRow({ id: C.uuid(), fecha: $('#xFec').value || hoy(), tipo, importe: imp, detalle: $('#xDet').value.trim() });
    FF.toast('✓ Extra añadido'); pending = false; FF.renderAll();
  }

  function editarCampo(el) {
    const g = data().gastos.find((x) => x.id === el.dataset.id), f = el.dataset.f;
    if (!g) return;
    let v = el.value;
    if (f === 'importe') { const n = C.parseAmount(v); if (!(n > 0)) { el.value = g.importe; FF.toast('Importe no válido'); return; } v = n; }
    if (f === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { el.value = g.fecha; return; }
    if (f === 'categoria' && !v) { el.value = g.categoria; return; }
    g[f] = v; FF.persist(); FF.enqueue('update', { id: g.id, fields: { [f]: v } });
    if (f === 'categoria' && g.detalle) FF.learn(g.detalle, v);
    const tr = el.closest('tr'); if (tr && f === 'tipo') tr.classList.toggle('dev', v === C.TIPO_DEV);
    const t = $('#gTot'); if (t) t.textContent = fmt(sumaNeta(gastosFiltrados()));
    FF.toast('✓ Cambio guardado');
  }

  /* ------------------------------------------------------------------ eventos (delegados) */
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) { view = b.dataset.v; apply(); window.scrollTo(0, 0); return; }
    if (e.target.closest('#pcToMobile')) { setPref('mobile'); }
  });

  pcMain.addEventListener('click', (e) => {
    if (e.target.closest('#qSave')) return quickSave();
    if (e.target.closest('#qCam')) return $('#pcCam').click();
    if (e.target.closest('#nAdd')) return nuevaFila();
    if (e.target.closest('#xAdd')) return nuevoExtra();
    if (e.target.closest('#gMore')) { st.gLimit += 150; return render(); }
    const y = e.target.closest('button[data-y]'); if (y) { st.anio += +y.dataset.y; return render(); }
    const tk = e.target.closest('[data-tk]'); if (tk) return FF.openDetail(tk.dataset.tk);
    const del = e.target.closest('[data-del]');
    if (del) { if (confirm('¿Eliminar este gasto?')) { FF.delGasto(del.dataset.del); FF.toast('Eliminado'); pending = false; FF.renderAll(); } return; }
    const xd = e.target.closest('[data-xdel]');
    if (xd && confirm('¿Eliminar este extra?')) { FF.delExtra(xd.dataset.xdel); pending = false; FF.renderAll(); }
  });

  pcMain.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'pcMes' || t.id === 'pcAnio') { const m = $('#pcMes').value.padStart(2, '0'), y = $('#pcAnio').value; FF.ui.mk = `${y}-${m}`; pending = false; FF.renderAll(); return; }
    if (t.id === 'gMes') { st.gMes = t.value; st.gLimit = 150; pending = false; return render(); }
    if (t.id === 'qFec') { st.q.fec = t.value; return; }
    if (t.id === 'qTipo') { st.q.tipo = t.value; st.q.cat = ''; st.q.auto = false; pending = false; return render(); }
    if (t.id === 'qCat') { st.q.cat = t.value; st.q.auto = false; return; }
    if (t.id === 'pcCam') { const f = t.files[0]; t.value = ''; if (f) FF.scan(f); return; }
    if (t.dataset && t.dataset.id && t.dataset.f) editarCampo(t);
  });

  pcMain.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'qImp') st.q.imp = t.value;
    else if (t.id === 'qCon') {
      st.q.con = t.value; fillDatalist();
      if (st.q.tipo !== 'extra' && (st.q.auto || !st.q.cat)) {
        let p = C.predictCategory(t.value, FF.index, cats());
        if (!p && C.norm(t.value).length >= 3) { const s = C.suggest(t.value, data().gastos, FF.index, 1)[0]; if (s && cats().includes(s.cat)) p = { cat: s.cat }; }
        if (p) { st.q.cat = p.cat; st.q.auto = true; } else if (st.q.auto) { st.q.cat = ''; st.q.auto = false; }
        const sel = $('#qCat'); if (sel) sel.value = st.q.cat;
        const lbl = sel && sel.previousElementSibling; if (lbl) lbl.innerHTML = `Categoría ${st.q.auto ? '<span class="badge">auto ✨</span>' : ''}`;
      }
    } else if (t.id === 'gQ') { st.gQ = t.value; clearTimeout(input.t); input.t = setTimeout(() => { pending = false; const pos = t.selectionStart; render(); const n = $('#gQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 180); }
  });
  const input = {};

  pcMain.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const id = e.target.id;
    if (id === 'qImp' || id === 'qCon' || id === 'qFec') { e.preventDefault(); if (id === 'qImp' && !st.q.con) { $('#qCon').focus(); return; } quickSave(); }
    else if (id === 'nDet' || id === 'nImp') { e.preventDefault(); nuevaFila(); }
    else if (id === 'xDet' || id === 'xImp') { e.preventDefault(); nuevoExtra(); }
  });

  /* ------------------------------------------------------------------ preferencia de vista (Ajustes) */
  function setPref(p) { pref = p; try { localStorage.setItem(KEY, p); } catch (e) { /* nada */ } apply(); }
  function syncLayoutSelect() { const s = $('#sLayout'); if (s) s.value = pref; }
  (function injectSetting() {
    const host = $('#v-set'); if (!host) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>Vista</h2><select id="sLayout" class="t"><option value="auto">Automática (escritorio en pantallas anchas)</option><option value="pc">Siempre escritorio</option><option value="mobile">Siempre móvil</option></select>
      <p class="small mut" style="margin:10px 0 0">La vista de escritorio muestra tu Centro de Mando, la tabla de gastos editable y el resumen del año, parecido a tu Excel.</p>`;
    host.insertBefore(card, host.firstElementChild);
    $('#sLayout', card).addEventListener('change', (e) => setPref(e.target.value));
  })();

  apply();
})();
