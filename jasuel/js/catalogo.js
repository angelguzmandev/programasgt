/* ============================================================
   JASUEL · Catálogo en vivo desde la base de datos
   ------------------------------------------------------------
   Se carga después de datos.js y antes de la app. Trae de
   Supabase la tienda, sus secciones y productos visibles (lo que
   la clienta edita en programasgt.art/panel/) y reemplaza con eso
   CONFIG, ORDEN_CATEGORIAS y PRODUCTOS.

   Si la base no responde a tiempo (caída, pausada, sin internet),
   la tienda arranca igual con lo que trae datos.js. Por eso
   datos.js se mantiene como respaldo.

   La clave es PÚBLICA por diseño: solo permite leer lo visible.
   Uso: <script src="js/catalogo.js" data-app="js/app.js"></script>
   ============================================================ */

(function () {
  "use strict";

  // Vienen de datos.js
  var BASE = CONFIG.api;
  var CLAVE = CONFIG.apiClave;
  var TIENDA = CONFIG.tienda;
  var ESPERA_MAX = 3500; // ms antes de rendirse y usar datos.js

  // El carrito la usa para registrar el pedido (función crear_pedido)
  window.JASUEL_API = { base: BASE, clave: CLAVE, tienda: TIENDA };

  var app = document.currentScript.dataset.app;
  var control = "AbortController" in window ? new AbortController() : null;
  var reloj = setTimeout(function () { if (control) control.abort(); }, ESPERA_MAX);

  function pedir(ruta) {
    return fetch(BASE + ruta, {
      headers: { apikey: CLAVE },
      signal: control ? control.signal : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function arrancar() {
    clearTimeout(reloj);
    var s = document.createElement("script");
    s.src = app;
    document.body.appendChild(s);
  }

  var tienda;

  pedir("tiendas?slug=eq." + TIENDA + "&select=id,whatsapp,instagram,moneda")
    .then(function (filas) {
      if (!filas.length) throw new Error("tienda no encontrada o inactiva");
      tienda = filas[0];
      var id = encodeURIComponent(tienda.id);
      return Promise.all([
        pedir("secciones?tienda_id=eq." + id + "&select=id,nombre&order=orden"),
        pedir("productos?tienda_id=eq." + id +
              "&select=id,seccion_id,nombre,precio,descripcion,datos,imagen,imagen_alt,disponible,etiqueta,sku&order=orden"),
      ]);
    })
    .then(function (r) {
      var secciones = r[0], productos = r[1];

      // Solo llegan secciones visibles: un producto de una sección oculta no se muestra
      var nombreDe = {};
      secciones.forEach(function (s) { nombreDe[s.id] = s.nombre; });

      var lista = productos
        .filter(function (p) { return !p.seccion_id || nombreDe[p.seccion_id]; })
        .map(function (p) {
          return {
            id: p.id,
            nombre: p.nombre,
            categoria: p.seccion_id ? nombreDe[p.seccion_id] : "Otros",
            precio: Number(p.precio),
            img: p.imagen,
            alt: p.imagen_alt || p.nombre,
            descripcion: p.descripcion || "",
            datos: p.datos || [],
            sku: p.sku || "",
            // Lo que se puede vender ahora: en mano menos lo apartado por
            // otros pedidos nuevos. null = la tienda no controla inventario.
            existencia: p.disponible,
            agotado: p.disponible === 0,
            etiqueta: p.etiqueta || "",
          };
        });

      // Se reemplaza todo junto, solo cuando ya llegó todo bien
      if (tienda.whatsapp) CONFIG.whatsapp = tienda.whatsapp;
      if (tienda.instagram) CONFIG.instagram = tienda.instagram;
      if (tienda.moneda) CONFIG.moneda = tienda.moneda;
      ORDEN_CATEGORIAS.splice.apply(ORDEN_CATEGORIAS, [0, ORDEN_CATEGORIAS.length].concat(
        secciones.map(function (s) { return s.nombre; })
      ));
      PRODUCTOS.splice.apply(PRODUCTOS, [0, PRODUCTOS.length].concat(lista));
    })
    .catch(function (e) {
      console.warn("JASUEL: no se pudo leer el catálogo en vivo, se usa datos.js", e);
    })
    .then(arrancar);
})();
