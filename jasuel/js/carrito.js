/* ============================================================
   JASUEL · Página del carrito (carrito/index.html)
   Lee el mismo pedido que guarda app.js en localStorage.
   Depende de CONFIG y PRODUCTOS, definidos en js/datos.js.
   ============================================================ */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const enQuetzales = (n) => CONFIG.moneda + n.toLocaleString("es-GT");
  const enlaceWa = (texto) =>
    "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(texto);
  // Las rutas de datos.js son relativas a /jasuel/; esta página vive un nivel abajo
  const ruta = (src) => "../" + src;

  if (CONFIG.whatsapp === "50200000000") {
    const aviso = document.createElement("p");
    aviso.className = "aviso-config";
    aviso.textContent =
      "Aviso interno: falta configurar el número de WhatsApp en js/datos.js. Los pedidos todavía no llegan.";
    document.body.prepend(aviso);
  }

  document.querySelectorAll("[data-wa]").forEach((el) => {
    el.href = enlaceWa(el.dataset.wa);
    el.target = "_blank";
    el.rel = "noopener";
  });

  /* ─────────────── El pedido (misma clave que app.js) ─────────────── */

  const CLAVE = "jasuel-pedido";

  function leerPedido() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE));
      return Array.isArray(guardado)
        ? guardado.filter((id) => PRODUCTOS.some((p) => p.id === id))
        : [];
    } catch {
      return [];
    }
  }

  function guardarPedido() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(pedido));
    } catch {
      /* navegacion privada */
    }
  }

  let pedido = leerPedido();

  // La cantidad va repetida en la lista, igual que en app.js
  const MAX_POR_PIEZA = 20;
  const cantidadDe = (id) => pedido.filter((x) => x === id).length;
  const piezas = () =>
    [...new Set(pedido)]
      .map((id) => PRODUCTOS.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({ ...p, cantidad: cantidadDe(p.id) }));
  const total = () => piezas().reduce((suma, p) => suma + p.precio * p.cantidad, 0);

  const plural = (n) => n + (n === 1 ? " pieza" : " piezas");
  const nombreDe = (id) => (PRODUCTOS.find((p) => p.id === id) || {}).nombre || "la pieza";

  function cambiarCantidad(id, paso) {
    if (paso > 0) {
      if (cantidadDe(id) >= MAX_POR_PIEZA) return;
      pedido.push(id);
    } else if (cantidadDe(id) === 1) {
      // Restar la última unidad la saca del pedido: se puede deshacer
      quitarConDeshacer(id);
      return;
    } else {
      pedido.splice(pedido.lastIndexOf(id), 1);
    }
    guardarPedido();
    pintar();
  }

  /* ─────────────── Deshacer ───────────────
     Antes de quitar algo se guarda una copia del pedido; el aviso dura 8 s. */

  const deshacer = $("#deshacer");
  const anuncio = $("#anuncio");
  let respaldo = null;
  let relojDeshacer;

  function anunciar(texto) {
    // Vaciar y volver a escribir hace que el lector lo lea aunque se repita
    anuncio.textContent = "";
    requestAnimationFrame(() => { anuncio.textContent = texto; });
  }

  function ofrecerDeshacer(texto) {
    clearTimeout(relojDeshacer);
    $("#deshacerTexto").textContent = texto;
    deshacer.hidden = false;
    anunciar(texto + " Puedes deshacerlo.");
    // El foco estaba en un botón que acaba de desaparecer: se lleva a "Deshacer"
    $("#deshacerBoton").focus({ preventScroll: true });
    relojDeshacer = setTimeout(cerrarDeshacer, 8000);
  }

  function cerrarDeshacer() {
    clearTimeout(relojDeshacer);
    const teniaFoco = deshacer.contains(document.activeElement);
    deshacer.hidden = true;
    respaldo = null;
    if (teniaFoco) {
      (pedido.length ? $("#tituloPiezas") : $("#carritoVacio .boton")).focus({ preventScroll: true });
    }
  }

  function quitarConDeshacer(id) {
    respaldo = [...pedido];
    const nombre = nombreDe(id);
    pedido = pedido.filter((x) => x !== id);
    guardarPedido();
    pintar();
    ofrecerDeshacer("Quitaste " + nombre + ".");
  }

  $("#deshacerBoton").addEventListener("click", () => {
    if (!respaldo) return;
    pedido = respaldo;
    guardarPedido();
    $("#carritoVacioTexto").textContent = "Todavía no elegiste tu joya.";
    pintar();
    cerrarDeshacer();
    anunciar("Listo, recuperaste tu pedido.");
    $("#tituloPiezas").focus({ preventScroll: true });
  });

  function crearContador(p) {
    const caja = document.createElement("div");
    caja.className = "contador";
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Cantidad de " + p.nombre);

    const menos = document.createElement("button");
    menos.type = "button";
    menos.innerHTML = "&minus;";
    menos.setAttribute("aria-label", p.cantidad === 1 ? "Quitar del pedido" : "Quitar uno");
    menos.addEventListener("click", () => cambiarCantidad(p.id, -1));

    const num = document.createElement("span");
    num.className = "contador-num";
    num.textContent = p.cantidad;

    const mas = document.createElement("button");
    mas.type = "button";
    mas.textContent = "+";
    mas.setAttribute("aria-label", "Agregar otro");
    mas.disabled = p.cantidad >= MAX_POR_PIEZA;
    mas.addEventListener("click", () => cambiarCantidad(p.id, 1));

    caja.append(menos, num, mas);
    return caja;
  }

  /* ─────────────── Pintar ─────────────── */

  function pintar() {
    const lista = piezas();
    $("#carritoVacio").hidden = lista.length > 0;
    $("#carritoLleno").hidden = lista.length === 0;

    $("#carritoCuenta").textContent = plural(pedido.length);
    $("#carritoSubtotal").textContent = enQuetzales(total());
    $("#carritoTotal").textContent = enQuetzales(total()) + " + envío";

    $("#carritoLista").replaceChildren(
      ...lista.map((p) => {
        const li = document.createElement("li");

        const img = document.createElement("img");
        img.src = ruta(p.img);
        img.alt = p.alt || "";
        img.width = 96;
        img.height = 118;
        img.loading = "lazy";
        img.decoding = "async";

        const info = document.createElement("div");
        info.className = "cl-info";
        const cat = document.createElement("span");
        cat.className = "cl-cat";
        cat.textContent = p.categoria;
        const nombre = document.createElement("span");
        nombre.className = "cl-nombre";
        nombre.textContent = p.nombre;
        info.append(cat, nombre);

        const precio = document.createElement("span");
        precio.className = "cl-precio";
        precio.textContent = enQuetzales(p.precio * p.cantidad);
        if (p.cantidad > 1) {
          const unidad = document.createElement("span");
          unidad.className = "cl-unidad";
          unidad.textContent = enQuetzales(p.precio) + " c/u";
          info.append(unidad);
        }

        const quitar = document.createElement("button");
        quitar.className = "pedido-quitar";
        quitar.type = "button";
        quitar.innerHTML = "&times;";
        quitar.setAttribute("aria-label", "Quitar " + p.nombre);
        quitar.addEventListener("click", () => quitarConDeshacer(p.id));

        li.append(img, info, crearContador(p), precio, quitar);
        return li;
      })
    );
  }

  // Confirmación con el diálogo propio de la página (no el confirm() del navegador)
  const alertaVaciar = $("#alertaVaciar");

  const alertaWa = $("#alertaWa");

  // Lista de piezas en texto, para el mensaje de WhatsApp
  const lineasDePiezas = () =>
    piezas().map(
      (p) =>
        "• " + p.nombre + (p.cantidad > 1 ? " ×" + p.cantidad : "") +
        " — " + enQuetzales(p.precio * p.cantidad)
    );

  $("#carritoVaciar").addEventListener("click", () => {
    // Que se vea lo que se pierde: cantidad y total reales
    const n = pedido.length;
    $("#alertaTitulo").textContent =
      n === 1 ? "¿Quitar tu pieza del pedido?" : "¿Quitar las " + n + " piezas de tu pedido?";
    $("#alertaTexto").textContent =
      "Vas a perder la selección que armaste (" + enQuetzales(total()) + "). " +
      "Si quieres pensarlo, queda guardada en este dispositivo y no pagas nada hasta recibir.";

    // Salida para quien duda: WhatsApp con el pedido ya escrito
    alertaWa.href = enlaceWa(
      ["Hola Jasuel, estaba por hacer un pedido y tengo una duda antes de confirmar:", "",
       ...lineasDePiezas()].join("\n")
    );
    alertaWa.target = "_blank";
    alertaWa.rel = "noopener";

    alertaVaciar.returnValue = "";
    alertaVaciar.showModal();
  });

  alertaWa.addEventListener("click", () => alertaVaciar.close("cancelar"));

  alertaVaciar.addEventListener("close", () => {
    if (alertaVaciar.returnValue !== "vaciar") return;
    respaldo = [...pedido];
    pedido = [];
    guardarPedido();
    $("#carritoVacioTexto").textContent = "Tu pedido quedó vacío. ¿Buscamos otra pieza para ti?";
    pintar();
    ofrecerDeshacer("Vaciaste tu pedido.");
  });

  // Clic en el fondo oscuro = cancelar
  alertaVaciar.addEventListener("click", (e) => {
    if (e.target === alertaVaciar) alertaVaciar.close("cancelar");
  });

  /* ─────────────── Enviar por WhatsApp ─────────────── */

  $("#carritoForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const nombre = $("#nombre").value.trim();
    const zona = $("#zona").value.trim();
    const nota = $("#nota").value.trim();

    const lineas = [
      nombre
        ? "Hola Jasuel, soy " + nombre + (zona ? " (" + zona + ")" : "") + "."
        : "Hola Jasuel, vengo de la página web.",
      "",
      "Quiero pedir:",
      ...lineasDePiezas(),
    ];
    lineas.push("", "Total aproximado: " + enQuetzales(total()));
    lineas.push("Envío: por confirmar según mi ubicación (Cargo Expresso)");
    lineas.push("Pago: contra entrega");
    if (zona && !nombre) lineas.push("", "Estoy en " + zona + ".");
    if (nota) lineas.push("", "Nota: " + nota);

    window.open(enlaceWa(lineas.join("\n")), "_blank", "noopener");
  });

  // Si cambian el pedido en otra pestaña, o vuelven con el botón Atrás
  addEventListener("storage", (e) => {
    if (e.key === CLAVE) { pedido = leerPedido(); pintar(); }
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) { pedido = leerPedido(); pintar(); }
  });

  pintar();
})();
