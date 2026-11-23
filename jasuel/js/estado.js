/* ============================================================
   JASUEL · Estado de mi pedido (/jasuel/pedido/)
   ------------------------------------------------------------
   La clienta escribe su número de pedido y su WhatsApp. La base
   (función consultar_pedido) solo responde si los dos coinciden,
   limita los intentos fallidos y nunca devuelve dirección ni
   teléfono. Acepta ?n=JAS0042 para llegar con el número escrito.
   Depende de CONFIG (js/datos.js).
   ============================================================ */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const enDinero = (n) => CONFIG.moneda + Number(n).toLocaleString("es-GT", { maximumFractionDigits: 2 });
  const enlaceWa = (texto) => "https://api.whatsapp.com/send?phone=" + CONFIG.whatsapp + "&text=" + encodeURIComponent(texto);
  const fecha = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  document.querySelectorAll("[data-wa]").forEach((el) => {
    el.href = enlaceWa(el.dataset.wa);
    el.target = "_blank";
    el.rel = "noopener";
  });

  async function copiar(boton, texto) {
    const original = boton.textContent;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Navegadores viejos: se copia con un campo temporal
      const t = Object.assign(document.createElement("textarea"), { value: texto });
      document.body.append(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    boton.textContent = "¡Copiado!";
    boton.classList.add("copiado");
    setTimeout(() => { boton.textContent = original; boton.classList.remove("copiado"); }, 1800);
  }

  let actual = null;
  $("#rCopiarCodigo").addEventListener("click", (e) => actual && copiar(e.currentTarget, actual.codigo));
  $("#rCopiarGuia").addEventListener("click", (e) => actual && copiar(e.currentTarget, actual.guia));

  // Las fotos guardadas como "assets/…" son relativas a /jasuel/
  const foto = (src) => (!src ? "" : /^https?:\/\//.test(src) ? src : "../" + src);

  const form = $("#formEstado");
  const error = $("#eError");
  const boton = $("#eBuscar");

  // Llega desde el mensaje de la tienda con el número ya escrito
  const n = new URLSearchParams(location.search).get("n");
  if (n && /^[A-Za-z0-9 -]{1,20}$/.test(n)) $("#eCodigo").value = n.toUpperCase();
  (n ? $("#eTelefono") : $("#eCodigo")).focus({ preventScroll: true });

  function mostrarError(texto, campo) {
    error.textContent = texto;
    error.hidden = false;
    if (campo) $(campo).focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const codigo = $("#eCodigo").value.trim();
    const telefono = $("#eTelefono").value.trim();
    const digitos = telefono.replace(/\D/g, "");

    if (!/\d/.test(codigo)) return mostrarError("Escribe tu número de pedido, por ejemplo JAS0042.", "#eCodigo");
    if (!(digitos.length === 8 || (digitos.length >= 10 && digitos.length <= 15))) {
      return mostrarError("Escribe el número de teléfono que diste al hacer tu pedido (8 dígitos).", "#eTelefono");
    }

    boton.disabled = true;
    boton.textContent = "Buscando…";
    try {
      let r;
      try {
        r = await fetch(CONFIG.api + "rpc/consultar_pedido", {
          method: "POST",
          headers: { apikey: CONFIG.apiClave, "Content-Type": "application/json" },
          body: JSON.stringify({ p_tienda: CONFIG.tienda, p_codigo: codigo, p_telefono: telefono }),
        });
      } catch (err) {
        // Solo un fallo de red es "sin conexión"
        console.warn(err);
        return mostrarError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
      }
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) {
        const m = datos.message || "";
        return mostrarError(
          m === "demasiados_intentos"
            ? "Hiciste muchos intentos. Espera un rato o escríbenos por WhatsApp y te ayudamos."
            : m === "datos_invalidos"
              ? "Revisa tu número de pedido y tu número de teléfono."
              : "No pudimos consultar tu pedido. Inténtalo de nuevo en un momento."
        );
      }
      if (!datos.encontrado) {
        return mostrarError("No encontramos un pedido con esos datos. Revisa el número de pedido y el teléfono que diste al pedir.");
      }
      pintar(datos);
    } catch (err) {
      console.error(err);
      mostrarError("No pudimos mostrar tu pedido. Escríbenos por WhatsApp y te ayudamos.");
    } finally {
      boton.disabled = false;
      boton.textContent = "Ver estado";
    }
  });

  /* ─────────────── Resultado ─────────────── */

  const TITULOS = {
    nuevo: ["Recibimos tu pedido", "Lo estamos revisando. Te escribimos por WhatsApp para confirmar disponibilidad y envío."],
    confirmado: ["Pedido confirmado", "Lo estamos preparando. Te avisamos cuando salga."],
    enviado: ["Va en camino", "Tu pedido ya salió. Ten listo el pago para cuando llegue."],
    entregado: ["Entregado", "¡Gracias por tu compra! Esperamos que disfrutes tus piezas."],
    liquidado: ["Entregado", "¡Gracias por tu compra! Esperamos que disfrutes tus piezas."],
    cancelado: ["Pedido cancelado", "Este pedido se canceló. Si tienes dudas, escríbenos."],
    devuelto: ["Pedido devuelto", "El paquete regresó a la tienda. Escríbenos para coordinar."],
  };

  function pintar(p) {
    actual = p;
    const [titulo, sub] = TITULOS[p.estado] || ["Tu pedido", ""];
    $("#rCodigo").textContent = "Pedido " + p.codigo;
    $("#rTitulo").textContent = titulo;
    $("#rSub").textContent = (p.nombre ? "Hola " + p.nombre + ". " : "") + sub;

    // Línea de tiempo: cada paso con su fecha si ya pasó
    const cerrado = p.estado === "cancelado" || p.estado === "devuelto";
    const pasos = [
      ["Recibido", p.creado_en],
      ["Confirmado", p.confirmado_en],
      ["En camino", p.enviado_en],
      ["Entregado", p.entregado_en],
    ];
    const pasoActual = pasos.reduce((ultimo, [, f], i) => (f ? i : ultimo), 0);
    $("#rPasos").classList.toggle("linea-cerrada", cerrado);
    $("#rPasos").replaceChildren(
      ...pasos.map(([nombre, f], i) => {
        const li = document.createElement("li");
        li.className = f ? "paso-hecho" : "paso-pendiente";
        if (i === pasoActual && !cerrado) li.setAttribute("aria-current", "step");
        const t = document.createElement("strong");
        t.textContent = nombre;
        const d = document.createElement("span");
        d.textContent = f ? fecha.format(new Date(f)) : "Pendiente";
        li.append(t, d);
        return li;
      })
    );

    const conGuia = (p.estado === "enviado" || p.estado === "entregado" || p.estado === "liquidado") && p.guia;
    $("#rGuia").hidden = !conGuia;
    $("#rGuiaRotulo").textContent = "Guía de " + p.mensajeria;
    $("#rGuiaNumero").textContent = conGuia ? p.guia : "";

    // Desglose: foto, nombre, SKU, cantidad × precio y total de cada pieza
    $("#rPiezas").replaceChildren(
      ...p.items.map((i) => {
        const li = document.createElement("li");
        const img = document.createElement("img");
        img.alt = "";
        img.width = 56;
        img.height = 70;
        if (i.imagen) img.src = foto(i.imagen);
        const texto = document.createElement("div");
        texto.className = "estado-pieza-texto";
        const nombre = document.createElement("strong");
        nombre.textContent = i.nombre;
        const detalle = document.createElement("span");
        const precio = i.precio !== undefined ? Number(i.precio) : null;
        detalle.textContent = [
          i.sku,
          precio !== null ? i.cantidad + " × " + enDinero(precio) : i.cantidad + (i.cantidad === 1 ? " pieza" : " piezas"),
        ].filter(Boolean).join(" · ");
        texto.append(nombre, detalle);
        const total = document.createElement("span");
        total.className = "estado-pieza-total";
        total.textContent = precio !== null ? enDinero(precio * i.cantidad) : "";
        li.append(img, texto, total);
        return li;
      })
    );

    const porPagar = ["nuevo", "confirmado", "enviado"].includes(p.estado);
    const envio = Number(p.costo_envio) || 0;
    const descuento = Number(p.descuento) || 0;
    $("#rSubtotal").textContent = p.subtotal !== undefined ? enDinero(p.subtotal) : "—";
    $("#rEnvio").textContent = envio ? enDinero(envio) : p.estado === "nuevo" ? "Por confirmar" : "Incluido";
    $("#rFilaDescuento").hidden = !descuento;
    $("#rDescuento").textContent = "−" + enDinero(descuento);
    $("#rTotalTexto").textContent = porPagar ? "Total a pagar al recibir" : "Total";
    $("#rTotal").textContent = enDinero(p.total) + (porPagar && !envio && p.estado === "nuevo" ? " + envío" : "");
    $("#rPago").textContent = porPagar
      ? "Pagas en efectivo cuando " + p.mensajeria + " te entregue el paquete."
      : "";
    $("#rPago").hidden = !porPagar;

    $("#rWhatsapp").href = enlaceWa("Hola Jasuel\nTengo una pregunta sobre mi pedido *" + p.codigo + "*.");
    $("#rWhatsapp").target = "_blank";
    $("#rWhatsapp").rel = "noopener";

    form.hidden = true;
    $("#resultado").hidden = false;
    $("#resultado").scrollIntoView({ block: "start" });
  }

  $("#rOtro").addEventListener("click", () => {
    $("#resultado").hidden = true;
    form.hidden = false;
    $("#eCodigo").value = "";
    $("#eCodigo").focus();
  });
})();
