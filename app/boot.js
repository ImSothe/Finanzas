/* Arranque mínimo: se carga antes que nada, SIN código en línea en el HTML (así la política de seguridad CSP puede prohibirlo).
   1) Si hay PIN o modo privado, se aplican antes de dibujar nada (que no se vea un destello de datos).
   2) Anti-"clickjacking": si alguien incrusta la app en otra web, no se muestra. */
(function () {
  'use strict';
  var root = document.documentElement;
  try {
    if (localStorage.getItem('ff.pin')) root.classList.add('locked');
    if (localStorage.getItem('ff.priv') === '1') root.classList.add('priv');
  } catch (e) { /* sin almacenamiento */ }
  if (window.top !== window.self) {
    root.style.display = 'none';
    try { window.top.location = window.self.location; } catch (e) { /* bloqueado: se queda oculta */ }
  }
})();
