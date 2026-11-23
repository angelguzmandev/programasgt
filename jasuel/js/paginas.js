// ============================================================
// JASUEL · Detalles comunes de las páginas simples
// (políticas, 404). Va en archivo aparte porque la política de
// seguridad (CSP) no deja correr código escrito dentro del HTML.
// ============================================================
(function () {
  // Enlaces de WhatsApp con el número de datos.js
  document.querySelectorAll("[data-wa]").forEach(function (el) {
    el.href = "https://api.whatsapp.com/send?phone=" + CONFIG.whatsapp + "&text=" + encodeURIComponent(el.dataset.wa);
    el.target = "_blank";
    el.rel = "noopener";
  });

  // Año del pie
  var anio = document.getElementById("anio");
  if (anio) anio.textContent = new Date().getFullYear();

  // 404: la ruta llega en ?ruta=. Se muestra como texto, nunca como HTML,
  // para que un enlace malicioso no inyecte marcado.
  var ruta = new URLSearchParams(location.search).get("ruta");
  var caja = document.getElementById("ruta");
  if (ruta && caja) caja.textContent = "Intentaste abrir: " + ruta;
})();
