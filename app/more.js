/* Finanzas App · guía "Empieza aquí", gráficos, candado con PIN y copia de seguridad.
   Se apoya en window.FF (app.js) y en las páginas de pc.js; funciona igual en modo avanzado y en la vista simplificada. */
(function () {
  'use strict';
  const C = window.Core;
  const FF = window.FF;
  if (!FF || !FF.ui || !FF.openPage) return;
  const esc = FF.esc;
  const fmt = (n) => C.fmtEUR(n);
  const $ = (s, r = document) => r.querySelector(s);
  const hoy = () => C.todayISO();
  const data = () => FF.data;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const corto = (n) => String(n).replace(/\s*\(.*$/, '');
  const pcMain = $('#pcMain');
  const st = { gy: new Date().getFullYear() };

  const toSettings = () => { if (FF.pcActive) FF.pcGo('set'); else { if (FF.closePage) FF.closePage(true); FF.goMobile('set'); } };
  const head = (t) => `${FF.pageOpen ? '<button class="pc-back" id="pcBack" type="button">← Volver a Ajustes</button>' : ''}<div class="pc-h"><h1>${t}</h1></div>`;

  /* ------------------------------------------------------------------ 📖 EMPIEZA AQUÍ */
  function guiaView() {
    const d = data(), cfg = d.config || {}, cats = (cfg.categorias || []);
    const pasos = [
      { ok: FF.configured(), t: 'Conecta tu hoja de Google', s: 'Así tus datos están en tu móvil y en tu PC a la vez, y no se pierden. Puedes empezar sin conectar: funciona en este dispositivo.', btn: ['Ajustes', 'set'] },
      { ok: (cfg.sueldo || []).length > 0 && cats.length > 0, t: 'Pon tu sueldo y tus gastos fijos', s: 'En el Piloto Automático: tu sueldo, el alquiler, la luz… lo que se repite cada mes. También puedes importar tu Excel entero desde Ajustes.', btn: ['Abrir el Piloto', 'piloto'] },
      { ok: (cfg.suscripciones || []).length > 0, t: 'Apunta tus suscripciones', s: 'Mensuales, trimestrales, anuales o cada N meses, y compartidas: solo cuenta tu parte. La app te avisa de los próximos cobros.', btn: ['Abrir el Piloto', 'piloto'] },
      { ok: d.gastos.length > 0, t: 'Apunta tu primer gasto', s: 'Importe, concepto y listo (3 segundos). Al escribir “caf” o “gasol” elige la categoría sola y aprende de tus correcciones.', btn: ['Ir a Centro de Mando', 'cmd'] },
      { ok: !!(FF.cfg && FF.cfg.gKey), t: 'Activa el escáner de tickets', s: 'Haz foto a un ticket y la IA lo desglosa artículo por artículo. Necesita tu clave de Gemini (gratis para empezar) en Ajustes.', btn: ['Ajustes', 'set'] },
      { ok: cats.some((c) => c && c.presupuesto > 0), t: 'Ponle presupuesto a una categoría', s: 'Por ejemplo 150 € de Ocio: te avisa al llegar al 80 % y al pasarte.', btn: ['Abrir el Piloto', 'piloto'] },
      { ok: !!(cfg.ahorros && cfg.ahorros.desde), t: 'Cuenta tus ahorros', s: 'Dile cuánto tienes hoy y desde qué mes cuentas: crecen solos con lo que te sobra, y pasan al año siguiente. Crea metas con barra de progreso.', btn: ['Ver Ahorros', 'ahorros'] },
      { ok: !!lsGet('ff.pin') || !!lsGet('ff.lastBackup'), t: 'Protege y respalda', s: 'Un PIN para que nadie cotillee y una copia de seguridad descargable (Ajustes).', btn: ['Ajustes', 'set'] },
    ];
    const hechos = pasos.filter((p) => p.ok).length;
    const bloque = (t, h) => `<div class="card"><h2>${t}</h2>${h}</div>`;
    return head('📖 Empieza aquí') + `
      <div class="card"><div class="kv" style="padding:0"><span><b>Tu progreso</b></span><b>${hechos} de ${pasos.length}</b></div><div class="goalbar" style="margin-top:8px"><i style="width:${(hechos / pasos.length * 100).toFixed(0)}%"></i></div>
        <div class="small mut" style="margin-top:6px">${hechos === pasos.length ? '🎉 ¡Lo tienes todo configurado!' : 'Sin prisa: puedes ir haciéndolo poco a poco, y volver aquí cuando quieras.'}</div></div>
      <div class="guia">${pasos.map((p, i) => `<div class="card gpaso ${p.ok ? 'ok' : ''}"><div class="gn">${p.ok ? '✓' : i + 1}</div><div class="gt"><b>${esc(p.t)}</b><div class="small mut">${esc(p.s)}</div></div>
        <button class="btn sec" data-g="${p.btn[1]}" style="width:auto;min-height:40px;padding:8px 14px;font-size:14px">${esc(p.btn[0])}</button></div>`).join('')}</div>
      ${bloque('🧭 Cómo leer tu Centro de Mando', `<ul class="glist"><li><b>Ganado</b>: tu sueldo del mes + los extras que hayas apuntado (horas extra, ventas…).</li><li><b>Gastado</b>: tus gastos fijos + suscripciones + lo que apuntas día a día, menos las devoluciones.</li><li><b>Me queda libre</b>: lo ganado menos lo gastado.</li><li><b>La barra</b> mide cuánto de lo ganado ya has gastado: <span style="color:var(--acc2)">cian</span> hasta el 50 %, <span style="color:var(--warn)">naranja</span> del 50 al 80 % y <span style="color:var(--bad)">rojo</span> a partir del 80 %.</li></ul>`)}
      ${bloque('🔄 Fijo, día a día y devoluciones', `<ul class="glist"><li><b>Fijo</b>: lo que se repite solo cada mes (lo configuras una vez en el Piloto y no tienes que apuntarlo).</li><li><b>Día a día</b>: cada gasto que apuntas tú.</li><li><b>Devolución</b>: dinero que te devuelven (una compra que devuelves). Resta del gasto de su categoría.</li></ul>`)}
      ${bloque('🗓️ Suscripciones de verdad', `<ul class="glist"><li>Una <b>anual</b> de 120 € puede contarse <b>repartida</b> (10 € al mes) o <b>en el mes del cobro</b> (120 € de golpe). Lo eliges en el Piloto.</li><li>Si la <b>compartes</b> entre 4, pon 4 personas: solo cuenta tu cuarta parte.</li><li>Sirve también para cobros raros: “cada 9 meses” y listo.</li></ul>`)}
      ${bloque('💡 Atajos', `<ul class="glist"><li><b>Enter</b> guarda en cualquier fila de alta y confirma una celda editada.</li><li>Cambia entre <b>Modo avanzado</b> (como tu Excel) y <b>Vista simplificada</b> (móvil) cuando quieras.</li><li>Instálala en el móvil desde el navegador (“Añadir a pantalla de inicio”) para abrirla como una app.</li></ul>`)}`;
  }

  /* ------------------------------------------------------------------ 📈 GRÁFICOS */
  const PALETA = ['#22d3ee', '#818cf8', '#fb923c', '#f472b6', '#a3e635', '#fbbf24', '#38bdf8', '#94a3b8'];

  function donut(items, total) {
    const R = 70, L = 2 * Math.PI * R;
    let off = 0;
    const seg = items.map((it, i) => { const len = total > 0 ? (it.v / total) * L : 0; const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${PALETA[i % PALETA.length]}" stroke-width="30" stroke-dasharray="${len.toFixed(2)} ${(L - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(it.n)}: ${esc(fmt(it.v))}</title></circle>`; off += len; return s; }).join('');
    return `<svg viewBox="0 0 200 200" class="gdonut" role="img" aria-label="Reparto del gasto por categoría"><circle r="${R}" cx="100" cy="100" fill="none" stroke="#ffffff10" stroke-width="30"/>${seg}
      <text x="100" y="96" text-anchor="middle" fill="#8f9cd0" font-size="10">GASTADO</text><text x="100" y="116" text-anchor="middle" fill="#fff" font-size="17" font-weight="800">${esc(fmt(total))}</text></svg>`;
  }

  function bars(serie) {
    const W = 720, H = 250, pl = 46, pb = 28, pt = 14, iw = W - pl - 10, ih = H - pb - pt;
    const max = Math.max(1, ...serie.map((s) => Math.max(s.entra, s.sale)));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
    const y = (v) => pt + ih - (Math.max(0, v) / nice) * ih;
    const gw = iw / 12, bw = Math.min(16, gw / 3), hoyMk = C.monthKey(hoy());
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pl}" x2="${W - 10}" y1="${y(nice * f).toFixed(1)}" y2="${y(nice * f).toFixed(1)}" stroke="#ffffff12"/><text x="${pl - 6}" y="${(y(nice * f) + 3).toFixed(1)}" text-anchor="end" fill="#8f9cd0" font-size="9">${Math.round(nice * f)}</text>`).join('');
    const cols = serie.map((s, i) => { const cx = pl + gw * i + gw / 2, fut = s.mk > hoyMk ? ' opacity=".45"' : '';
      return `<g${fut}><rect x="${(cx - bw - 1).toFixed(1)}" y="${y(s.entra).toFixed(1)}" width="${bw}" height="${(ih - (y(s.entra) - pt)).toFixed(1)}" rx="3" fill="url(#gc)"><title>${esc(C.MESES[i])}: ganado ${esc(fmt(s.entra))}</title></rect>
        <rect x="${(cx + 1).toFixed(1)}" y="${y(s.sale).toFixed(1)}" width="${bw}" height="${(ih - (y(s.sale) - pt)).toFixed(1)}" rx="3" fill="url(#go)"><title>${esc(C.MESES[i])}: gastado ${esc(fmt(s.sale))}</title></rect></g>
        <text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="#8f9cd0" font-size="10">${esc(C.MESES[i].slice(0, 3))}</text>`; }).join('');
    const pts = serie.map((s, i) => `${(pl + gw * i + gw / 2).toFixed(1)},${y(Math.max(0, s.queda)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="gbars" role="img" aria-label="Ganado y gastado mes a mes"><defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/></linearGradient><linearGradient id="go" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#f43f5e"/></linearGradient></defs>${grid}${cols}<polyline points="${pts}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="4 3"/></svg>`;
  }

  function graficosView() {
    const mk = FF.ui.mk, m = C.computeMonth(data(), mk);
    const filas = m.filas.filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
    const top = filas.slice(0, 7).map((f) => ({ n: corto(f.cat), v: f.total }));
    const resto = C.r2(filas.slice(7).reduce((a, f) => a + f.total, 0));
    if (resto > 0) top.push({ n: 'Otras', v: resto });
    const total = C.r2(top.reduce((a, t) => a + t.v, 0));
    const serie = C.yearSeries(data(), st.gy);
    const gastos = data().gastos.filter((g) => C.monthKey(g.fecha) === mk && g.tipo !== C.TIPO_DEV).sort((a, b) => b.importe - a.importe).slice(0, 5);
    return head('📈 Gráficos') + `
      <div class="card"><div class="kv" style="padding:0;margin-bottom:6px"><span><b>🍩 ¿En qué se va el dinero?</b></span><span class="gnav"><button class="nav-btn" data-gm="-1" aria-label="Mes anterior">‹</button><b style="min-width:130px;text-align:center;display:inline-block">${esc(C.monthLabel(mk))}</b><button class="nav-btn" data-gm="1" aria-label="Mes siguiente">›</button></span></div>
        ${total > 0 ? `<div class="gdon">${donut(top, total)}<div class="gleg">${top.map((t, i) => `<div class="kv" style="padding:5px 0"><span><i class="gdot" style="background:${PALETA[i % PALETA.length]}"></i>${esc(t.n)}</span><b>${esc(fmt(t.v))} <span class="mut small">${Math.round((t.v / total) * 100)}%</span></b></div>`).join('')}</div></div>` : '<div class="empty">Aún no hay gastos en este mes.</div>'}</div>
      <div class="card"><div class="kv" style="padding:0;margin-bottom:6px"><span><b>📊 Mes a mes</b> <span class="mut small">(los meses futuros son previsión)</span></span><span class="gnav"><button class="nav-btn" data-gy="-1" aria-label="Año anterior">‹</button><b style="min-width:60px;text-align:center;display:inline-block">${st.gy}</b><button class="nav-btn" data-gy="1" aria-label="Año siguiente">›</button></span></div>
        ${bars(serie)}<div class="small mut" style="margin-top:6px"><i class="gdot" style="background:#22d3ee"></i>Ganado &nbsp; <i class="gdot" style="background:#fb923c"></i>Gastado &nbsp; <i class="gdot" style="background:#a78bfa"></i>Lo que queda (línea)</div></div>
      ${gastos.length ? `<div class="card"><h2>🏷️ Tus 5 gastos más grandes de ${esc(C.monthLabel(mk))}</h2>${gastos.map((g) => `<div class="kv"><span>${esc(g.detalle || corto(g.categoria))} <span class="mut small">${esc(corto(g.categoria))} · ${esc(g.fecha.slice(8, 10) + '/' + g.fecha.slice(5, 7))}</span></span><b>${esc(fmt(g.importe))}</b></div>`).join('')}</div>` : ''}`;
  }

  FF.views = { guia: guiaView, graficos: graficosView };

  pcMain.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]');
    if (g) { const v = g.dataset.g; if (v === 'set') toSettings(); else FF.openPage(v); return; }
    const gm = e.target.closest('[data-gm]'); if (gm) { FF.ui.mk = C.shiftMonth(FF.ui.mk, +gm.dataset.gm); FF.renderAll(); return; }
    const gy = e.target.closest('[data-gy]'); if (gy) { st.gy += +gy.dataset.gy; FF.renderAll(); }
  });

  /* ------------------------------------------------------------------ 🔒 CANDADO CON PIN */
  const subtle = window.crypto && window.crypto.subtle;
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha = async (txt) => hex(await subtle.digest('SHA-256', new TextEncoder().encode(txt)));
  const getPin = () => { try { return JSON.parse(lsGet('ff.pin')); } catch (e) { return null; } };
  const rnd = () => hex(crypto.getRandomValues(new Uint8Array(16)));
  const okPin = (p) => /^\d{4,8}$/.test(p);

  const lock = document.createElement('div');
  lock.id = 'lockScr'; lock.hidden = true;
  lock.innerHTML = `<div class="lbox"><div style="font-size:42px">🔒</div><h2 style="margin:6px 0 4px;text-transform:none;font-size:20px;color:var(--txt)">Finanzas</h2><div class="small mut" style="margin-bottom:14px">Escribe tu PIN para entrar</div>
    <input id="lockIn" class="t" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" style="text-align:center;font-size:26px;letter-spacing:8px"><div id="lockMsg" class="small" style="min-height:20px;margin-top:8px;color:var(--bad)"></div>
    <button class="btn pri" id="lockGo" type="button" style="margin-top:6px">Entrar</button><button class="pc-link" id="lockForgot" type="button" style="margin-top:14px">Olvidé el PIN</button></div>`;
  document.body.appendChild(lock);
  let fails = 0, hiddenAt = 0, until = 0;

  const showLock = () => { if (!getPin() || !subtle) return; lock.hidden = false; document.documentElement.classList.add('locked'); const i = $('#lockIn'); i.value = ''; $('#lockMsg').textContent = ''; setTimeout(() => i.focus(), 50); };
  const hideLock = () => { lock.hidden = true; document.documentElement.classList.remove('locked'); fails = 0; };
  async function tryUnlock() {
    const p = getPin(), v = $('#lockIn').value;
    if (!p) return hideLock();
    if (Date.now() < until) { $('#lockMsg').textContent = 'Espera unos segundos…'; return; }
    if ((await sha(p.s + v)) === p.h) return hideLock();
    fails++; $('#lockIn').value = '';
    if (fails >= 5) { until = Date.now() + 15000; fails = 0; $('#lockMsg').textContent = 'Demasiados intentos. Espera 15 s.'; } else $('#lockMsg').textContent = 'PIN incorrecto';
  }
  $('#lockGo').onclick = tryUnlock;
  $('#lockIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  $('#lockForgot').onclick = () => {
    if (!confirm('Si has olvidado el PIN, la única forma de entrar es borrar los datos de ESTE dispositivo (lo que no se haya sincronizado con tu hoja se perderá). Tus datos en Google Sheets no se tocan. ¿Continuar?')) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith('ff.') && k !== 'ff.layout').forEach((k) => localStorage.removeItem(k)); } catch (e) { /* nada */ }
    location.reload();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (getPin() && hiddenAt && Date.now() - hiddenAt > 60000) showLock();
  });
  if (getPin() && subtle) showLock(); else document.documentElement.classList.remove('locked');

  /* ------------------------------------------------------------------ 💾 COPIA DE SEGURIDAD */
  function downloadBackup() {
    const b = C.makeBackup({ config: data().config, diccionario: data().diccionario, gastos: data().gastos, extras: data().extras });
    const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `finanzas_copia_${hoy()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    lsSet('ff.lastBackup', new Date().toISOString());
    FF.toast(`💾 Copia descargada (${b.gastos.length} gastos, ${b.extras.length} extras)`); paintBackup();
  }

  async function restoreBackup(file) {
    let b;
    try { b = JSON.parse(await file.text()); } catch (e) { FF.toast('Ese archivo no es una copia válida'); return; }
    const plan = C.planRestore(data(), b);
    if (!plan) { FF.toast('Ese archivo no es una copia de Finanzas'); return; }
    const vacia = !(data().config.categorias || []).length;
    const sh = FF.openSheet(`<h3>Restaurar copia</h3><p class="small mut">Copia del ${esc(plan.creado ? plan.creado.slice(0, 10) : 'fecha desconocida')}.</p>
      <ul style="padding-left:18px;line-height:1.7"><li><b>${plan.gastos.length}</b> gastos que faltan</li><li><b>${plan.extras.length}</b> extras que faltan</li></ul>
      <label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="rbCfg" ${vacia ? 'checked' : ''}> Restaurar también la configuración (categorías, sueldo, fijos, suscripciones, ahorros, deudas, metas…) <span class="mut small">— sustituye la actual</span></label>
      <p class="small mut">No se borra nada de lo que ya tienes: solo se añade lo que falte.</p>
      <div class="grid2" style="margin-top:12px"><button class="btn sec" id="rbNo">Cancelar</button><button class="btn pri" id="rbOk">Restaurar</button></div>`);
    $('#rbNo', sh.el).onclick = () => sh.close();
    $('#rbOk', sh.el).onclick = () => {
      const withCfg = $('#rbCfg', sh.el).checked;
      if (plan.gastos.length) FF.addGastos(plan.gastos);
      if (plan.extras.length) { data().extras.push(...plan.extras); FF.persist(); for (let i = 0; i < plan.extras.length; i += 40) FF.enqueue('addExtra', { rows: plan.extras.slice(i, i + 40) }); }
      if (withCfg) Object.keys(plan.config).filter((k) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(k) && !['fuente', 'moneda', 'constructor', 'prototype'].includes(k)).forEach((k) => FF.setConfig(k, plan.config[k]));
      sh.close(); FF.rebuildIndex(); FF.renderAll(); FF.toast('✓ Copia restaurada');
    };
  }

  /* ------------------------------------------------------------------ tarjetas en Ajustes */
  const host = $('#v-set');
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h2>🔒 Candado</h2><div id="pinBox"></div>
    <h2 style="margin-top:18px">💾 Copia de seguridad</h2><div id="bkBox"></div><input type="file" id="bkIn" accept=".json,application/json" hidden>`;
  if (host) host.appendChild(card);

  function paintPin() {
    const box = $('#pinBox', card); if (!box) return;
    if (!subtle) { box.innerHTML = '<div class="small mut">Tu navegador no permite el candado (necesita una conexión segura https).</div>'; return; }
    const on = !!getPin();
    box.innerHTML = `<div class="small mut" style="margin-bottom:8px">${on ? '🔒 Activado: se pide el PIN al abrir la app y al volver tras un minuto fuera.' : 'Pide un PIN al abrir la app. Protege de miradas curiosas (los datos del navegador no están cifrados).'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pinNew" class="t" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="${on ? 'Nuevo PIN (4-8 cifras)' : 'Elige un PIN (4-8 cifras)'}" style="max-width:220px"><button class="btn sec" id="pinSet" style="width:auto;min-height:48px;padding:8px 16px;font-size:15px">${on ? 'Cambiar' : 'Activar'}</button>${on ? '<button class="btn sec" id="pinOff" style="width:auto;min-height:48px;padding:8px 16px;font-size:15px">Quitar</button>' : ''}</div>`;
  }
  function paintBackup() {
    const box = $('#bkBox', card); if (!box) return;
    const last = lsGet('ff.lastBackup');
    box.innerHTML = `<div class="small mut" style="margin-bottom:8px">${last ? 'Última copia: ' + esc(new Date(last).toLocaleDateString('es-ES')) : 'Aún no has hecho ninguna copia.'} Guarda el archivo en un sitio seguro (tu nube, un pendrive).</div>
      <div class="grid2"><button class="btn sec" id="bkDown">⬇️ Descargar copia</button><button class="btn sec" id="bkUp">⬆️ Restaurar</button></div>`;
  }
  card.addEventListener('click', async (e) => {
    if (e.target.closest('#pinSet')) {
      const v = $('#pinNew', card).value;
      if (!okPin(v)) { FF.toast('El PIN son de 4 a 8 cifras'); return; }
      const s = rnd(); lsSet('ff.pin', JSON.stringify({ s, h: await sha(s + v) })); paintPin(); FF.toast('🔒 PIN activado'); return;
    }
    if (e.target.closest('#pinOff')) { if (confirm('¿Quitar el PIN?')) { try { localStorage.removeItem('ff.pin'); } catch (er) { /* nada */ } paintPin(); FF.toast('PIN quitado'); } return; }
    if (e.target.closest('#bkDown')) return downloadBackup();
    if (e.target.closest('#bkUp')) return $('#bkIn', card).click();
  });
  $('#bkIn', card).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); });
  paintPin(); paintBackup();

  /* ------------------------------------------------------------------ primera vez: abre la guía */
  if (!lsGet('ff.guiaVista') && !data().gastos.length && !(data().config.sueldo || []).length) {
    lsSet('ff.guiaVista', '1');
    setTimeout(() => FF.openPage('guia'), 400);
  }
})();
