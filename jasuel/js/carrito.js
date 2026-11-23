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
  // Las fotos subidas desde el panel ya son URLs completas
  const ruta = (src) => (/^https?:\/\//.test(src) ? src : "../" + src);

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
  const MAX_POR_PIEZA = 10; // igual que crear_pedido en la base

  // Tope por pieza: lo que hay en existencia (si la tienda la controla), máximo 20
  function maximoDe(id) {
    const p = PRODUCTOS.find((x) => x.id === id);
    if (!p) return 0;
    return Number.isInteger(p.existencia) ? Math.min(MAX_POR_PIEZA, p.existencia) : MAX_POR_PIEZA;
  }

  // Piezas que se quitaron o recortaron al leer (agotadas o con menos existencia)
  let ajustadas = [];

  function leerPedido() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE));
      if (!Array.isArray(guardado)) return [];
      const pedidas = {};
      guardado.forEach((id) => { pedidas[id] = (pedidas[id] || 0) + 1; });

      // Productos que siguen en el catálogo pero ya no alcanzan (agotados o con menos)
      ajustadas = Object.keys(pedidas)
        .map((id) => PRODUCTOS.find((p) => p.id === id))
        .filter((p) => p && maximoDe(p.id) < pedidas[p.id])
        .map((p) => p.nombre);

      const cuenta = {};
      return guardado.filter((id) => {
        cuenta[id] = (cuenta[id] || 0) + 1;
        return cuenta[id] <= maximoDe(id);
      });
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
      if (cantidadDe(id) >= maximoDe(id)) return;
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
    mas.disabled = p.cantidad >= maximoDe(p.id);
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
        if (p.sku) {
          const sku = document.createElement("span");
          sku.className = "cl-sku";
          sku.textContent = p.sku;
          info.append(sku);
        }

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

  // "Set Perla Clásica (SET0006)": con el SKU la tienda sabe exacto qué pieza es
  const skuDe = (id) => (PRODUCTOS.find((p) => p.id === id) || {}).sku || "";
  const conSku = (nombre, id) => nombre + (skuDe(id) ? " (" + skuDe(id) + ")" : "");

  // Lista de piezas en texto, para el mensaje de WhatsApp
  const lineasDePiezas = () =>
    piezas().map(
      (p) =>
        "• " + conSku(p.nombre, p.id) + (p.cantidad > 1 ? " ×" + p.cantidad : "") +
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
      ["Hola Jasuel 👋", "Estaba por hacer un pedido y tengo una duda antes de confirmar:", "",
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

  /* ─────────────── Confirmar: registrar el pedido y abrir WhatsApp ───────────────
     El pedido se guarda en la base (función crear_pedido), que recalcula
     los precios y devuelve un número como JAS0042. Ese número viaja en
     el mensaje para que la tienda lo encuentre en su panel. Si la base
     no responde, WhatsApp se abre igual: la venta nunca se pierde. */

  const API = window.JASUEL_API;
  const errorForm = $("#carritoError");
  const botonConfirmar = $("#carritoConfirmar");

  function mostrarError(texto, campo) {
    errorForm.textContent = texto;
    errorForm.hidden = false;
    if (campo) $(campo).focus();
  }

  // Traduce los errores de la base a algo que la clienta entienda
  function errorDeLaBase(mensaje) {
    if (/^agotado:/.test(mensaje)) {
      return "Lo sentimos, " + mensaje.slice(8) + " ya no está disponible en esa cantidad. Ajusta tu pedido.";
    }
    if (/^no_disponible:/.test(mensaje)) {
      return "Una pieza de tu pedido ya no está disponible. Recarga la página para ver el catálogo actualizado.";
    }
    const textos = {
      telefono_invalido: "Revisa tu número de teléfono: deben ser 8 dígitos.",
      nombre_invalido: "Escribe tu nombre.",
      zona_invalida: "Escribe tu zona o municipio.",
      nota_muy_larga: "La nota es muy larga. Acórtala un poco.",
      demasiados_pedidos: "Ya recibimos varios pedidos tuyos hace poco. Escríbenos por WhatsApp y te ayudamos.",
      pedido_muy_grande: "Tu pedido es muy grande para hacerlo en línea. Escríbenos por WhatsApp y te ayudamos.",
    };
    return textos[mensaje] || null; // null = error técnico: se sigue sin registrar
  }

  async function registrarPedido(datos) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 8000);
    try {
      const r = await fetch(API.base + "rpc/crear_pedido", {
        method: "POST",
        headers: { apikey: API.clave, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_tienda: API.tienda,
          p_items: piezas().map((p) => ({ id: p.id, cantidad: p.cantidad })),
          p_nombre: datos.nombre,
          p_telefono: datos.telefono,
          p_zona: datos.zona,
          p_nota: datos.nota,
        }),
        signal: control.signal,
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, pedido: cuerpo };
      return { ok: false, mensaje: errorDeLaBase(cuerpo.message || "") };
    } catch (err) {
      console.warn("JASUEL: no se pudo registrar el pedido", err);
      return { ok: false, mensaje: null };
    } finally {
      clearTimeout(reloj);
    }
  }

  function mensajeWhatsApp(datos, registrado) {
    const items = registrado
      ? registrado.items.map((i) => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: Number(i.precio) }))
      : piezas();
    const suma = registrado ? Number(registrado.subtotal) : total();

    // WhatsApp pone en negrita lo que va entre *asteriscos*
    const lineas = [
      "Hola Jasuel 👋",
      "Soy *" + datos.nombre + "* (" + datos.zona + ").",
      "",
      "🛍️ " + (registrado ? "*Pedido " + registrado.codigo + "*" : "*Pedido desde la página web*"),
      ...items.map((p) =>
        "• " + conSku(p.nombre, p.id) + (p.cantidad > 1 ? " ×" + p.cantidad : "") + " — " + enQuetzales(p.precio * p.cantidad)
      ),
      "",
      "*Total aproximado:* " + enQuetzales(suma),
      "*Envío:* por confirmar según mi ubicación (Cargo Expresso)",
      "*Pago:* contra entrega",
    ];
    if (datos.nota) lineas.push("", "📝 *Nota:* " + datos.nota);
    return enlaceWa(lineas.join("\n"));
  }

  $("#carritoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorForm.hidden = true;

    const datos = {
      nombre: $("#nombre").value.trim(),
      telefono: $("#telefono").value.trim(),
      zona: $("#zona").value.trim(),
      nota: $("#nota").value.trim(),
    };
    const digitos = datos.telefono.replace(/\D/g, "");

    if (!datos.nombre) return mostrarError("Escribe tu nombre.", "#nombre");
    if (!(digitos.length === 8 || (digitos.length >= 10 && digitos.length <= 15))) {
      return mostrarError("Revisa tu número de teléfono: deben ser 8 dígitos.", "#telefono");
    }
    if (!datos.zona) return mostrarError("Escribe tu zona o municipio.", "#zona");
    if (!piezas().length) return;

    // Se abre ya, dentro del clic: después de esperar, el navegador la bloquearía
    const ventana = window.open("", "_blank");
    if (ventana) ventana.opener = null;

    botonConfirmar.disabled = true;
    botonConfirmar.textContent = "Registrando tu pedido…";
    const resultado = API ? await registrarPedido(datos) : { ok: false, mensaje: null };
    botonConfirmar.disabled = false;
    botonConfirmar.textContent = "Confirmar mi pedido por WhatsApp";

    // Problema con el pedido (pieza agotada, teléfono, etc.): se avisa y no se envía
    if (!resultado.ok && resultado.mensaje) {
      if (ventana) ventana.close();
      return mostrarError(resultado.mensaje);
    }

    const url = mensajeWhatsApp(datos, resultado.ok ? resultado.pedido : null);
    if (ventana) ventana.location.href = url;
    else location.href = url;

    // Registrado: se vacía el carrito y queda el botón por si WhatsApp no se abrió
    if (resultado.ok) {
      pedido = [];
      guardarPedido();
      $("#carritoVacioTexto").textContent =
        "¡Listo! Registramos tu pedido " + resultado.pedido.codigo +
        ". Envíanos el mensaje de WhatsApp para confirmarlo.";
      const reenviar = $("#carritoReenviar");
      reenviar.href = url;
      reenviar.hidden = false;
      const rastrear = $("#carritoRastrear");
      rastrear.href = "../pedido/?n=" + encodeURIComponent(resultado.pedido.codigo);
      rastrear.hidden = false;
      pintar();
      anunciar("Registramos tu pedido " + resultado.pedido.codigo + ".");
    }
  });

  // Si cambian el pedido en otra pestaña, o vuelven con el botón Atrás
  addEventListener("storage", (e) => {
    if (e.key === CLAVE) { pedido = leerPedido(); pintar(); }
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) { pedido = leerPedido(); pintar(); }
  });

  pintar();

  // Si algo de lo elegido se agotó o ya no alcanza, se avisa (no se quita en silencio)
  if (ajustadas.length) {
    guardarPedido();
    const texto = "Ajustamos tu pedido: " + ajustadas.join(", ") +
      (ajustadas.length === 1 ? " ya no está disponible" : " ya no están disponibles") +
      " en la cantidad que elegiste.";
    if (pedido.length) mostrarError(texto);
    else $("#carritoVacioTexto").textContent = texto;
    anunciar(texto);
  }
})();
