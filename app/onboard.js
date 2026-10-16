/* Finanzas App · bienvenida (asistente de 4 pasos) y tour guiado con la pantalla resaltada.
   Pensado para que cualquiera la use sin explicaciones: una pregunta por pantalla, valores por defecto, "Saltar" siempre a mano. */
(function () {
  'use strict';
  const C = window.Core;
  const FF = window.FF;
  if (!FF || !FF.ui || !FF.openPage) return;
  const esc = FF.esc;
  const fmt = (n) => C.fmtEUR(n);
  const $ = (s, r = document) => r.querySelector(s);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const EXTRA_TIPOS = ['⏱️ Horas extra', '🌐 Trabajos por mi cuenta', '🎁 Ventas y encargos', '💼 Otros ingresos'];

  /* ================================================================== TOUR */
  const mobile = () => !FF.pcActive;
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const by = (s) => () => document.querySelector(s);

  function tourSteps() {
    if (!mobile()) return [
      { el: by('#pcNav'), t: 'Tu menú', x: 'Aquí están todas las secciones. Empieza siempre por el Centro de Mando.', pos: 'right' },
      { el: by('.pc-cards'), t: 'Lo importante, de un vistazo', x: 'Lo que has ganado, lo que has gastado y lo que te queda libre este mes.', pos: 'bottom' },
      { el: by('.pc-batbar'), t: 'La barra de alarma', x: 'Se llena según lo que llevas gastado. Cian: vas bien. Naranja: cuidado. Rojo: alarma.', pos: 'bottom' },
      { el: by('.pc-quick'), t: 'Apunta un gasto en 3 segundos', x: 'Escribe el importe y el concepto y pulsa Enter. La categoría se elige sola y aprende de ti.', pos: 'bottom' },
      { el: by('#qCam'), t: '¿Tienes un ticket?', x: 'Haz una foto y la IA lo desglosa artículo por artículo (necesita tu clave de Gemini en Ajustes).', pos: 'left' },
      { el: by('#pcNav [data-v=piloto]'), t: 'Lo que se repite cada mes', x: 'Tu sueldo, alquiler, suscripciones y presupuestos. Se cuentan solos cada mes.', pos: 'right' },
      { el: by('#pcNav [data-v=guia]'), t: '¿Dudas? Aquí tienes la guía', x: 'Una lista de pasos que se marcan sola. ¡Eso es todo, ya puedes empezar!', pos: 'right' },
    ];
    return [
      { el: by('header#top .hero'), t: 'Lo que te queda', x: 'Este número es lo que te queda libre este mes después de todo lo que gastas.', pos: 'bottom' },
      { el: by('.battery'), t: 'La barra de alarma', x: 'Se llena según lo que llevas gastado. Cian: vas bien. Naranja: cuidado. Rojo: alarma.', pos: 'bottom' },
      { el: () => (document.getElementById('amt') || {}).closest && document.getElementById('amt').closest('.card'), t: 'Apunta un gasto en 3 segundos', x: 'Importe, concepto y listo. La categoría se elige sola y aprende de ti.', pos: 'top' },
      { el: by('#saveBtn'), t: 'Guardar', x: 'Pulsa aquí para guardarlo. Verás al instante cuánto te queda.', pos: 'top' },
      { el: by('#tabs'), t: 'Tu menú', x: 'Historial para buscar y corregir, Resumen para ver meses y años, y Ajustes.', pos: 'top' },
      { el: by('#tabs [data-go=set]'), t: 'Más cosas en Ajustes', x: 'Ahí está “Más secciones”: Ahorros, Deudas, Gráficos, Piloto y esta guía. ¡Ya puedes empezar!', pos: 'top' },
    ];
  }

  let tour = null;
  async function startTour() {
    if (tour) return;
    if (FF.pageOpen && FF.closePage) FF.closePage(true);
    if (FF.pcActive) FF.pcGo('cmd'); else FF.goMobile('home');
    await wait(350);
    const steps = tourSteps().filter((s) => visible(s.el()));
    if (!steps.length) { FF.toast('No hay nada que resaltar en esta pantalla'); return; }
    const block = document.createElement('div'); block.className = 'tblock';
    const spot = document.createElement('div'); spot.className = 'tspot';
    const card = document.createElement('div'); card.className = 'tcard'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
    document.body.append(block, spot, card);
    tour = { i: 0, steps, block, spot, card };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', onKey, true);
    show(0);
  }
  function endTour(done) {
    if (!tour) return;
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', onKey, true);
    [tour.block, tour.spot, tour.card].forEach((n) => n.remove());
    tour = null; lsSet('ff.tour', '1');
    if (done) FF.toast('¡Listo! Apunta tu primer gasto 💪');
    setTimeout(() => { const q = $('#qImp') || $('#amt'); if (q && !FF.pageOpen) q.focus(); }, 60);
  }
  function onKey(e) {
    if (!tour) return;
    if (e.key === 'Escape') { e.preventDefault(); endTour(false); }
    else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(tour.i - 1); }
  }
  const next = () => { if (tour.i >= tour.steps.length - 1) endTour(true); else show(tour.i + 1); };

  function show(i) {
    if (!tour || i < 0) return;
    tour.i = i;
    const s = tour.steps[i], el = s.el();
    if (!visible(el)) { if (i < tour.steps.length - 1) return show(i + 1); return endTour(true); }
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) { el.scrollIntoView(); }
    const ult = i === tour.steps.length - 1;
    tour.card.innerHTML = `<div class="tn">${i + 1} de ${tour.steps.length}</div><h3>${esc(s.t)}</h3><p>${esc(s.x)}</p>
      <div class="tb"><button class="tskip" type="button" id="tkS">Saltar</button><span style="flex:1"></span>${i > 0 ? '<button class="btn sec" id="tkB" type="button">Atrás</button>' : ''}<button class="btn pri" id="tkN" type="button">${ult ? '¡Entendido!' : 'Siguiente'}</button></div>`;
    $('#tkS', tour.card).onclick = () => endTour(false);
    $('#tkN', tour.card).onclick = next;
    const b = $('#tkB', tour.card); if (b) b.onclick = () => show(tour.i - 1);
    place();
    $('#tkN', tour.card).focus({ preventScroll: true });
  }

  function place() {
    if (!tour) return;
    const s = tour.steps[tour.i], el = s.el();
    if (!visible(el)) return;
    const r = el.getBoundingClientRect(), pad = 6, sp = tour.spot.style;
    sp.left = (r.left - pad) + 'px'; sp.top = (r.top - pad) + 'px'; sp.width = (r.width + pad * 2) + 'px'; sp.height = (r.height + pad * 2) + 'px';
    const cs = tour.card.style, W = innerWidth, H = innerHeight;
    if (W < 700) { cs.left = '12px'; cs.right = '12px'; cs.width = 'auto'; cs.top = 'auto'; cs.bottom = 'calc(12px + env(safe-area-inset-bottom,0px))'; return; }
    cs.right = 'auto'; cs.bottom = 'auto'; cs.width = '340px';
    const cw = 340, ch = tour.card.offsetHeight || 170, gap = 16;
    let left, top;
    if (s.pos === 'right') { left = r.right + gap; top = r.top + r.height / 2 - ch / 2; }
    else if (s.pos === 'left') { left = r.left - cw - gap; top = r.top + r.height / 2 - ch / 2; }
    else if (s.pos === 'top') { left = r.left + r.width / 2 - cw / 2; top = r.top - ch - gap; }
    else { left = r.left + r.width / 2 - cw / 2; top = r.bottom + gap; }
    if (top + ch > H - 12 && s.pos === 'bottom') top = r.top - ch - gap;           // no cabe debajo: encima
    if (top < 12 && (s.pos === 'top' || s.pos === 'bottom')) top = Math.min(r.bottom + gap, H - ch - 12);
    cs.left = Math.max(12, Math.min(left, W - cw - 12)) + 'px'; cs.top = Math.max(12, Math.min(top, H - ch - 12)) + 'px';
  }
  FF.startTour = startTour;

  /* ================================================================== ASISTENTE DE BIENVENIDA */
  let wz = null;
  const nombreCorto = (n) => n.replace(/\s*\(.*$/, '');

  function wizStart() {
    if (wz) return;
    const el = document.createElement('div'); el.id = 'wiz'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
    wz = { el, step: 0, sueldo: '', cats: FF.defaultCats.slice(), sel: new Set(FF.defaultCats), dest: 'local' };
    wizPaint();
  }
  function wizClose(flag) { if (!wz) return; wz.el.remove(); wz = null; lsSet('ff.onb', '1'); lsSet('ff.guiaVista', '1'); if (flag === 'tour') setTimeout(startTour, 250); }

  function dots() { return `<div class="wdots">${[0, 1, 2, 3].map((i) => `<i class="${i === wz.step ? 'on' : i < wz.step ? 'ok' : ''}"></i>`).join('')}</div>`; }
  const sueldoNum = () => { const n = C.parseAmount(wz.sueldo); return n != null && n > 0 ? n : null; };

  function wizPaint() {
    const w = wz, s = w.step;
    let body = '';
    if (s === 0) body = `${dots()}<div class="wemo">👋</div><h1>Bienvenido</h1><p class="wp">Te dejo la app lista en menos de un minuto. Solo 3 preguntas, y puedes cambiar todo después.</p>
      <button class="btn pri" data-w="next">Empezar</button>
      <button class="btn sec" data-w="excel" style="margin-top:10px">📥 Ya tengo mi Excel: importarlo</button>
      <button class="wlink" data-w="skip">Saltar, ya sé usarla</button>`;
    else if (s === 1) body = `${dots()}<h1>¿Cuánto cobras al mes?</h1><p class="wp">Una cifra aproximada vale. Luego puedes cambiarla o añadir extras (horas extra, ventas…).</p>
      <div class="wmoney"><input id="wzSueldo" class="t" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(w.sueldo)}"><span>€</span></div>
      <button class="btn pri" data-w="next" id="wzNext" ${sueldoNum() ? '' : 'disabled'}>Continuar</button>
      <button class="wlink" data-w="nosueldo">Ahora no, lo pongo luego</button><button class="wlink" data-w="back">← Atrás</button>`;
    else if (s === 2) body = `${dots()}<h1>¿En qué sueles gastar?</h1><p class="wp">Toca para quitar las que no uses. Podrás crear más cuando quieras.</p>
      <div class="wchips">${w.cats.map((c) => `<button type="button" class="wchip ${w.sel.has(c) ? 'on' : ''}" data-c="${esc(c)}">${esc(c.replace(/\s*\(.*$/, ''))}</button>`).join('')}</div>
      <div class="wadd"><input id="wzCat" class="t" placeholder="➕ Añadir otra (ej. 🐶 Mascotas)"><button class="btn sec" data-w="addcat" type="button">Añadir</button></div>
      <div class="small mut" style="margin:8px 0 12px">${w.sel.size} elegida${w.sel.size === 1 ? '' : 's'}</div>
      <button class="btn pri" data-w="next" ${w.sel.size ? '' : 'disabled'}>Continuar</button><button class="wlink" data-w="back">← Atrás</button>`;
    else if (s === 3) body = `${dots()}<h1>¿Dónde guardamos tus datos?</h1><p class="wp">Puedes empezar ya y cambiarlo más tarde en Ajustes.</p>
      <button type="button" class="wopt ${w.dest === 'local' ? 'on' : ''}" data-d="local"><b>📱 Solo en este dispositivo</b><span>La opción más rápida. Empiezas ahora mismo.</span></button>
      <button type="button" class="wopt ${w.dest === 'sheet' ? 'on' : ''}" data-d="sheet"><b>☁️ En mi hoja de Google</b><span>Para usarla en el móvil y el PC a la vez. Te llevo a Ajustes después.</span></button>
      <button class="btn pri" data-w="finish" style="margin-top:14px">Terminar</button><button class="wlink" data-w="back">← Atrás</button>`;
    else {
      const sd = sueldoNum();
      body = `<div class="wemo">🎉</div><h1>¡Listo!</h1>
        ${sd ? `<div class="wlbl">Este mes te quedan libres</div><div class="wbig">${esc(fmt(sd))}</div><div class="wbar"><i style="width:100%"></i></div><p class="wp">Cada gasto que apuntes lo irá restando. La barra pasará de cian a naranja y a rojo según gastes.</p>` : '<p class="wp">Tu app está lista. Pon tu sueldo cuando quieras en Piloto Automático.</p>'}
        <button class="btn pri" data-w="tour">Apuntar mi primer gasto →</button>
        <button class="wlink" data-w="close">Prefiero explorar yo</button>`;
    }
    w.el.innerHTML = `<div class="wbox">${s < 4 ? '<button class="wskip" data-w="skip">Saltar</button>' : ''}${body}</div>`;
    const inp = $('#wzSueldo', w.el); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  function wizFinish() {
    const chosen = wz.cats.filter((c) => wz.sel.has(c));
    FF.setConfig('categorias', chosen.map((nombre) => ({ nombre, presupuesto: null })));
    const sd = sueldoNum();
    if (sd) FF.setConfig('sueldo', [{ desde: C.monthKey(C.todayISO()), importe: sd }]);
    if (!(FF.data.config.tiposExtra || []).length) FF.setConfig('tiposExtra', EXTRA_TIPOS);
    FF.renderAll();
    wz.step = 4; wizPaint();
  }

  document.addEventListener('click', (e) => {
    if (!wz) return;
    const c = e.target.closest('[data-c]');
    if (c && wz.el.contains(c)) { const n = c.dataset.c; if (wz.sel.has(n)) wz.sel.delete(n); else wz.sel.add(n); return wizPaint(); }
    const d = e.target.closest('[data-d]');
    if (d && wz.el.contains(d)) { wz.dest = d.dataset.d; return wizPaint(); }
    const b = e.target.closest('[data-w]');
    if (!b || !wz.el.contains(b)) return;
    const a = b.dataset.w;
    if (a === 'next') { wz.step++; wizPaint(); }
    else if (a === 'back') { wz.step--; wizPaint(); }
    else if (a === 'nosueldo') { wz.sueldo = ''; wz.step++; wizPaint(); }
    else if (a === 'skip') wizClose();
    else if (a === 'close') wizClose();
    else if (a === 'excel') { wizClose(); const f = $('#xIn'); if (f) f.click(); }
    else if (a === 'addcat') {
      const i = $('#wzCat', wz.el), n = C.nameOk(i.value);
      if (!n) return i.focus();
      if (!wz.cats.some((x) => C.norm(x) === C.norm(n))) { wz.cats.push(n); wz.sel.add(n); } wizPaint();
    } else if (a === 'finish') {
      const dest = wz.dest; wizFinish(); wz.afterSheet = dest === 'sheet';
    } else if (a === 'tour') {
      const toSheet = wz.afterSheet; wizClose(toSheet ? '' : 'tour');
      if (toSheet) setTimeout(() => { if (FF.pcActive) FF.pcGo('set'); else FF.goMobile('set'); FF.toast('Pega aquí la URL y el token de tu script'); }, 200);
    }
  });
  document.addEventListener('input', (e) => {
    if (!wz) return;
    if (e.target.id === 'wzSueldo') { wz.sueldo = e.target.value; const n = $('#wzNext', wz.el); if (n) n.disabled = !sueldoNum(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!wz || e.key !== 'Enter') return;
    if (e.target.id === 'wzSueldo') { e.preventDefault(); if (sueldoNum()) { wz.step++; wizPaint(); } }
    else if (e.target.id === 'wzCat') { e.preventDefault(); const b = $('[data-w=addcat]', wz.el); if (b) b.click(); }
  });

  /* ---- primera vez: nada guardado, sin hoja conectada */
  const d = FF.data;
  const vacia = !d.gastos.length && !(d.config.sueldo || []).length && !FF.cats().length;
  if (!lsGet("ff.onb") && vacia && !FF.configured()) wizStart();
  FF.startWizard = wizStart;
})();
