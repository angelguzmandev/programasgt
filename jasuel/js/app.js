/* ============================================================
   JASUEL · Comportamiento del sitio
   Depende de CONFIG y PRODUCTOS, definidos en js/datos.js.
   ============================================================ */

(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const menosMovimiento = matchMedia("(prefers-reduced-motion: reduce)");
  const punteroFino = matchMedia("(hover: hover) and (pointer: fine)");

  const enQuetzales = (n) => CONFIG.moneda + n.toLocaleString("es-GT");
  const enlaceWa = (texto) =>
    "https://api.whatsapp.com/send?phone=" + CONFIG.whatsapp + "&text=" + encodeURIComponent(texto);

  // Mientras el numero sea el de ejemplo, ningun pedido llega a nadie:
  // se avisa en la pagina, no solo en la consola, para no publicarlo asi.
  if (CONFIG.whatsapp === "50200000000") {
    console.warn("JASUEL: falta poner el numero real de WhatsApp en js/datos.js");
    const aviso = document.createElement("p");
    aviso.className = "aviso-config";
    aviso.textContent =
      "Aviso interno: falta configurar el número de WhatsApp en js/datos.js. Los pedidos todavía no llegan.";
    document.body.prepend(aviso);
  }

  /* ─────────────── Enlaces de WhatsApp sueltos ─────────────── */

  $$("[data-wa]").forEach((el) => {
    el.href = enlaceWa(el.dataset.wa);
    el.target = "_blank";
    el.rel = "noopener";
  });

  /* ─────────────── El pedido ─────────────── */

  const CLAVE = "jasuel-pedido";
  // Antes de leerPedido(): leerlo usa este tope al ajustar a existencias
  const MAX_POR_PIEZA = 10; // igual que crear_pedido en la base

  function leerPedido() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE));
      // Solo sobreviven los ids que todavia existen y hay en existencia
      return Array.isArray(guardado) ? ajustarAExistencias(guardado) : [];
    } catch {
      return [];
    }
  }

  function guardarPedido() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(pedido));
    } catch {
      /* navegacion privada: el pedido vive solo mientras dure la visita */
    }
  }

  let pedido = leerPedido();

  // La cantidad se guarda repitiendo el id: ["a","a","b"] = 2 de "a" y 1 de "b".
  // Asi los pedidos guardados antes de existir las cantidades siguen sirviendo.
  const cantidadDe = (id) => pedido.filter((x) => x === id).length;

  // Tope por pieza: lo que hay en existencia (si la tienda la controla), máximo 20
  function maximoDe(id) {
    const p = PRODUCTOS.find((x) => x.id === id);
    if (!p) return 0;
    return Number.isInteger(p.existencia) ? Math.min(MAX_POR_PIEZA, p.existencia) : MAX_POR_PIEZA;
  }

  function ajustarAExistencias(ids) {
    const cuenta = {};
    return ids.filter((id) => {
      cuenta[id] = (cuenta[id] || 0) + 1;
      return cuenta[id] <= maximoDe(id);
    });
  }

  // Con pocas disponibles se avisa en la tarjeta y en la ficha (dato real,
  // ya descontado lo apartado por otros pedidos)
  const POCAS = 3;
  function textoPocas(p) {
    const n = p.existencia;
    if (!Number.isInteger(n) || n <= 0 || n > POCAS) return "";
    return n === 1 ? "¡Última pieza!" : "Solo quedan " + n;
  }

  // "Set Perla Clásica (SET0006)": con el SKU la tienda sabe exacto de qué pieza le hablan

  const mensajeAgotado = (p) =>
    "Hola Jasuel\nMe interesa *" + p.nombre + "*" + (p.sku ? " (" + p.sku + ")" : "") +
    " pero aparece agotado.\n¿Me avisan cuando vuelva?";

  // Una entrada por pieza distinta, en el orden en que se agregaron
  const piezasDelPedido = () =>
    [...new Set(pedido)]
      .map((id) => PRODUCTOS.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({ ...p, cantidad: cantidadDe(p.id) }));

  const totalDelPedido = () =>
    piezasDelPedido().reduce((suma, p) => suma + p.precio * p.cantidad, 0);

  function agregarAlPedido(id) {
    if (cantidadDe(id) >= maximoDe(id)) return;
    pedido.push(id);
    guardarPedido();
    refrescarPedido();
  }

  function cambiarCantidad(id, paso) {
    if (paso > 0) {
      if (cantidadDe(id) >= maximoDe(id)) return;
      pedido.push(id);
    } else {
      // En 1, restar la saca del pedido
      pedido.splice(pedido.lastIndexOf(id), 1);
    }
    guardarPedido();
    refrescarPedido();
  }

  /* ─────────────── Catálogo ─────────────── */

  $("#desdePrecio").textContent =
    "Desde " + enQuetzales(Math.min(...PRODUCTOS.map((p) => p.precio)));

  const rejilla = $("#rejilla");
  const rejillaVacia = $("#rejillaVacia");
  const filtros = $("#filtros");

  const categorias = [
    "Todo",
    ...ORDEN_CATEGORIAS.filter((c) => PRODUCTOS.some((p) => p.categoria === c)),
    ...[...new Set(PRODUCTOS.map((p) => p.categoria))].filter(
      (c) => !ORDEN_CATEGORIAS.includes(c)
    ),
  ];

  let categoriaActiva = "Todo";

  categorias.forEach((cat) => {
    const b = document.createElement("button");
    b.className = "filtro";
    b.type = "button";
    b.textContent = cat;
    b.setAttribute("aria-pressed", String(cat === categoriaActiva));
    b.addEventListener("click", () => filtrar(cat));
    filtros.append(b);
  });

  function filtrar(cat) {
    if (cat === categoriaActiva) return;
    categoriaActiva = cat;
    $$(".filtro", filtros).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.textContent === cat))
    );

    // Con View Transitions las piezas que siguen en pantalla se mueven
    // a su lugar nuevo en vez de parpadear
    if (document.startViewTransition && !menosMovimiento.matches) {
      document.startViewTransition(() => pintarRejilla());
    } else {
      pintarRejilla();
    }
  }

  // Arma un <img> sin pasar por innerHTML, asi un nombre con comillas
  // nunca rompe el marcado
  function crearImagen(src, alt, clase) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.width = 570;
    img.height = 705;
    img.loading = "lazy";
    img.decoding = "async";
    if (clase) img.className = clase;
    return img;
  }

  function crearTexto(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    el.className = clase;
    el.textContent = texto;
    return el;
  }

  // Selector − 1 + para la cantidad de una pieza
  function crearContador(p, cantidad = 1) {
    const caja = document.createElement("div");
    caja.className = "contador";
    caja.dataset.id = p.id;
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Cantidad de " + p.nombre);

    const menos = document.createElement("button");
    menos.type = "button";
    menos.className = "contador-menos";
    menos.innerHTML = "&minus;";
    menos.setAttribute("aria-label", "Quitar uno");
    menos.addEventListener("click", () => cambiarCantidad(p.id, -1));

    const num = crearTexto("span", "contador-num", String(cantidad));
    num.setAttribute("aria-live", "polite");

    const mas = document.createElement("button");
    mas.type = "button";
    mas.className = "contador-mas";
    mas.textContent = "+";
    mas.setAttribute("aria-label", "Agregar otro");
    mas.addEventListener("click", () => cambiarCantidad(p.id, 1));

    caja.append(menos, num, mas);
    return caja;
  }

  function pintarContador(caja, cantidad) {
    const num = $(".contador-num", caja);
    if (num.textContent !== String(cantidad)) {
      num.textContent = cantidad;
      if (!menosMovimiento.matches) {
        num.animate(
          [{ transform: "scale(1.35)", color: "var(--oro-claro)" }, { transform: "none" }],
          { duration: 260, easing: "cubic-bezier(.23,1,.32,1)" }
        );
      }
    }
    $(".contador-menos", caja).setAttribute(
      "aria-label", cantidad === 1 ? "Quitar del pedido" : "Quitar uno"
    );
    $(".contador-mas", caja).disabled = cantidad >= maximoDe(caja.dataset.id);
  }

  function crearTarjeta(p, i) {
    const el = document.createElement("article");
    el.className = "tarjeta";
    el.dataset.id = p.id;
    el.style.setProperty("--i", Math.min(i, 9));
    el.style.viewTransitionName = "pieza-" + p.id;

    const foto = document.createElement("figure");
    foto.className = "tarjeta-foto";
    const img = crearImagen(p.img, p.alt);
    if (i < 3) img.loading = "eager";
    foto.append(img, crearTexto("figcaption", "tarjeta-ver", "Ver detalle"));
    if (p.agotado) {
      el.dataset.agotado = "";
      foto.append(crearTexto("span", "tarjeta-sello tarjeta-sello-agotado", "Agotado"));
    } else {
      // La etiqueta la pone la dueña en el panel. Sin catálogo en vivo
      // (respaldo datos.js) se conserva el sello de siempre en los Sets.
      const etiqueta = p.etiqueta !== undefined
        ? p.etiqueta
        : p.categoria === "Sets" ? "Lista para regalar" : "";
      if (etiqueta) foto.append(crearTexto("span", "tarjeta-sello", etiqueta));
    }

    const abrir = document.createElement("button");
    abrir.className = "tarjeta-abrir";
    abrir.type = "button";
    abrir.textContent = "Ver " + p.nombre;
    abrir.addEventListener("click", () => abrirFicha(p.id));
    foto.append(abrir);

    const cuerpo = document.createElement("div");
    cuerpo.className = "tarjeta-cuerpo";
    cuerpo.append(
      crearTexto("p", "tarjeta-cat", p.categoria),
      crearTexto("h3", "tarjeta-nombre", p.nombre),
      ...(p.sku ? [crearTexto("p", "tarjeta-sku", p.sku)] : []),
      crearTexto("p", "tarjeta-precio", enQuetzales(p.precio))
    );
    const pocas = textoPocas(p);
    if (pocas) cuerpo.append(crearTexto("p", "tarjeta-pocas", pocas));

    const acciones = document.createElement("div");
    acciones.className = "tarjeta-acciones";
    const agregar = document.createElement("button");
    agregar.className = "boton boton-linea tarjeta-agregar";
    agregar.type = "button";
    // Una vez adentro, tocarlo de nuevo no hace nada: la cantidad se cambia
    // con el contador de al lado
    agregar.addEventListener("click", () => {
      if (p.agotado) return window.open(enlaceWa(mensajeAgotado(p)), "_blank", "noopener");
      if (!pedido.includes(p.id)) agregarAlPedido(p.id);
    });
    const contador = crearContador(p, cantidadDe(p.id) || 1);
    contador.hidden = true;
    acciones.append(agregar, contador);
    cuerpo.append(acciones);

    el.append(foto, cuerpo);
    return el;
  }

  function pintarRejilla() {
    const lista =
      categoriaActiva === "Todo"
        ? PRODUCTOS
        : PRODUCTOS.filter((p) => p.categoria === categoriaActiva);

    rejilla.replaceChildren(...lista.map(crearTarjeta));
    rejillaVacia.hidden = lista.length > 0;
    sincronizarTarjetas();
  }

  // Deja las tarjetas al dia con lo que hay en el pedido
  function sincronizarTarjetas() {
    $$(".tarjeta", rejilla).forEach((el) => {
      if (el.hasAttribute("data-agotado")) {
        $(".tarjeta-agregar", el).textContent = "Agotado · Avísame";
        return;
      }
      const dentro = pedido.includes(el.dataset.id);
      el.toggleAttribute("data-en-pedido", dentro);
      const boton = $(".tarjeta-agregar", el);
      boton.textContent = dentro ? "✓ En tu pedido" : "Agregar al pedido";
      boton.setAttribute("aria-disabled", String(dentro));
      const contador = $(".contador", el);
      contador.hidden = !dentro;
      if (dentro) pintarContador(contador, cantidadDe(el.dataset.id));
    });
  }

  rejilla.dataset.primera = "";
  pintarRejilla();
  setTimeout(() => delete rejilla.dataset.primera, 1200);

  /* ─────────────── Ficha de producto ─────────────── */

  const ficha = $("#ficha");
  const fichaImg = $("#fichaImg");
  const fichaAgregar = $("#fichaAgregar");
  const fichaWa = $("#fichaWa");
  let piezaAbierta = null;

  function abrirFicha(id) {
    const p = PRODUCTOS.find((x) => x.id === id);
    if (!p) return;
    piezaAbierta = p;

    fichaImg.src = p.img;
    fichaImg.alt = p.alt;
    $("#fichaCat").textContent = p.categoria;
    $("#fichaNombre").textContent = p.nombre;
    $("#fichaSku").textContent = p.sku ? "Código " + p.sku : "";
    $("#fichaSku").hidden = !p.sku;
    $("#fichaPrecio").textContent = enQuetzales(p.precio);
    const pocas = textoPocas(p);
    $("#fichaPocas").textContent = pocas;
    $("#fichaPocas").hidden = !pocas;
    $("#fichaDesc").textContent = p.descripcion;
    $("#fichaDatos").replaceChildren(
      ...p.datos.map((d) => {
        const li = document.createElement("li");
        li.textContent = d;
        return li;
      })
    );

    fichaWa.href = enlaceWa(
      p.agotado
        ? mensajeAgotado(p)
        : "Hola Jasuel\nMe interesa esta pieza:\n*" + p.nombre + "*" + (p.sku ? " (" + p.sku + ")" : "") +
          " — " + enQuetzales(p.precio) + "\n\n¿Está disponible?"
    );
    fichaWa.textContent = p.agotado ? "Avísame cuando vuelva" : "¿Está disponible? Preguntar";
    fichaWa.target = "_blank";
    fichaWa.rel = "noopener";

    actualizarBotonFicha();
    ficha.showModal();
  }

  function actualizarBotonFicha() {
    if (!piezaAbierta) return;
    const cantidad = cantidadDe(piezaAbierta.id);
    const maximo = maximoDe(piezaAbierta.id);
    fichaAgregar.textContent = piezaAbierta.agotado
      ? "Agotado"
      : cantidad && cantidad >= maximo
        ? "Ya llevas todas las disponibles (" + cantidad + ")"
        : cantidad
          ? "Agregar otra (llevas " + cantidad + ")"
          : "Agregar al pedido";
    fichaAgregar.disabled = Boolean(piezaAbierta.agotado) || cantidad >= maximo;
  }

  fichaAgregar.addEventListener("click", () => {
    if (piezaAbierta) agregarAlPedido(piezaAbierta.id);
  });

  $("#fichaCerrar").addEventListener("click", () => ficha.close());

  // Clic fuera del contenido cierra la ficha
  ficha.addEventListener("click", (e) => {
    if (e.target === ficha) ficha.close();
  });

  /* ─────────────── Barra y lista del pedido ─────────────── */

  const barra = $("#barraPedido");
  const fab = $("#fabWa");
  let salidaBarra;

  function refrescarPedido() {
    const total = totalDelPedido();
    const unidades = pedido.length;

    $("#numPedido").textContent = unidades;
    $("#numPedidoNav").textContent = unidades;
    $("#barraTotal").textContent = unidades ? enQuetzales(total) : "";
    $("#numPedidoNav").hidden = unidades === 0;
    $(".nav-pedido").setAttribute(
      "aria-label",
      unidades ? "Mi pedido, " + unidades + (unidades === 1 ? " pieza" : " piezas") : "Mi pedido"
    );

    mostrarBarra(unidades > 0);
    fab.toggleAttribute("data-subido", unidades > 0);

    sincronizarTarjetas();
    actualizarBotonFicha();
  }

  function mostrarBarra(visible) {
    clearTimeout(salidaBarra);
    if (visible) {
      barra.removeAttribute("data-saliendo");
      barra.hidden = false;
    } else if (!barra.hidden) {
      barra.setAttribute("data-saliendo", "");
      salidaBarra = setTimeout(() => {
        barra.hidden = true;
        barra.removeAttribute("data-saliendo");
      }, 190);
    }
  }

  refrescarPedido();

  // Al volver desde la página del carrito (Atrás o en otra pestaña), el
  // pedido pudo cambiar: se relee de localStorage.
  const releerPedido = () => { pedido = leerPedido(); refrescarPedido(); };
  addEventListener("pageshow", (e) => { if (e.persisted) releerPedido(); });
  addEventListener("storage", (e) => { if (e.key === CLAVE) releerPedido(); });

  /* ─────────────── Revelado al bajar ─────────────── */

  const revelador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.setAttribute("data-visible", "");
        revelador.unobserve(e.target); // una sola vez, no cada vez que se pasa
      });
    },
    { rootMargin: "0px 0px -90px 0px", threshold: 0.1 }
  );
  $$(".revelar, .revelar-clip").forEach((el) => revelador.observe(el));

  /* ─────────────── Sección "El detalle" ─────────────── */

  const marco = $(".detalle-marco");
  const detalleImg = $("#detalleImg");

  function cambiarFoto(src, alt) {
    if (detalleImg.getAttribute("src") === src) return;
    marco.setAttribute("data-cambiando", "");

    const previa = new Image();
    previa.src = src;
    const cargada = previa.decode ? previa.decode().catch(() => {}) : Promise.resolve();
    const espera = new Promise((r) => setTimeout(r, 240));

    Promise.all([cargada, espera]).then(() => {
      detalleImg.src = src;
      detalleImg.alt = alt;
      requestAnimationFrame(() => marco.removeAttribute("data-cambiando"));
    });
  }

  const pasos = $$(".detalle-paso");

  if (pasos.length) {
    // La banda es el centro de la pantalla: el paso que la cruza manda
    const vigia = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (!e.isIntersecting) return;
          pasos.forEach((p) => p.toggleAttribute("data-activo", p === e.target));
          cambiarFoto(e.target.dataset.img, $("h3", e.target).textContent);
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    pasos.forEach((p) => vigia.observe(p));
    pasos[0].setAttribute("data-activo", "");
  }

  /* ─────────────── Navegación ─────────────── */

  const nav = $("#nav");
  const menu = $("#menuMovil");
  const botonMenu = $("#abrirMenu");
  let salidaMenu;

  function abrirMenu() {
    clearTimeout(salidaMenu);
    menu.removeAttribute("data-saliendo");
    menu.hidden = false;
    botonMenu.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    $("nav a", menu).focus({ preventScroll: true });
  }

  function cerrarMenu() {
    if (menu.hidden) return;
    menu.setAttribute("data-saliendo", "");
    botonMenu.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    salidaMenu = setTimeout(() => {
      menu.hidden = true;
      menu.removeAttribute("data-saliendo");
    }, 160);
  }

  botonMenu.addEventListener("click", abrirMenu);
  $("#cerrarMenu").addEventListener("click", cerrarMenu);
  $$("a", menu).forEach((a) => a.addEventListener("click", cerrarMenu));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarMenu();
  });

  let pendiente = false;
  addEventListener(
    "scroll",
    () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        nav.toggleAttribute("data-fijo", scrollY > 40);
        pendiente = false;
      });
    },
    { passive: true }
  );

  /* ─────────────── Reflejo dorado de la portada ─────────────── */

  const hero = $(".hero");
  const luz = $(".hero-luz");

  if (hero && luz && punteroFino.matches && !menosMovimiento.matches) {
    let destinoX = 50, destinoY = 38, x = 50, y = 38, corriendo = false;

    const seguir = () => {
      // Amortiguado: la luz llega un poco despues del puntero, no pegada
      x += (destinoX - x) * 0.07;
      y += (destinoY - y) * 0.07;
      luz.style.setProperty("--lx", x.toFixed(2) + "%");
      luz.style.setProperty("--ly", y.toFixed(2) + "%");

      if (Math.abs(destinoX - x) > 0.1 || Math.abs(destinoY - y) > 0.1) {
        requestAnimationFrame(seguir);
      } else {
        corriendo = false;
      }
    };

    hero.addEventListener(
      "pointermove",
      (e) => {
        const caja = hero.getBoundingClientRect();
        destinoX = ((e.clientX - caja.left) / caja.width) * 100;
        destinoY = ((e.clientY - caja.top) / caja.height) * 100;
        if (!corriendo) {
          corriendo = true;
          requestAnimationFrame(seguir);
        }
      },
      { passive: true }
    );
  }

  /* ─────────────── Detalles finales ─────────────── */

  $("#anio").textContent = new Date().getFullYear();
})();
