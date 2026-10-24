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
    "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(texto);

  if (CONFIG.whatsapp === "50200000000") {
    console.warn("JASUEL: falta poner el numero real de WhatsApp en js/datos.js");
  }

  /* ─────────────── Enlaces de WhatsApp sueltos ─────────────── */

  $$("[data-wa]").forEach((el) => {
    el.href = enlaceWa(el.dataset.wa);
    el.target = "_blank";
    el.rel = "noopener";
  });

  /* ─────────────── El pedido ─────────────── */

  const CLAVE = "jasuel-pedido";

  function leerPedido() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE));
      // Solo sobreviven los ids que todavia existen en el catalogo
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
      /* navegacion privada: el pedido vive solo mientras dure la visita */
    }
  }

  let pedido = leerPedido();

  const piezasDelPedido = () =>
    pedido.map((id) => PRODUCTOS.find((p) => p.id === id)).filter(Boolean);

  const totalDelPedido = () =>
    piezasDelPedido().reduce((suma, p) => suma + p.precio, 0);

  function alternarEnPedido(id) {
    const i = pedido.indexOf(id);
    if (i === -1) pedido.push(id);
    else pedido.splice(i, 1);
    guardarPedido();
    refrescarPedido();
  }

  function quitarDelPedido(id) {
    pedido = pedido.filter((x) => x !== id);
    guardarPedido();
    refrescarPedido();
  }

  /* ─────────────── Catálogo ─────────────── */

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
      crearTexto("p", "tarjeta-precio", enQuetzales(p.precio))
    );

    const acciones = document.createElement("div");
    acciones.className = "tarjeta-acciones";
    const agregar = document.createElement("button");
    agregar.className = "boton boton-linea tarjeta-agregar";
    agregar.type = "button";
    agregar.addEventListener("click", () => alternarEnPedido(p.id));
    acciones.append(agregar);
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
      const dentro = pedido.includes(el.dataset.id);
      el.toggleAttribute("data-en-pedido", dentro);
      const boton = $(".tarjeta-agregar", el);
      boton.textContent = dentro ? "Agregado" : "Agregar";
      boton.setAttribute("aria-pressed", String(dentro));
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
    $("#fichaPrecio").textContent = enQuetzales(p.precio);
    $("#fichaDesc").textContent = p.descripcion;
    $("#fichaDatos").replaceChildren(
      ...p.datos.map((d) => {
        const li = document.createElement("li");
        li.textContent = d;
        return li;
      })
    );

    fichaWa.href = enlaceWa(
      "Hola Jasuel, me interesa esta pieza: " + p.nombre +
        " (" + enQuetzales(p.precio) + "). ¿Está disponible?"
    );
    fichaWa.target = "_blank";
    fichaWa.rel = "noopener";

    actualizarBotonFicha();
    ficha.showModal();
  }

  function actualizarBotonFicha() {
    if (!piezaAbierta) return;
    const dentro = pedido.includes(piezaAbierta.id);
    fichaAgregar.textContent = dentro ? "Quitar del pedido" : "Agregar al pedido";
    fichaAgregar.classList.toggle("boton-oro", !dentro);
    fichaAgregar.classList.toggle("boton-linea", dentro);
  }

  fichaAgregar.addEventListener("click", () => {
    if (piezaAbierta) alternarEnPedido(piezaAbierta.id);
  });

  $("#fichaCerrar").addEventListener("click", () => ficha.close());

  // Clic fuera del contenido cierra la ficha
  ficha.addEventListener("click", (e) => {
    if (e.target === ficha) ficha.close();
  });

  /* ─────────────── Barra y lista del pedido ─────────────── */

  const barra = $("#barraPedido");
  const pedidoLista = $("#pedidoLista");
  const pedidoVacio = $("#pedidoVacio");
  const fab = $("#fabWa");
  let salidaBarra;

  function refrescarPedido() {
    const piezas = piezasDelPedido();
    const total = totalDelPedido();

    $("#numPedido").textContent = piezas.length;
    $("#numPedidoNav").textContent = piezas.length;
    $("#barraTotal").textContent = piezas.length ? enQuetzales(total) : "";
    $("#pedidoTotal").textContent = piezas.length ? "· " + enQuetzales(total) : "";
    $("#abrirPedido").hidden = piezas.length === 0;

    mostrarBarra(piezas.length > 0);
    fab.toggleAttribute("data-subido", piezas.length > 0);

    pedidoVacio.hidden = piezas.length > 0;
    pedidoLista.replaceChildren(
      ...piezas.map((p) => {
        const li = document.createElement("li");
        const miniatura = crearImagen(p.img, "");
        miniatura.width = 52;
        miniatura.height = 64;
        li.append(
          miniatura,
          crearTexto("span", "pl-nombre", p.nombre),
          crearTexto("span", "pl-precio", enQuetzales(p.precio))
        );
        const quitar = document.createElement("button");
        quitar.className = "pedido-quitar";
        quitar.type = "button";
        quitar.innerHTML = "&times;";
        quitar.setAttribute("aria-label", "Quitar " + p.nombre);
        quitar.addEventListener("click", () => quitarDelPedido(p.id));
        li.append(quitar);
        return li;
      })
    );

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

  const irAContacto = () =>
    $("#contacto").scrollIntoView({
      behavior: menosMovimiento.matches ? "auto" : "smooth",
      block: "start",
    });

  $("#barraInfo").addEventListener("click", irAContacto);
  $("#abrirPedido").addEventListener("click", irAContacto);

  refrescarPedido();

  /* ─────────────── Formulario: arma el mensaje ─────────────── */

  $("#formulario").addEventListener("submit", (e) => {
    e.preventDefault();

    const nombre = $("#nombre").value.trim();
    const zona = $("#zona").value.trim();
    const nota = $("#nota").value.trim();
    const piezas = piezasDelPedido();

    const lineas = [];
    lineas.push(
      nombre
        ? "Hola Jasuel, soy " + nombre + (zona ? " (" + zona + ")" : "") + "."
        : "Hola Jasuel, vengo de la página web."
    );

    if (piezas.length) {
      lineas.push("", "Quiero pedir:");
      piezas.forEach((p) => lineas.push("• " + p.nombre + " — " + enQuetzales(p.precio)));
      lineas.push("", "Total aproximado: " + enQuetzales(totalDelPedido()));
    } else {
      lineas.push("", "Quiero información sobre sus joyas.");
    }

    if (zona && !nombre) lineas.push("", "Estoy en " + zona + ".");
    if (nota) lineas.push("", "Nota: " + nota);

    window.open(enlaceWa(lineas.join("\n")), "_blank", "noopener");
  });

  /* ─────────────── Instagram ─────────────── */

  $("#instaRejilla").replaceChildren(
    ...PRODUCTOS.slice(0, 6).map((p) => {
      const a = document.createElement("a");
      a.href = "https://instagram.com/" + CONFIG.instagram;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", "Ver " + p.nombre + " en Instagram");
      a.append(crearImagen(p.img, p.alt));
      return a;
    })
  );

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
        fab.toggleAttribute("data-visible", scrollY > innerHeight * 0.55);
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
