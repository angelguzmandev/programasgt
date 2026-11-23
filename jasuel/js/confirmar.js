/* ============================================================
   JASUEL · Confirmación del pedido por la clienta
   ------------------------------------------------------------
   La dueña manda desde el panel un link único:
     /jasuel/confirmar/?t=<token>
   Aquí la clienta revisa su pedido (piezas, envío y total que
   ya acordaron), completa su dirección y confirma. La base pasa
   el pedido a "confirmado" y descuenta el inventario.

   Todo el texto que llega de la base se pinta con textContent.
   Depende de CONFIG (js/datos.js).
   ============================================================ */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let whatsapp = CONFIG.whatsapp;
  let moneda = CONFIG.moneda;
  const enDinero = (n) => moneda + Number(n).toLocaleString("es-GT", { maximumFractionDigits: 2 });

  function enlacesWhatsApp() {
    $$("[data-wa]").forEach((el) => {
      el.href = "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(el.dataset.wa);
      el.target = "_blank";
      el.rel = "noopener";
    });
  }
  enlacesWhatsApp();

  function mostrar(vista) {
    ["vCargando", "vError", "vPedido"].forEach((v) => { $("#" + v).hidden = v !== vista; });
  }

  function error(texto) {
    $("#errorTexto").textContent = texto;
    mostrar("vError");
  }

  function anunciar(texto) {
    $("#anuncio").textContent = "";
    requestAnimationFrame(() => { $("#anuncio").textContent = texto; });
  }

  async function llamar(funcion, datos) {
    const r = await fetch(CONFIG.api + "rpc/" + funcion, {
      method: "POST",
      headers: { apikey: CONFIG.apiClave, "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(cuerpo.message || "HTTP " + r.status);
    return cuerpo;
  }

  const MENSAJES = {
    link_invalido: "Este link no es válido. Pídele a la tienda que te lo envíe de nuevo.",
    link_vencido: "Este link ya venció. Escríbenos y te mandamos uno nuevo.",
    pedido_cerrado: "Este pedido fue cancelado. Si tienes dudas, escríbenos.",
    ya_confirmado: "Este pedido ya estaba confirmado.",
    nombre_invalido: "Escribe el nombre de quien recibe.",
    departamento_invalido: "Elige tu departamento.",
    zona_invalida: "Escribe tu municipio y zona.",
    direccion_invalida: "Escribe tu dirección exacta para que Cargo Expresso te encuentre.",
    referencias_muy_largas: "Las referencias son muy largas. Acórtalas un poco.",
    correo_invalido: "Revisa tu correo, o déjalo vacío.",
  };
  const traducir = (m) =>
    /^sin_stock:/.test(m)
      ? "Lo sentimos, " + m.slice(10) + " se agotó mientras tanto. Escríbenos y buscamos una opción para ti."
      : MENSAJES[m] || "No pudimos confirmar tu pedido. Inténtalo de nuevo o escríbenos por WhatsApp.";

  /* ─────────────── Cargar el pedido ─────────────── */

  const token = new URLSearchParams(location.search).get("t") || "";
  let pedido = null;

  function pintar(p) {
    pedido = p;
    whatsapp = p.whatsapp || whatsapp;
    moneda = p.moneda || moneda;
    enlacesWhatsApp();

    document.title = "Pedido " + p.codigo + " · " + p.tienda;
    $("#codigo").textContent = "Pedido " + p.codigo;
    $("#mensajeria").textContent = p.mensajeria;

    $("#piezas").replaceChildren(
      ...p.items.map((i) => {
        const li = document.createElement("li");
        const n = document.createElement("span");
        n.textContent = (i.cantidad > 1 ? i.cantidad + " × " : "") + i.nombre;
        const v = document.createElement("span");
        v.textContent = enDinero(Number(i.precio) * i.cantidad);
        li.append(n, v);
        return li;
      })
    );
    $("#subtotal").textContent = enDinero(p.subtotal);
    $("#envio").textContent = Number(p.costo_envio) ? enDinero(p.costo_envio) : "Incluido";
    $("#filaDescuento").hidden = !Number(p.descuento);
    $("#descuento").textContent = "−" + enDinero(p.descuento);
    $("#total").textContent = enDinero(p.total);

    if (p.estado === "nuevo") {
      $("#cNombre").value = p.nombre || "";
      $("#cDepartamento").value = p.departamento || "";
      $("#cZona").value = p.zona || "";
      $("#cDireccion").value = p.direccion || "";
      $("#cReferencias").value = p.referencias || "";
      $("#cCorreo").value = p.correo || "";
      $("#bloqueFormulario").hidden = false;
      $("#bloqueListo").hidden = true;
    } else {
      listo(p.estado);
    }
    mostrar("vPedido");
  }

  function listo(estadoPedido) {
    const textos = {
      confirmado: "Tu pedido " + pedido.codigo + " está confirmado. Total a pagar al recibir: " +
        enDinero(pedido.total) + ". Te avisamos por WhatsApp cuando salga.",
      enviado: "Tu pedido " + pedido.codigo + " ya va en camino con " + pedido.mensajeria +
        ". Ten listo " + enDinero(pedido.total) + " para pagar al recibir.",
      entregado: "Tu pedido " + pedido.codigo + " ya fue entregado. ¡Gracias por tu compra!",
      liquidado: "Tu pedido " + pedido.codigo + " ya fue entregado. ¡Gracias por tu compra!",
    };
    $("#tituloPedido").textContent = estadoPedido === "confirmado" ? "¡Listo, gracias!" : "Tu pedido";
    $("#subtitulo").hidden = true;
    $("#listoTitulo").textContent = estadoPedido === "confirmado" ? "¡Pedido confirmado!" : "Estado de tu pedido";
    $("#listoTexto").textContent = textos[estadoPedido] || "";
    $("#verEstado").href = "../pedido/?n=" + encodeURIComponent(pedido.codigo);
    $("#bloqueFormulario").hidden = true;
    $("#bloqueListo").hidden = false;
  }

  async function cargar() {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return error(MENSAJES.link_invalido);
    }
    try {
      const p = await llamar("ver_pedido_por_token", { p_token: token });
      if (p.estado === "cancelado" || p.estado === "devuelto") return error(MENSAJES.pedido_cerrado);
      pintar(p);
    } catch (e) {
      const m = e.message || "";
      error(MENSAJES[m] || "No pudimos cargar tu pedido. Revisa tu conexión o escríbenos por WhatsApp.");
    }
  }

  /* ─────────────── Confirmar ─────────────── */

  const avisoError = $("#error");
  const boton = $("#confirmar");

  function fallo(texto, campo) {
    avisoError.textContent = texto;
    avisoError.hidden = false;
    if (campo) $(campo).focus();
  }

  $("#formConfirmar").addEventListener("submit", async (e) => {
    e.preventDefault();
    avisoError.hidden = true;

    const datos = {
      p_token: token,
      p_nombre: $("#cNombre").value.trim(),
      p_departamento: $("#cDepartamento").value,
      p_zona: $("#cZona").value.trim(),
      p_direccion: $("#cDireccion").value.trim(),
      p_referencias: $("#cReferencias").value.trim(),
      p_correo: $("#cCorreo").value.trim(),
    };

    if (!datos.p_nombre) return fallo(MENSAJES.nombre_invalido, "#cNombre");
    if (!datos.p_departamento) return fallo(MENSAJES.departamento_invalido, "#cDepartamento");
    if (!datos.p_zona) return fallo(MENSAJES.zona_invalida, "#cZona");
    if (datos.p_direccion.length < 5) return fallo(MENSAJES.direccion_invalida, "#cDireccion");
    if (datos.p_correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.p_correo)) {
      return fallo(MENSAJES.correo_invalido, "#cCorreo");
    }

    boton.disabled = true;
    boton.textContent = "Confirmando…";
    try {
      await llamar("confirmar_pedido_cliente", datos);
      pedido.estado = "confirmado";
      listo("confirmado");
      window.scrollTo({ top: 0, behavior: "smooth" });
      anunciar("¡Pedido confirmado!");
    } catch (err) {
      const m = err.message || "";
      if (m === "ya_confirmado") {
        pedido.estado = "confirmado";
        return listo("confirmado");
      }
      fallo(traducir(m));
    } finally {
      boton.disabled = false;
      boton.textContent = "Confirmar mi pedido";
    }
  });

  cargar();
})();
