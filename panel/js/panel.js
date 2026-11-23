// ============================================================
// PROGRAMASGT · Panel de administración de tiendas
// ------------------------------------------------------------
// Un solo panel para todas las tiendas. Cada usuario ve solo las
// tiendas de las que es miembro (o todas, si es admin de la
// plataforma). Los permisos REALES los aplica la base con RLS:
// este archivo solo decide qué mostrar.
//
// Todo el texto que viene de la base se pinta con textContent,
// nunca con innerHTML, para que un nombre de producto no pueda
// inyectar código.
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
import {
  SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, WHATSAPP_SOPORTE, FOTO_LADO_MAX, FOTO_CALIDAD,
} from "./config.js";
import { pintarInicio, rangoPeriodo, nombreMes, hoyGT } from "./inicio.js?v=2";
import { construirHojas, descargarExcel } from "./excel.js?v=1";

// Nadie puede meter el panel dentro de otra página (clickjacking). La CSP
// por <meta> no admite frame-ancestors, por eso se hace aquí.
if (window.top !== window.self) {
  document.documentElement.hidden = true;
  try { window.top.location = window.location.href; } catch { /* otro sitio: queda oculto */ }
  throw new Error("El panel no se puede abrir dentro de otra página.");
}

// La sesión vive solo en esta pestaña (sessionStorage): al cerrar la pestaña
// o el navegador, la próxima vez pide contraseña y código otra vez.
// Se borran las sesiones viejas que quedaron guardadas para siempre.
try {
  Object.keys(localStorage)
    .filter((k) => /^sb-.+-auth-token/.test(k))
    .forEach((k) => localStorage.removeItem(k));
} catch { /* sin almacenamiento */ }

const sb = createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.sessionStorage },
});

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const BUCKET = "productos";
const CLAVE_TIENDA = "pgt-panel-tienda";

const estado = {
  usuario: null,
  tiendas: [],
  tienda: null,
  secciones: [],
  productos: [],
  editando: null,   // producto abierto en el editor (null = nuevo)
  fotoNueva: null,  // Blob ya convertido a WebP, pendiente de subir
};

/* ─────────────── Utilidades ─────────────── */

function mostrarVista(id) {
  ["vistaCargando", "vistaLogin", "vistaVerificar", "vistaSinTienda", "vistaPanel"].forEach((v) => {
    $("#" + v).hidden = v !== id;
  });
}

let relojAviso;
function aviso(texto, tipo = "ok") {
  const el = $("#aviso");
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = false;
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => { el.hidden = true; }, tipo === "error" ? 6000 : 3500);
}

function enDinero(n) {
  const moneda = estado.tienda ? estado.tienda.moneda : "Q";
  return moneda + Number(n).toLocaleString("es-GT", { maximumFractionDigits: 2 });
}

// "Collar Perla Clásica" -> "collar-perla-clasica"
function aSlug(texto) {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "producto";
}

// Las fotos viejas son rutas del sitio de la tienda ("assets/…");
// las nuevas son URLs completas del bucket.
function urlImagen(src) {
  if (!src) return "";
  if (/^https:\/\//.test(src)) return src;
  // Ruta absoluta del sitio (ej. "/jasuel/assets/…", la usa la tienda demo)
  if (src.startsWith("/")) return src;
  return "/" + estado.tienda.slug + "/" + src;
}

// Si la foto vive en nuestro bucket, devuelve su ruta interna para borrarla
function rutaEnBucket(src) {
  const marca = "/storage/v1/object/public/" + BUCKET + "/";
  const i = (src || "").indexOf(marca);
  return i === -1 ? null : decodeURIComponent(src.slice(i + marca.length));
}

function mensajeError(e) {
  const m = (e && (e.message || e.error_description)) || "";
  if (/JWT|token|session/i.test(m)) return "Tu sesión venció. Vuelve a entrar.";
  if (/row-level security|permission denied/i.test(m)) return "No tienes permiso para hacer este cambio.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "No hay conexión. Revisa tu internet e inténtalo de nuevo.";
  if (/productos_sku_unico/i.test(m)) return "Ese SKU ya lo usa otro producto. Elige otro o déjalo vacío.";
  if (/productos_sku_formato/i.test(m)) return "El SKU solo puede tener letras y números (ej. COL0004).";
  if (/duplicate key/i.test(m)) return "Ya existe un producto con ese nombre.";
  return "Algo salió mal. Inténtalo de nuevo o escríbenos por WhatsApp.";
}

function confirmar(titulo, texto, boton = "Borrar", volver = "Cancelar") {
  const d = $("#confirmar");
  $("#confirmarTitulo").textContent = titulo;
  $("#confirmarTexto").textContent = texto;
  $("#confirmarSi").textContent = boton;
  $("#confirmarNo").textContent = volver;
  d.returnValue = "";
  d.showModal();
  return new Promise((listo) => {
    d.addEventListener("close", () => listo(d.returnValue === "si"), { once: true });
  });
}

// Segundo paso para acciones que borran o cancelan: hay que escribir una
// palabra (ej. BORRAR). Evita confirmar dos veces seguidas sin leer.
function sinTildes(t) {
  return (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function confirmarEscribiendo({ titulo, texto, palabra, boton }) {
  const d = $("#dobleConfirmar");
  const entrada = $("#dobleValor");
  const si = $("#dobleSi");
  $("#dobleTitulo").textContent = titulo;
  $("#dobleTexto").textContent = texto;
  $("#dobleEtiqueta").textContent = "Para confirmar, escribe " + palabra;
  entrada.value = "";
  entrada.placeholder = palabra;
  si.textContent = boton;
  si.disabled = true;
  const revisar = () => { si.disabled = sinTildes(entrada.value) !== palabra; };
  entrada.addEventListener("input", revisar);
  d.returnValue = "";
  d.showModal();
  entrada.focus();
  return new Promise((listo) => {
    d.addEventListener("close", () => {
      entrada.removeEventListener("input", revisar);
      listo(d.returnValue === "si" && sinTildes(entrada.value) === palabra);
    }, { once: true });
  });
}

// Enter en el campo: confirma si la palabra está bien escrita y si no, no
// hace nada. (Sin esto, el navegador "presiona" el primer botón del
// formulario, que es "Volver", y cancelaba.)
$("#dobleValor").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (!$("#dobleSi").disabled) $("#dobleConfirmar").close("si");
});
$("#formDoble").addEventListener("submit", (e) => {
  if (e.submitter && e.submitter.value === "si" && $("#dobleSi").disabled) e.preventDefault();
});

// Enlaces de ayuda
$$(".js-ayuda").forEach((a) => {
  a.href = "https://api.whatsapp.com/send?phone=" + WHATSAPP_SOPORTE + "&text=" +
    encodeURIComponent("Hola ProgramasGT, necesito ayuda con el panel de mi tienda.");
  a.target = "_blank";
  a.rel = "noopener";
});

/* ─────────────── Sesión ─────────────── */

$("#formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const correo = $("#loginCorreo").value.trim();
  const clave = $("#loginClave").value;
  const error = $("#loginError");
  const boton = $("#loginBoton");

  if (!correo || !clave) {
    error.textContent = "Escribe tu correo y tu contraseña.";
    error.hidden = false;
    return;
  }

  error.hidden = true;
  boton.disabled = true;
  boton.textContent = "Entrando…";

  const { error: fallo } = await sb.auth.signInWithPassword({ email: correo, password: clave });

  boton.disabled = false;
  boton.textContent = "Entrar a mi tienda";

  if (fallo) {
    error.textContent = /invalid login/i.test(fallo.message)
      ? "Correo o contraseña incorrectos."
      : /rate|too many/i.test(fallo.message)
        ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
        : mensajeError(fallo);
    error.hidden = false;
    return;
  }

  $("#loginClave").value = "";
  await verificar();
});

/* ─────────────── Verificación en dos pasos (obligatoria) ─────────────── */
// La base solo entrega datos a sesiones que pasaron el código (nivel "aal2"),
// así que esto no se puede saltar llamando directo a la API.

let factorMfa = null; // id del factor (app) que se está activando o verificando

async function verificar() {
  mostrarVista("vistaCargando");
  try {
    const { data: nivel, error: e1 } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (e1) throw e1;
    if (nivel.currentLevel === "aal2") return entrar();

    const { data: factores, error: e2 } = await sb.auth.mfa.listFactors();
    if (e2) throw e2;
    const activa = factores.totp.find((f) => f.status === "verified");

    $("#mfaCodigo").value = "";
    $("#mfaError").hidden = true;

    if (activa) {
      // Ya la activó: solo pide el código
      factorMfa = activa.id;
      $("#mfaTitulo").textContent = "Verificación en dos pasos";
      $("#mfaSub").textContent = "Abre tu app de verificación y escribe el código de 6 dígitos.";
      $("#mfaActivar").hidden = true;
    } else {
      // Primera vez (o cuenta nueva): tiene que activarla para poder entrar.
      // Se descartan activaciones que quedaron a medias.
      for (const f of factores.all.filter((x) => x.status !== "verified")) {
        await sb.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: nueva, error: e3 } = await sb.auth.mfa.enroll({
        factorType: "totp", issuer: "ProgramasGT", friendlyName: "App de verificación",
      });
      if (e3) throw e3;
      factorMfa = nueva.id;
      $("#mfaTitulo").textContent = "Protege tu cuenta";
      $("#mfaSub").textContent = "Por seguridad, tu panel pide un código de tu celular cada vez que entras. Actívalo una sola vez:";
      $("#mfaQr").src = nueva.totp.qr_code;
      $("#mfaSecreto").textContent = nueva.totp.secret.replace(/(.{4})/g, "$1 ").trim();
      $("#mfaActivar").hidden = false;
    }
    mostrarVista("vistaVerificar");
    $("#mfaCodigo").focus();
  } catch (e) {
    console.error(e);
    await sb.auth.signOut();
    mostrarVista("vistaLogin");
    $("#loginError").textContent = "No se pudo iniciar la verificación. " + mensajeError(e);
    $("#loginError").hidden = false;
  }
}

$("#mfaCodigo").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

$("#formVerificar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codigo = $("#mfaCodigo").value;
  const error = $("#mfaError");
  if (!/^\d{6}$/.test(codigo)) {
    error.textContent = "Escribe los 6 dígitos que te muestra la app.";
    error.hidden = false;
    return;
  }
  const boton = $("#mfaBoton");
  boton.disabled = true;
  boton.textContent = "Verificando…";
  const { error: fallo } = await sb.auth.mfa.challengeAndVerify({ factorId: factorMfa, code: codigo });
  boton.disabled = false;
  boton.textContent = "Verificar";
  if (fallo) {
    error.textContent = /rate|too many/i.test(fallo.message)
      ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
      : "Código incorrecto o vencido. Revisa que la hora de tu celular esté bien y escribe el código nuevo.";
    error.hidden = false;
    $("#mfaCodigo").select();
    return;
  }
  await entrar();
});

$$(".js-salir").forEach((b) =>
  b.addEventListener("click", async () => {
    await sb.auth.signOut();
    salir();
  })
);

function salir() {
  Object.assign(estado, { usuario: null, tiendas: [], tienda: null, secciones: [], productos: [] });
  mostrarVista("vistaLogin");
}

sb.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT") salir();
});

/* ─────────────── Entrar: qué tiendas puede administrar ─────────────── */

async function entrar() {
  mostrarVista("vistaCargando");

  // Sin el código no se entra (la base tampoco entregaría nada)
  const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!nivel || nivel.currentLevel !== "aal2") return verificar();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return salir();
  estado.usuario = user;

  try {
    const { data: esAdmin, error: e1 } = await sb.rpc("es_admin_plataforma");
    if (e1) throw e1;

    // Cada cuenta ve SOLO las tiendas de las que es miembro, también el
    // admin de la plataforma. Solo si el admin no es miembro de ninguna
    // (cuenta exclusiva de soporte) se le muestran todas.
    const { data: membresias, error: e2 } = await sb
      .from("miembros")
      .select("rol, tiendas(*)")
      .eq("user_id", user.id);
    if (e2) throw e2;
    // _rol: "duenio" o "editor" (lo que decide la base; aquí solo para la vista)
    let tiendas = membresias.filter((m) => m.tiendas).map((m) => ({ ...m.tiendas, _rol: m.rol }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (!tiendas.length && esAdmin) {
      const { data, error } = await sb.from("tiendas").select("*").order("nombre");
      if (error) throw error;
      tiendas = data.map((t) => ({ ...t, _rol: "admin" }));
    }

    estado.tiendas = tiendas;
    if (!tiendas.length) return mostrarVista("vistaSinTienda");

    let elegida;
    try { elegida = localStorage.getItem(CLAVE_TIENDA); } catch { /* sin almacenamiento */ }
    const tienda = tiendas.find((t) => t.id === elegida) || tiendas[0];
    estado.esAdmin = Boolean(esAdmin);

    pintarSelector();
    await abrirTienda(tienda);
    mostrarVista("vistaPanel");
  } catch (e) {
    console.error(e);
    mostrarVista("vistaLogin");
    $("#loginError").textContent = mensajeError(e);
    $("#loginError").hidden = false;
  }
}

function pintarSelector() {
  const sel = $("#tiendaSelector");
  sel.hidden = estado.tiendas.length < 2;
  sel.replaceChildren(
    ...estado.tiendas.map((t) => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.nombre + (t.activa ? "" : " (inactiva)");
      return o;
    })
  );
}

$("#tiendaSelector").addEventListener("change", async (e) => {
  const t = estado.tiendas.find((x) => x.id === e.target.value);
  if (t) await abrirTienda(t);
});

/* ─────────────── Tienda abierta ─────────────── */

async function abrirTienda(tienda) {
  estado.tienda = tienda;
  estado.modo = "normal";
  estado.filtroStock = "";
  estado.borrador.clear();
  try { localStorage.setItem(CLAVE_TIENDA, tienda.id); } catch { /* sin almacenamiento */ }

  // Encabezado con la marca de la tienda
  $("#tiendaNombre").textContent = tienda.nombre;
  $("#tiendaSelector").value = tienda.id;
  const logo = $("#tiendaLogo");
  logo.hidden = !tienda.logo_url;
  if (tienda.logo_url) logo.src = urlImagen(tienda.logo_url);
  $("#verTienda").href = "/" + tienda.slug + "/";
  // La base solo deja a la dueña (o al admin) cambiar los datos de la tienda;
  // el editor trabaja pedidos, productos y secciones.
  const esDuenio = estado.esAdmin || tienda._rol !== "editor";
  $("#cajaDatosTienda").hidden = !esDuenio;
  $("#abrirExportar").hidden = !esDuenio;
  $("#pMoneda").textContent = tienda.moneda;
  document.title = tienda.nombre + " · Panel";

  // Color de acento de la tienda (solo si es un color hexadecimal válido)
  const acento = tienda.tema && tienda.tema.oro;
  document.documentElement.style.setProperty(
    "--acento", /^#[0-9a-f]{6}$/i.test(acento || "") ? acento : ""
  );

  const [sec, prod] = await Promise.all([
    sb.from("secciones").select("*").eq("tienda_id", tienda.id).order("orden"),
    sb.from("productos").select("*, disponible, apartadas, tiene_pedidos").eq("tienda_id", tienda.id).order("orden"),
  ]);
  if (sec.error) throw sec.error;
  if (prod.error) throw prod.error;

  estado.secciones = sec.data;
  estado.productos = prod.data;

  pintarFiltroSecciones();
  pintarLista();
  pintarDatosTienda();
  pintarSecciones();
  if (!$("#seccionClientes").hidden) cargarClientes();
  $$(".js-moneda").forEach((el) => { el.textContent = tienda.moneda; });
  await cargarPedidos();
}

const nombreSeccion = (id) => (estado.secciones.find((s) => s.id === id) || {}).nombre || "Sin sección";

function pintarFiltroSecciones() {
  const opciones = [["", "Todas las secciones"], ...estado.secciones.map((s) => [s.id, s.nombre])];
  const crear = ([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    return o;
  };
  $("#filtroSeccion").replaceChildren(...opciones.map(crear));
  $("#pSeccion").replaceChildren(crear(["", "Sin sección"]), ...estado.secciones.map((s) => crear([s.id, s.nombre])));
}

/* ─────────────── Lista de productos ───────────────
   Tres modos: "normal" (ver, editar, mostrar/ocultar), "stock" (ajustar
   existencias de varias piezas y guardar todo junto) y "orden" (flechas). */

estado.modo = "normal";
estado.filtroStock = "";        // "", "agotados" o "bajos"
estado.borrador = new Map();    // id → existencias nuevas (modo stock)

// Igual que en la tienda: con 3 o menos se avisa "Solo quedan…"
const STOCK_BAJO = 3;
const controla = (p) => p.existencia !== null && p.existencia !== undefined;
// existencia = piezas en mano; disponible = en mano − apartadas por pedidos nuevos
const disp = (p) => (p.disponible === null || p.disponible === undefined ? p.existencia : p.disponible);
const textoApartadas = (p) =>
  p.apartadas > 0 ? p.apartadas + (p.apartadas === 1 ? " apartada" : " apartadas") + " en pedidos nuevos" : "";
const esAgotado = (p) => controla(p) && disp(p) === 0;
const esBajo = (p) => controla(p) && disp(p) > 0 && disp(p) <= STOCK_BAJO;

function textoStock(n) {
  if (n === 0) return "Agotado";
  if (n === 1) return "Última pieza";
  if (n <= STOCK_BAJO) return "Quedan " + n;
  return n + " disponibles";
}
const claseStock = (n) => (n === 0 ? "stock-agotado" : n <= STOCK_BAJO ? "stock-bajo" : "stock-ok");

function filtrados() {
  const q = aSlug($("#buscador").value).replace(/^producto$/, "");
  const sec = $("#filtroSeccion").value;
  const f = estado.filtroStock;
  // Los archivados solo se ven en su filtro
  return estado.productos.filter(
    (p) => (f === "archivados" ? p.archivado : !p.archivado) &&
      (!q || aSlug(p.nombre).includes(q) ||
      (p.sku || "").toLowerCase().includes(q.replace(/-/g, ""))) &&
      (!sec || p.seccion_id === sec) &&
      (!f || f === "archivados" || (f === "agotados" ? esAgotado(p) : esBajo(p)))
  );
}

function pintarFiltroStock() {
  const activos = estado.productos.filter((p) => !p.archivado);
  const archivados = estado.productos.length - activos.length;
  const agotados = activos.filter(esAgotado).length;
  const bajos = activos.filter(esBajo).length;
  const caja = $("#filtroStock");
  const conStock = activos.some(controla);
  // Sin inventario controlado ni archivados, los filtros no aportan nada
  if (!conStock && !archivados) return caja.replaceChildren();
  const chip = (clave, texto) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", String(estado.filtroStock === clave));
    b.textContent = texto;
    // Siempre hay uno marcado: "Todos" deja ver de nuevo todos los productos
    b.addEventListener("click", () => {
      estado.filtroStock = clave;
      pintarLista();
    });
    return b;
  };
  const chips = [chip("", "Todos (" + activos.length + ")")];
  if (conStock) chips.push(chip("agotados", "Agotados (" + agotados + ")"), chip("bajos", "Por agotarse (" + bajos + ")"));
  if (archivados) chips.push(chip("archivados", "Archivados (" + archivados + ")"));
  caja.replaceChildren(...chips);
}

function pintarLista() {
  const lista = filtrados();
  const hayFiltro = Boolean($("#buscador").value.trim() || $("#filtroSeccion").value || estado.filtroStock);
  const total = estado.productos.filter((p) => !p.archivado).length;
  const ocultos = estado.productos.filter((p) => !p.visible && !p.archivado).length;

  $("#productosResumen").textContent =
    total + (total === 1 ? " producto" : " productos") +
    (ocultos ? " · " + ocultos + (ocultos === 1 ? " oculto" : " ocultos") : "");
  $("#listaVacia").hidden = lista.length > 0;
  $("#modoStock").textContent = estado.modo === "stock" ? "Terminar" : "Ajustar existencias";
  $("#modoOrden").textContent = estado.modo === "orden" ? "Listo" : "Ordenar";
  $("#modoStock").hidden = estado.modo === "orden";
  $("#modoOrden").hidden = estado.modo === "stock";
  $("#nuevoProducto").disabled = estado.modo !== "normal";
  const ayuda = $("#modoAyuda");
  ayuda.hidden = estado.modo === "normal";
  ayuda.textContent = estado.modo === "stock"
    ? "Cambia las existencias que necesites y guarda todo junto al final."
    : estado.modo === "orden"
      ? (hayFiltro ? "Quita los filtros para ordenar." : "Así se ven en tu tienda. Usa las flechas para moverlos.")
      : "";

  pintarFiltroStock();
  pintarBarraCambios();

  const conColumnas = estado.modo === "normal" && estado.productos.some(controla);

  const filas = lista.map((p, i) => {
      const li = document.createElement("li");
      li.className = "fila" + (p.visible ? "" : " fila-oculta");
      li.dataset.id = p.id;

      const img = document.createElement("img");
      img.className = "fila-foto";
      img.alt = "";
      img.width = 56;
      img.height = 70;
      img.loading = "lazy";
      if (p.imagen) img.src = urlImagen(p.imagen);

      const info = document.createElement("button");
      info.type = "button";
      info.className = "fila-info";
      info.setAttribute("aria-label", "Editar " + p.nombre);
      info.disabled = estado.modo !== "normal";
      const nombre = document.createElement("span");
      nombre.className = "fila-nombre";
      nombre.textContent = p.nombre;
      const meta = document.createElement("span");
      meta.className = "fila-meta";
      meta.textContent = [p.sku, nombreSeccion(p.seccion_id), p.etiqueta && "«" + p.etiqueta + "»"]
        .filter(Boolean).join(" · ") +
        (p.visible ? "" : " · Oculto en la tienda");
      info.append(nombre, meta);
      info.addEventListener("click", () => abrirEditor(p));

      const precio = document.createElement("span");
      precio.className = "fila-precio";
      precio.textContent = enDinero(p.precio);

      const acciones = document.createElement("div");
      acciones.className = "fila-acciones";

      if (estado.modo === "stock") {
        li.append(img, info, precio, controlesStock(p, li));
        actualizarFilaStock(li, p);
        return li;
      }

      // Columnas Disponibles y Apartadas (la de disponibles se toca para ajustar)
      const piezas = [img, info];
      if (conColumnas) piezas.push(...columnasStock(p));

      if (p.archivado) {
        const restaurar = document.createElement("button");
        restaurar.type = "button";
        restaurar.className = "btn btn-borde btn-chico";
        restaurar.textContent = "Restaurar";
        restaurar.addEventListener("click", () => cambiarArchivado(p, false));
        acciones.append(restaurar);
      } else if (estado.modo === "orden") {
        if (!hayFiltro) {
          acciones.append(
            botonIcono("↑", "Subir " + p.nombre, i === 0, () => mover(p, -1)),
            botonIcono("↓", "Bajar " + p.nombre, i === lista.length - 1, () => mover(p, 1))
          );
        }
      } else {
        const vis = document.createElement("button");
        vis.type = "button";
        vis.className = "interruptor";
        vis.setAttribute("role", "switch");
        vis.setAttribute("aria-checked", String(p.visible));
        vis.setAttribute("aria-label", "Mostrar " + p.nombre + " en la tienda");
        vis.title = p.visible ? "Visible en la tienda" : "Oculto en la tienda";
        vis.addEventListener("click", () => cambiarVisible(p, vis));
        acciones.append(vis);
      }

      li.append(...piezas, precio, acciones);
      return li;
  });

  if (conColumnas && lista.length) {
    const cab = document.createElement("li");
    cab.className = "fila fila-cabeza";
    cab.setAttribute("aria-hidden", "true");
    const col = (texto, clase) => Object.assign(document.createElement("span"), { className: clase, textContent: texto });
    cab.append(
      col("Producto", "cab-producto"),
      col("Disponibles", "col-stock"),
      col("Apartadas", "col-stock"),
      col("Precio", "fila-precio"),
      col("Visible", "cab-visible")
    );
    filas.unshift(cab);
  }

  $("#listaProductos").replaceChildren(...filas);
}

// Dos columnas: lo que se puede vender ahora y lo apartado por pedidos nuevos
function columnasStock(p) {
  const disponible = document.createElement("button");
  disponible.type = "button";
  disponible.className = "col-stock col-disponible";
  disponible.dataset.etiqueta = "Disponibles";
  disponible.addEventListener("click", () => abrirAjuste(p));

  const apartadas = document.createElement("span");
  apartadas.className = "col-stock col-apartadas";
  apartadas.dataset.etiqueta = "Apartadas";

  if (!controla(p)) {
    disponible.textContent = "—";
    disponible.title = "Sin control de existencias";
    disponible.setAttribute("aria-label", p.nombre + ": sin control de existencias. Tocar para empezar a controlar");
    apartadas.textContent = "—";
    return [disponible, apartadas];
  }

  const n = disp(p);
  const a = p.apartadas || 0;
  disponible.textContent = n === 0 ? "0 · Agotado" : String(n);
  disponible.classList.add(claseStock(n));
  disponible.setAttribute("aria-label", p.nombre + ": " + textoStock(n) + ". Tocar para ajustar");
  apartadas.textContent = String(a);
  apartadas.classList.toggle("hay-apartadas", a > 0);
  apartadas.title = a > 0 ? textoApartadas(p) : "Nada apartado";
  return [disponible, apartadas];
}

function botonIcono(texto, etiqueta, deshabilitado, accion) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-icono";
  b.textContent = texto;
  b.setAttribute("aria-label", etiqueta);
  b.disabled = deshabilitado;
  b.addEventListener("click", accion);
  return b;
}

$("#buscador").addEventListener("input", pintarLista);
$("#filtroSeccion").addEventListener("change", pintarLista);

/* ─────────────── Modo "Ajustar existencias" ─────────────── */

function valorBorrador(p) {
  return estado.borrador.has(p.id) ? estado.borrador.get(p.id) : p.existencia;
}

function controlesStock(p, li) {
  const caja = document.createElement("div");
  caja.className = "fila-acciones stock-editor";

  // Sin control y sin tocar: se ofrece empezar a controlar
  if (!controla(p) && !estado.borrador.has(p.id)) {
    const t = document.createElement("span");
    t.className = "sin-control";
    t.textContent = "Sin control";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-texto btn-chico";
    b.textContent = "Controlar";
    b.addEventListener("click", () => {
      estado.borrador.set(p.id, 0);
      pintarLista();
    });
    caja.append(t, b);
    return caja;
  }

  const entrada = document.createElement("input");
  entrada.type = "number";
  entrada.min = "0";
  entrada.step = "1";
  entrada.inputMode = "numeric";
  entrada.className = "stock-numero";
  entrada.value = valorBorrador(p);
  entrada.setAttribute("aria-label", "Existencias de " + p.nombre);

  const fijar = (n) => {
    if (n === p.existencia) estado.borrador.delete(p.id);
    else estado.borrador.set(p.id, n);
    actualizarFilaStock(li, p);
    pintarBarraCambios();
  };

  const menos = botonIcono("−", "Quitar una de " + p.nombre, false, () => {
    const n = Math.max(0, (Number(entrada.value) || 0) - 1);
    entrada.value = n;
    fijar(n);
  });
  const mas = botonIcono("+", "Agregar una de " + p.nombre, false, () => {
    const n = (Number(entrada.value) || 0) + 1;
    entrada.value = n;
    fijar(n);
  });
  entrada.addEventListener("input", () => {
    const n = Number(entrada.value);
    if (entrada.value !== "" && Number.isInteger(n) && n >= 0) fijar(n);
  });

  caja.append(menos, entrada, mas);
  return caja;
}

// Marca la fila cambiada y muestra "antes → después"
function actualizarFilaStock(li, p) {
  const cambiada = estado.borrador.has(p.id);
  li.classList.toggle("fila-cambiada", cambiada);
  const meta = $(".fila-meta", li);
  const antes = controla(p) ? p.existencia : "sin control";
  meta.textContent = cambiada
    ? nombreSeccion(p.seccion_id) + " · " + antes + " → " + estado.borrador.get(p.id)
    : [nombreSeccion(p.seccion_id), controla(p) ? p.existencia + " en mano" : "", textoApartadas(p)]
        .filter(Boolean).join(" · ");
  const menos = $(".stock-editor .btn-icono", li);
  if (menos) menos.disabled = Number(valorBorrador(p)) <= 0;
}

function pintarBarraCambios() {
  const n = estado.borrador.size;
  $("#barraCambios").hidden = estado.modo !== "stock" || n === 0;
  $("#barraCambiosTexto").textContent = n + (n === 1 ? " cambio sin guardar" : " cambios sin guardar");
  $("#guardarCambios").textContent = "Guardar cambios (" + n + ")";
}

async function salirDeModo() {
  if (estado.modo === "stock" && estado.borrador.size) {
    const n = estado.borrador.size;
    const salir = await confirmar(
      "Tienes " + n + (n === 1 ? " cambio sin guardar" : " cambios sin guardar"),
      "Si sales ahora, se pierden. Para guardarlos, toca \"Guardar cambios\".",
      "Salir sin guardar"
    );
    if (!salir) return;
  }
  estado.borrador.clear();
  estado.modo = "normal";
  pintarLista();
}

$("#modoStock").addEventListener("click", () => {
  if (estado.modo === "stock") return salirDeModo();
  estado.modo = "stock";
  pintarLista();
});
$("#modoOrden").addEventListener("click", () => {
  estado.modo = estado.modo === "orden" ? "normal" : "orden";
  pintarLista();
});
$("#descartarCambios").addEventListener("click", () => {
  estado.borrador.clear();
  pintarLista();
});
$("#guardarCambios").addEventListener("click", async () => {
  const cambios = [...estado.borrador].map(([id, despues]) => {
    const p = estado.productos.find((x) => x.id === id);
    return { id, antes: controla(p) ? p.existencia : null, despues };
  });
  const boton = $("#guardarCambios");
  boton.disabled = true;
  const r = await guardarExistencias(cambios);
  boton.disabled = false;
  if (!r.ok) return aviso(r.mensaje, "error");
  estado.borrador.clear();
  pintarLista();
  aviso("Listo. Actualizaste " + cambios.length + (cambios.length === 1 ? " pieza." : " piezas."));
});

/* Guarda existencias solo si en la base siguen como se vieron.
   Si un pedido confirmado las cambió mientras tanto, no pisa nada. */
async function guardarExistencias(cambios) {
  const { error } = await sb.rpc("ajustar_existencias", {
    p_tienda: estado.tienda.id,
    p_cambios: cambios,
  });
  if (!error) {
    await recargarProductos();
    return { ok: true };
  }

  const m = error.message || "";
  if (m.startsWith("cambio_concurrente|")) {
    const [, nombre, actual] = m.split("|");
    await recargarProductos();
    return {
      ok: false,
      mensaje: "Las existencias de " + nombre + " cambiaron mientras editabas (quizá por un pedido confirmado). " +
        (actual === "" ? "Ahora no lleva control." : "Ahora hay " + actual + ".") + " Revisa y vuelve a guardar.",
    };
  }
  if (/Failed to fetch|NetworkError/i.test(m)) {
    return { ok: false, mensaje: "No se pudo guardar. Revisa tu conexión e intenta de nuevo. Tus cambios siguen aquí." };
  }
  return { ok: false, mensaje: mensajeError(error) };
}

async function recargarProductos() {
  const { data, error } = await sb
    .from("productos").select("*, disponible, apartadas, tiene_pedidos").eq("tienda_id", estado.tienda.id).order("orden");
  if (!error) {
    estado.productos = data;
    // Descarta del borrador lo que ya no aplica (el "antes" cambió)
    pintarLista();
    refrescarInicio();
  }
}

/* ─────────────── Ajuste rápido (al tocar la etiqueta) ─────────────── */

const ajuste = $("#ajusteRapido");
let piezaAjuste = null;

function abrirAjuste(p) {
  piezaAjuste = p;
  $("#ajusteTitulo").textContent = "Existencias de " + p.nombre;
  $("#ajusteValor").value = controla(p) ? p.existencia : "";
  $("#ajusteError").hidden = true;
  $("#ajusteInfo").textContent = controla(p)
    ? "En mano: " + p.existencia + " · Apartadas en pedidos nuevos: " + (p.apartadas || 0) +
      " · Disponibles: " + disp(p) + ". Aquí cambias las piezas en mano."
    : "Esta pieza no lleva control de existencias.";
  ajuste.showModal();
}

const valorAjuste = () => ($("#ajusteValor").value === "" ? null : Number($("#ajusteValor").value));
$("#ajusteMenos").addEventListener("click", () => {
  $("#ajusteValor").value = Math.max(0, (valorAjuste() || 0) - 1);
});
$("#ajusteMas").addEventListener("click", () => {
  $("#ajusteValor").value = (valorAjuste() || 0) + 1;
});
$("#ajusteAgotado").addEventListener("click", () => { $("#ajusteValor").value = 0; });
// Enter en el número = Guardar (si no, el navegador "presiona" Cancelar)
$("#ajusteValor").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  $("#ajusteGuardar").click();
});
$("#ajusteSinControl").addEventListener("click", () => { $("#ajusteValor").value = ""; });

$("#formAjuste").addEventListener("submit", async (e) => {
  if (!e.submitter || e.submitter.value !== "si") return;
  e.preventDefault();
  const p = piezaAjuste;
  const nuevo = valorAjuste();
  const error = $("#ajusteError");

  if (nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0)) {
    error.textContent = "Escribe un número entero (0 o más), o deja el campo vacío para no controlar.";
    error.hidden = false;
    return;
  }
  const antes = controla(p) ? p.existencia : null;
  if (nuevo === antes) return ajuste.close();

  $("#ajusteGuardar").disabled = true;
  const r = await guardarExistencias([{ id: p.id, antes, despues: nuevo }]);
  $("#ajusteGuardar").disabled = false;
  if (!r.ok) {
    error.textContent = r.mensaje;
    error.hidden = false;
    $("#ajusteValor").value = controla(estado.productos.find((x) => x.id === p.id) || {})
      ? estado.productos.find((x) => x.id === p.id).existencia : "";
    piezaAjuste = estado.productos.find((x) => x.id === p.id) || p;
    return;
  }
  ajuste.close();
  pintarLista();
  aviso(nuevo === null
    ? "Listo. " + p.nombre + " ya no lleva control de existencias."
    : nuevo === 0
      ? "Listo. " + p.nombre + " ya aparece como Agotado en tu tienda."
      : "Listo. " + p.nombre + " ahora tiene " + textoStock(nuevo).toLowerCase() + ".");
});

async function cambiarVisible(p, boton) {
  boton.disabled = true;
  const { error } = await sb
    .from("productos")
    .update({ visible: !p.visible })
    .eq("tienda_id", estado.tienda.id)
    .eq("id", p.id);
  boton.disabled = false;
  if (error) return aviso(mensajeError(error), "error");
  p.visible = !p.visible;
  pintarLista();
  aviso(p.visible ? "Listo. Ya se ve en tu tienda." : "Listo. Ya no se ve en tu tienda.");
}

// Sube o baja un puesto y deja el orden numerado 1, 2, 3…
async function mover(p, paso) {
  const lista = estado.productos.filter((x) => !x.archivado);
  const i = lista.indexOf(p);
  const j = i + paso;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];

  const cambios = lista
    .map((x, k) => ({ x, orden: k + 1 }))
    .filter(({ x, orden }) => x.orden !== orden);

  const resultados = await Promise.all(
    cambios.map(({ x, orden }) =>
      sb.from("productos").update({ orden }).eq("tienda_id", estado.tienda.id).eq("id", x.id)
    )
  );
  const fallo = resultados.find((r) => r.error);
  if (fallo) return aviso(mensajeError(fallo.error), "error");

  cambios.forEach(({ x, orden }) => { x.orden = orden; });
  estado.productos = [...lista, ...estado.productos.filter((x) => x.archivado)];
  pintarLista();
}

/* ─────────────── Editor ─────────────── */

const editor = $("#editor");

function abrirEditor(p) {
  estado.editando = p || null;
  estado.fotoNueva = null;

  $("#editorTitulo").textContent = p ? "Editar producto" : "Nuevo producto";
  $("#pNombre").value = p ? p.nombre : "";
  $("#pPrecio").value = p ? p.precio : "";
  $("#pExistencia").value = p && p.existencia !== null && p.existencia !== undefined ? p.existencia : "";
  $("#pSku").value = p ? p.sku || "" : "";
  $("#pEtiqueta").value = p ? p.etiqueta || "" : "";
  $("#pSeccion").value = p && p.seccion_id ? p.seccion_id : "";
  $("#pDescripcion").value = p ? p.descripcion : "";
  $("#pDatos").value = p ? (p.datos || []).join("\n") : "";
  $("#pAlt").value = p ? p.imagen_alt : "";
  $("#pVisible").checked = p ? p.visible : true;
  $("#editorBorrar").hidden = !p;
  if (p) {
    $("#editorBorrar").textContent = p.archivado
      ? "Restaurar a la tienda"
      : p.tiene_pedidos ? "Archivar producto" : "Borrar producto";
  }
  $("#editorError").hidden = true;
  $("#fotoArchivo").value = "";
  mostrarFoto(p && p.imagen ? urlImagen(p.imagen) : "");

  editor.showModal();
  $("#pNombre").focus();
}

function mostrarFoto(src) {
  $("#fotoVista").hidden = !src;
  $("#fotoVacia").hidden = Boolean(src);
  if (src) $("#fotoVista").src = src;
  $("#fotoTexto").textContent = src ? "Cambiar foto" : "Subir foto";
}

$("#nuevoProducto").addEventListener("click", () => abrirEditor(null));
$("#editorCerrar").addEventListener("click", () => editor.close());
$("#editorCancelar").addEventListener("click", () => editor.close());

// Reduce la foto y la convierte a WebP en el navegador antes de subirla
async function prepararFoto(archivo) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, FOTO_LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d").drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();

  const blob = await new Promise((r) => lienzo.toBlob(r, "image/webp", FOTO_CALIDAD));
  // Navegadores sin WebP devuelven PNG: en ese caso, JPG (pesa menos)
  if (blob && blob.type === "image/webp") return blob;
  return new Promise((r) => lienzo.toBlob(r, "image/jpeg", FOTO_CALIDAD));
}

$("#fotoArchivo").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) {
    return aviso("Esa foto no es JPG, PNG ni WebP.", "error");
  }
  if (archivo.size > 25 * 1024 * 1024) {
    return aviso("La foto pesa demasiado (máximo 25 MB).", "error");
  }
  try {
    $("#fotoTexto").textContent = "Preparando…";
    estado.fotoNueva = await prepararFoto(archivo);
    mostrarFoto(URL.createObjectURL(estado.fotoNueva));
  } catch (err) {
    console.error(err);
    estado.fotoNueva = null;
    mostrarFoto("");
    aviso("No pudimos leer esa foto. Prueba con otra.", "error");
  }
});

function idDisponible(nombre) {
  const base = aSlug(nombre);
  const usados = new Set(estado.productos.map((p) => p.id));
  let id = base;
  for (let n = 2; usados.has(id); n++) id = base + "-" + n;
  return id;
}

$("#formProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#editorError");
  const boton = $("#editorGuardar");
  const nombre = $("#pNombre").value.trim();
  const precio = Number($("#pPrecio").value);

  if (!nombre) {
    error.textContent = "Escribe el nombre del producto.";
    error.hidden = false;
    return $("#pNombre").focus();
  }
  if ($("#pPrecio").value === "" || !Number.isFinite(precio) || precio < 0) {
    error.textContent = "Escribe un precio válido.";
    error.hidden = false;
    return $("#pPrecio").focus();
  }

  const textoExistencia = $("#pExistencia").value.trim();
  const existencia = textoExistencia === "" ? null : Number(textoExistencia);
  if (existencia !== null && (!Number.isInteger(existencia) || existencia < 0)) {
    error.textContent = "Las existencias deben ser un número entero (0 o más), o déjalo vacío.";
    error.hidden = false;
    return $("#pExistencia").focus();
  }

  // SKU: se manda solo si se escribió (nuevo) o si cambió (existente).
  // Borrarlo en uno existente no hace nada: conserva el que tenía.
  // Sin espacios ni guiones, para escribirlo fácil: "col-0004" → "COL0004"
  const skuEscrito = $("#pSku").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (skuEscrito && skuEscrito.length < 2) {
    error.textContent = "El SKU debe tener al menos 2 letras o números (ej. COL0004).";
    error.hidden = false;
    return $("#pSku").focus();
  }
  const skuNuevo = estado.editando
    ? (skuEscrito && skuEscrito !== estado.editando.sku ? skuEscrito : "")
    : skuEscrito;

  // Un cero de más es el error más común: si el precio se sale mucho del
  // rango de la tienda, se pide confirmar
  const otros = estado.productos.filter((x) => x !== estado.editando).map((x) => Number(x.precio));
  const masCaro = otros.length ? Math.max(...otros) : 0;
  if (masCaro && precio > masCaro * 4) {
    const seguro = await confirmar(
      "¿El precio es " + enDinero(precio) + "?",
      "Es mucho más alto que tu producto más caro (" + enDinero(masCaro) + "). Revisa que no tenga un cero de más.",
      "Sí, guardar así"
    );
    if (!seguro) return $("#pPrecio").focus();
  }

  error.hidden = true;
  boton.disabled = true;
  boton.textContent = "Guardando…";

  const p = estado.editando;
  const id = p ? p.id : idDisponible(nombre);
  const fotoAnterior = p ? p.imagen : "";
  let imagen = fotoAnterior;
  let fotoSubida = null;

  try {
    if (estado.fotoNueva) {
      const ext = estado.fotoNueva.type === "image/webp" ? "webp" : "jpg";
      fotoSubida = estado.tienda.id + "/" + id + "-" + Date.now() + "." + ext;
      const { error: eFoto } = await sb.storage
        .from(BUCKET)
        .upload(fotoSubida, estado.fotoNueva, { contentType: estado.fotoNueva.type, upsert: false });
      if (eFoto) throw eFoto;
      imagen = sb.storage.from(BUCKET).getPublicUrl(fotoSubida).data.publicUrl;
    }

    const campos = {
      nombre,
      precio,
      seccion_id: $("#pSeccion").value || null,
      descripcion: $("#pDescripcion").value.trim(),
      datos: $("#pDatos").value.split("\n").map((x) => x.trim()).filter(Boolean),
      imagen,
      imagen_alt: $("#pAlt").value.trim() || nombre,
      etiqueta: $("#pEtiqueta").value.trim().slice(0, 24),
      existencia,
      // Vacío en un producto nuevo: la base lo asigna (ej. COL0004)
      ...(skuNuevo ? { sku: skuNuevo } : {}),
      visible: $("#pVisible").checked,
    };

    let guardado;
    if (p) {
      // Las existencias de un producto que ya existe nunca se escriben
      // directo: podrían pisar un pedido confirmado mientras el editor
      // estaba abierto. Van por la vía que revisa el valor anterior.
      delete campos.existencia;
      const antes = controla(p) ? p.existencia : null;
      if (existencia !== antes) {
        const r = await guardarExistencias([{ id: p.id, antes, despues: existencia }]);
        if (!r.ok) throw Object.assign(new Error(r.mensaje), { paraUsuario: r.mensaje });
      }

      const { data, error: eG } = await sb
        .from("productos")
        .update(campos)
        .eq("tienda_id", estado.tienda.id)
        .eq("id", p.id)
        .select()
        .single();
      if (eG) throw eG;
      guardado = data;
      Object.assign(p, guardado);
    } else {
      const orden = estado.productos.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
      const { data, error: eG } = await sb
        .from("productos")
        .insert({ ...campos, tienda_id: estado.tienda.id, id, orden })
        .select()
        .single();
      if (eG) throw eG;
      guardado = data;
      estado.productos.push(guardado);
    }

    // Si se cambió la foto, se borra la anterior del bucket (si era nuestra)
    if (fotoSubida && fotoAnterior) {
      const ruta = rutaEnBucket(fotoAnterior);
      if (ruta) sb.storage.from(BUCKET).remove([ruta]);
    }

    editor.close();
    // Se recarga todo junto al final: así se ven los campos y lo disponible al día
    await recargarProductos();
    aviso("Listo. Tus cambios ya se ven en tu tienda.");
  } catch (err) {
    console.error(err);
    // Si la foto se subió pero el producto no se guardó, no dejarla huérfana
    if (fotoSubida) sb.storage.from(BUCKET).remove([fotoSubida]);
    error.textContent = err.paraUsuario || mensajeError(err);
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar";
  }
});

async function cambiarArchivado(p, archivar) {
  if (archivar) {
    const ok = await confirmar(
      "¿Archivar " + p.nombre + "?",
      "Se quita de tu tienda y de tu lista de productos. Sus pedidos quedan intactos. Lo puedes restaurar desde el filtro \"Archivados\".",
      "Archivar"
    );
    if (!ok) return false;
    const seguro = await confirmarEscribiendo({
      titulo: "Archivar " + p.nombre,
      texto: "Deja de verse en tu tienda y nadie lo podrá pedir hasta que lo restaures.",
      palabra: "ARCHIVAR",
      boton: "Archivar",
    });
    if (!seguro) return false;
  }
  const { error } = await sb.from("productos").update({ archivado: archivar })
    .eq("tienda_id", estado.tienda.id).eq("id", p.id);
  if (error) {
    aviso(mensajeError(error), "error");
    return false;
  }
  if (editor.open) editor.close();
  await recargarProductos();
  aviso(archivar ? "Listo. " + p.nombre + " quedó archivado." : "Listo. " + p.nombre + " volvió a tu lista de productos.");
  return true;
}

$("#editorBorrar").addEventListener("click", async () => {
  const p = estado.editando;
  if (!p) return;
  // Con pedidos no se borra (se perdería el historial): se archiva
  if (p.archivado) return cambiarArchivado(p, false);
  if (p.tiene_pedidos) return cambiarArchivado(p, true);
  const ok = await confirmar(
    "¿Borrar " + p.nombre + "?",
    "Se quita de tu tienda para siempre. Si solo quieres dejar de mostrarlo, mejor desactiva \"Mostrar en la tienda\"."
  );
  if (!ok) return;
  const seguro = await confirmarEscribiendo({
    titulo: "Borrar " + p.nombre,
    texto: "Se borra para siempre, con su foto. No se puede deshacer.",
    palabra: "BORRAR",
    boton: "Borrar para siempre",
  });
  if (!seguro) return;

  const { error } = await sb.from("productos").delete().eq("tienda_id", estado.tienda.id).eq("id", p.id);
  if (error) {
    // Lo vendieron mientras tanto: la base no deja borrarlo
    if (/producto_con_pedidos/.test(error.message || "")) return cambiarArchivado(p, true);
    return aviso(mensajeError(error), "error");
  }

  const ruta = rutaEnBucket(p.imagen);
  if (ruta) sb.storage.from(BUCKET).remove([ruta]);

  estado.productos = estado.productos.filter((x) => x !== p);
  editor.close();
  pintarLista();
  aviso("Listo. El producto ya no está en tu tienda.");
});

/* ─────────────── Pestañas ─────────────── */

const CLAVE_VISTA = "pgt-panel-vista";

function irA(vista) {
  $$(".pestana").forEach((b) => {
    if (b.dataset.vista === vista) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#seccionInicio").hidden = vista !== "inicio";
  $("#seccionPedidos").hidden = vista !== "pedidos";
  $("#seccionProductos").hidden = vista !== "productos";
  $("#seccionTienda").hidden = vista !== "tienda";
  window.scrollTo({ top: 0 });
  $("#seccionClientes").hidden = vista !== "clientes";
  // Los clientes se cargan al entrar a su pestaña (siempre al día)
  if (vista === "clientes" && estado.tienda) cargarClientes();
  if (vista === "inicio") refrescarInicio();
  try { localStorage.setItem(CLAVE_VISTA, vista); } catch { /* sin almacenamiento */ }
}

$$(".pestana").forEach((b) => b.addEventListener("click", () => irA(b.dataset.vista)));
try {
  const guardada = localStorage.getItem(CLAVE_VISTA);
  irA(["pedidos", "productos", "tienda", "clientes"].includes(guardada) ? guardada : "inicio");
} catch { irA("inicio"); }

/* ─────────────── Inicio (dashboard) ─────────────── */

// Se vuelve a pintar cada vez que cambian pedidos o productos
function refrescarInicio() {
  if (!estado.tienda || !estado.pedidos) return;
  pintarInicio({
    tienda: estado.tienda,
    pedidos: estado.pedidos,
    productos: estado.productos,
    enDinero,
    urlImagen,
    codigo: codigoDe,
    abrirPedido,
    irAPedidos: (filtro) => {
      estado.filtroPedidos = filtro;
      $("#buscadorPedidos").value = "";
      irA("pedidos");
      pintarPedidos();
    },
    irAProductos: (filtro) => {
      estado.filtroStock = filtro;
      irA("productos");
      pintarLista();
    },
  });
}

/* ─────────────── Pedidos ─────────────── */

const ESTADOS = {
  nuevo: "Nuevo",
  confirmado: "Confirmado",
  enviado: "En camino",
  entregado: "Entregado",
  liquidado: "Liquidado",
  cancelado: "Cancelado",
  devuelto: "Devuelto",
};

const FILTROS = [
  ["atender", "Por atender", (p) => p.estado === "nuevo" || p.estado === "confirmado"],
  ["enviado", "En camino", (p) => p.estado === "enviado"],
  ["entregado", "Por cobrar", (p) => p.estado === "entregado"],
  ["liquidado", "Liquidados", (p) => p.estado === "liquidado"],
  ["cerrados", "Cancelados y devueltos", (p) => p.estado === "cancelado" || p.estado === "devuelto"],
  ["todos", "Todos", () => true],
];

estado.pedidos = [];
estado.filtroPedidos = "atender";
estado.pedidoAbierto = null;

const fechaHora = new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" });
// Sin guion, para escribirlo fácil: JAS0042
const codigoDe = (p) => estado.tienda.prefijo_pedido + String(p.numero).padStart(4, "0");
const telefonoLegible = (t) =>
  t.length === 11 && t.startsWith("502") ? "+502 " + t.slice(3, 7) + " " + t.slice(7) : "+" + t;

// Supabase entrega como máximo 1000 filas por consulta: se piden de a 1000
// hasta traerlas todas, para que ningún total quede corto sin avisar.
async function traerTodas(consulta) {
  const POR_PAGINA = 1000;
  const filas = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await consulta().range(desde, desde + POR_PAGINA - 1);
    if (error) return { data: null, error };
    filas.push(...data);
    if (data.length < POR_PAGINA) return { data: filas, error: null };
  }
}

async function cargarPedidos() {
  // Todos los pedidos (no solo los últimos 300): "Dinero en la calle", los
  // contadores y el dashboard tienen que contar todo.
  const { data, error } = await traerTodas(() => sb
    .from("pedidos")
    .select("*, reserva_vence, pedido_items(producto_id, nombre, cantidad, precio_unitario, imagen, sku)")
    .eq("tienda_id", estado.tienda.id)
    .order("creado_en", { ascending: false })
    .order("id"));

  if (error) {
    console.error(error);
    estado.pedidos = [];
    pintarPedidos();
    const falta = /does not exist|schema cache|Could not find/i.test(error.message || "");
    $("#pedidosVacio").textContent = falta
      ? "Los pedidos todavía no están activados para esta tienda."
      : mensajeError(error);
    $("#pedidosVacio").hidden = false;
    return;
  }
  estado.pedidos = data;
  pintarPedidos();
}

$("#recargarPedidos").addEventListener("click", async () => {
  await Promise.all([cargarPedidos(), recargarProductos()]);
  aviso("Pedidos actualizados.");
});

// "jas 0042", "JAS42", "42", "4224 9306" o "maría" → texto comparable
const textoBusqueda = () => plano($("#buscadorPedidos").value).replace(/[\s+\-#]/g, "");

function coincidePedido(q) {
  const digitos = q.replace(/\D/g, "");
  const letras = q.replace(/[^a-z]/g, "");
  return (p) => {
    const codigo = codigoDe(p).toLowerCase();
    // Número de pedido: con o sin prefijo, con o sin ceros
    if (codigo.includes(q)) return true;
    if (digitos && digitos.length <= 6 && Number(digitos) === p.numero &&
        (!letras || estado.tienda.prefijo_pedido.toLowerCase().startsWith(letras))) return true;
    // Teléfono: 4 dígitos o más
    if (digitos.length >= 4 && digitos === q && (p.telefono || "").includes(digitos)) return true;
    return plano(p.nombre).replace(/\s/g, "").includes(q);
  };
}

let relojBuscarPedidos;
$("#buscadorPedidos").addEventListener("input", () => {
  clearTimeout(relojBuscarPedidos);
  relojBuscarPedidos = setTimeout(pintarPedidos, 120);
});

function pintarPedidos() {
  const pedidos = estado.pedidos;
  const nuevos = pedidos.filter((p) => p.estado === "nuevo").length;
  const porEnviar = pedidos.filter((p) => p.estado === "confirmado").length;
  const calle = pedidos.filter((p) => p.estado === "entregado").reduce((s, p) => s + Number(p.total), 0);

  $("#mNuevos").textContent = nuevos;
  $("#mPorEnviar").textContent = porEnviar;
  $("#mCalle").textContent = enDinero(calle);
  $("#numNuevos").textContent = nuevos;
  $("#numNuevos").hidden = nuevos === 0;

  $("#filtroEstados").replaceChildren(
    ...FILTROS.map(([clave, texto, cumple]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("aria-pressed", String(estado.filtroPedidos === clave));
      b.textContent = texto + " · " + pedidos.filter(cumple).length;
      b.addEventListener("click", () => {
        estado.filtroPedidos = clave;
        $("#buscadorPedidos").value = "";
        pintarPedidos();
      });
      return b;
    })
  );

  // Con búsqueda se busca en TODOS los pedidos, sin importar el filtro de estado
  const q = textoBusqueda();
  const cumple = q ? coincidePedido(q) : FILTROS.find(([c]) => c === estado.filtroPedidos)[2];
  if (q) $$("#filtroEstados .chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
  const lista = pedidos.filter(cumple);
  $("#pedidosVacio").textContent = q
    ? "Ningún pedido coincide con «" + $("#buscadorPedidos").value.trim() + "»."
    : "No hay pedidos aquí.";
  $("#pedidosVacio").hidden = lista.length > 0;

  $("#listaPedidos").replaceChildren(
    ...lista.map((p) => {
      const li = document.createElement("li");
      li.className = "fila";

      const info = document.createElement("button");
      info.type = "button";
      info.className = "fila-info";
      info.setAttribute("aria-label", "Ver pedido " + codigoDe(p));
      const titulo = document.createElement("span");
      titulo.className = "fila-nombre";
      titulo.textContent = codigoDe(p) + " · " + p.nombre;
      const piezas = p.pedido_items.reduce((s, i) => s + i.cantidad, 0);
      const meta = document.createElement("span");
      meta.className = "fila-meta";
      meta.textContent = [
        { whatsapp: "WhatsApp", instagram: "Instagram", presencial: "En persona" }[p.origen] || "",
        piezas + (piezas === 1 ? " pieza" : " piezas"),
        p.zona,
        fechaHora.format(new Date(p.creado_en)),
      ].filter(Boolean).join(" · ");
      info.append(titulo, meta);
      info.addEventListener("click", () => abrirPedido(p));

      const total = document.createElement("span");
      total.className = "fila-precio";
      total.textContent = enDinero(p.total);

      li.append(fotosPedido(p), info, total, insigniaEstado(p.estado));
      return li;
    })
  );
  refrescarInicio();
}

// Hasta 3 fotos de las piezas del pedido, encimadas
function fotosPedido(p) {
  const caja = document.createElement("div");
  caja.className = "pedido-fotos";
  caja.setAttribute("aria-hidden", "true");
  p.pedido_items.slice(0, 3).forEach((i) => {
    const img = document.createElement("img");
    img.alt = "";
    img.width = 40;
    img.height = 50;
    img.loading = "lazy";
    if (i.imagen) img.src = urlImagen(i.imagen);
    caja.append(img);
  });
  const extra = p.pedido_items.length - 3;
  if (extra > 0) {
    const mas = document.createElement("span");
    mas.textContent = "+" + extra;
    caja.append(mas);
  }
  return caja;
}

function insigniaEstado(e) {
  const s = document.createElement("span");
  s.className = "estado estado-" + e;
  s.textContent = ESTADOS[e];
  return s;
}

/* Mensaje sugerido para la clienta según el estado del pedido */
// Mensajes para la clienta. WhatsApp pone en negrita lo que va entre *asteriscos*.
function mensajeCliente(p) {
  const tienda = estado.tienda.nombre;
  const nombre = p.nombre.split(" ")[0];
  const codigo = "*" + codigoDe(p) + "*";
  const seguir = [
    "",
    "📦 *Sigue tu pedido aquí:*",
    location.origin + "/" + estado.tienda.slug + "/pedido/?n=" + codigoDe(p),
    "_(con tu número de pedido y tu teléfono)_",
  ];
  const lineas = {
    nuevo: [
      "Hola " + nombre + " 👋",
      "Gracias por tu pedido " + codigo + " en " + tienda + ".",
      "",
      "Lo estamos revisando y te confirmamos en un momento.",
    ],
    confirmado: [
      "Hola " + nombre + " 👋",
      "Tu pedido " + codigo + " está *confirmado* ✅",
      "",
      "*Total a pagar al recibir:* " + enDinero(p.total),
      "Te avisamos en cuanto salga.",
      ...seguir,
    ],
    enviado: [
      "Hola " + nombre + " 🚚",
      "Tu pedido " + codigo + " ya va *en camino* con " + p.mensajeria + ".",
      "",
      ...(p.guia ? ["*Guía:* " + p.guia] : []),
      "*Pagas al recibir:* " + enDinero(p.total),
      ...seguir,
    ],
    entregado: [
      "Hola " + nombre + " 💛",
      "¡Gracias por tu compra en " + tienda + "!",
      "",
      "Esperamos que disfrutes tus piezas. Si quieres, compártenos una foto usándolas ✨",
    ],
  };
  lineas.liquidado = lineas.entregado;
  return (lineas[p.estado] || ["Hola " + nombre + ", te escribimos de " + tienda + " sobre tu pedido " + codigo + "."])
    .join("\n");
}

const AYUDA_MENSAJE = {
  nuevo: "Mensaje sugerido: confirmar que recibiste el pedido.",
  confirmado: "Mensaje sugerido: total a pagar al recibir.",
  enviado: "Mensaje sugerido: aviso de que va en camino, con la guía.",
  entregado: "Mensaje sugerido: agradecimiento después de la entrega.",
  liquidado: "Mensaje sugerido: agradecimiento después de la entrega.",
};

const detalle = $("#detallePedido");

async function abrirPedido(p) {
  estado.pedidoAbierto = p;
  const cerrado = ["cancelado", "devuelto"].includes(p.estado);
  const montosFijos = !["nuevo", "confirmado"].includes(p.estado);

  $("#pedTitulo").textContent = "Pedido " + codigoDe(p);
  $("#pedFecha").textContent = fechaHora.format(new Date(p.creado_en)) +
    " · " + ({ web: "Tienda en línea", whatsapp: "Por WhatsApp", instagram: "Por Instagram", presencial: "En persona" }[p.origen] || p.origen);
  $("#pedEstado").replaceWith(Object.assign(insigniaEstado(p.estado), { id: "pedEstado" }));

  $("#pedCliente").textContent = p.nombre;
  $("#pedTelefono").textContent = telefonoLegible(p.telefono);
  $("#pedZona").textContent = [p.zona, p.departamento].filter(Boolean).join(", ");
  const entrega = [p.direccion, p.referencias && "Ref.: " + p.referencias].filter(Boolean).join(" · ");
  $("#pedEntrega").hidden = !entrega;
  $("#pedEntrega").textContent = entrega;
  $("#pedCorreo").hidden = !p.correo;
  $("#pedCorreo").textContent = p.correo;
  $("#pedConfirmadoCliente").hidden = !p.confirmado_por_cliente_en;
  $("#pedLinkCaja").hidden = p.estado !== "nuevo";
  $("#pedLinkInfo").textContent = p.token_confirmacion && p.token_vence && new Date(p.token_vence) > new Date()
    ? "Ya le enviaste un link (vence el " + fechaHora.format(new Date(p.token_vence)) + "). Si lo envías de nuevo, el anterior deja de servir."
    : "Cuando ya acordaron envío y disponibilidad, mándale este link: revisa su pedido, llena su dirección y confirma. El pedido se confirma solo.";
  $("#pedNota").hidden = !p.nota;
  $("#pedNota").textContent = p.nota ? "Nota: " + p.nota : "";
  $("#pedWhatsapp").href = "https://api.whatsapp.com/send?phone=" + p.telefono + "&text=" + encodeURIComponent(mensajeCliente(p));
  $("#pedWhatsappAyuda").textContent = AYUDA_MENSAJE[p.estado] || "";

  $("#pedPiezas").replaceChildren(
    ...p.pedido_items.map((i) => {
      const li = document.createElement("li");
      li.className = "pieza";
      const foto = document.createElement("img");
      foto.className = "pieza-foto";
      foto.alt = "";
      foto.width = 48;
      foto.height = 60;
      if (i.imagen) foto.src = urlImagen(i.imagen);
      const texto = document.createElement("span");
      texto.className = "pieza-texto";
      const n = document.createElement("span");
      n.textContent = (i.cantidad > 1 ? i.cantidad + " × " : "") + i.nombre;
      const sku = document.createElement("small");
      sku.textContent = i.sku || "";
      texto.append(n, sku);
      const v = document.createElement("span");
      v.textContent = enDinero(i.precio_unitario * i.cantidad);
      li.append(foto, texto, v);
      return li;
    })
  );
  const reserva = $("#pedReserva");
  reserva.hidden = p.estado !== "nuevo" || !p.reserva_vence;
  if (!reserva.hidden) {
    const vence = new Date(p.reserva_vence);
    reserva.textContent = vence > new Date()
      ? "Piezas apartadas hasta el " + fechaHora.format(vence) + " · nadie más las puede pedir mientras tanto."
      : "El apartado venció el " + fechaHora.format(vence) + ": las piezas volvieron a estar disponibles. Al confirmar se revisa si todavía hay.";
    reserva.classList.toggle("reserva-vencida", vence <= new Date());
  }
  $("#pedSubtotal").textContent = enDinero(p.subtotal);
  $("#pedEnvio").textContent = Number(p.costo_envio) ? enDinero(p.costo_envio) : "Por definir";
  $("#pedTotal").textContent = enDinero(p.total);

  $("#pedEditables").hidden = cerrado;
  $("#pedCostoEnvio").value = Number(p.costo_envio) || "";
  $("#pedCostoEnvio").disabled = montosFijos;
  $("#pedGuia").value = p.guia;
  $("#pedDireccion").value = p.direccion;

  $("#pedCierre").hidden = !cerrado;
  $("#pedMotivo").textContent = p.motivo_cierre;

  pintarAcciones(p);
  if (!detalle.open) detalle.showModal();

  // Historial
  const hist = $("#pedHistorial");
  hist.replaceChildren();
  const { data: eventos } = await sb
    .from("pedido_eventos")
    .select("de_estado, a_estado, nota, creado_en")
    .eq("pedido_id", p.id)
    .order("creado_en");
  hist.replaceChildren(
    ...(eventos || []).map((ev) => {
      const li = document.createElement("li");
      const t = document.createElement("strong");
      t.textContent = ESTADOS[ev.a_estado];
      const f = document.createElement("span");
      f.textContent = fechaHora.format(new Date(ev.creado_en));
      li.append(t, f);
      if (ev.nota) {
        const n = document.createElement("em");
        n.textContent = ev.nota;
        li.append(n);
      }
      return li;
    })
  );
}

function pintarAcciones(p) {
  const pie = $("#pedAcciones");
  const boton = (texto, clase, accion) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + clase;
    b.textContent = texto;
    b.addEventListener("click", accion);
    return b;
  };
  const sep = () => Object.assign(document.createElement("span"), { className: "separador" });

  const acciones = {
    nuevo: [
      boton("Cancelar pedido", "btn-peligro-texto", () => avanzar(p, "cancelado")),
      sep(),
      boton("Confirmar pedido", "btn-primario", () => avanzar(p, "confirmado")),
    ],
    confirmado: [
      boton("Cancelar pedido", "btn-peligro-texto", () => avanzar(p, "cancelado")),
      sep(),
      boton("Marcar como enviado", "btn-primario", () => avanzar(p, "enviado")),
    ],
    enviado: [
      boton("Rechazado / devuelto", "btn-peligro-texto", () => avanzar(p, "devuelto")),
      sep(),
      boton("Marcar como entregado", "btn-primario", () => avanzar(p, "entregado")),
    ],
    entregado: [
      sep(),
      boton("Cargo Expresso ya me pagó", "btn-primario", () => avanzar(p, "liquidado")),
    ],
  };
  const lista = acciones[p.estado];
  if (lista) return pie.replaceChildren(...lista);
  const nota = Object.assign(document.createElement("p"), {
    className: "ayuda",
    textContent: p.estado === "liquidado" ? "Pedido completado." : "Pedido cerrado.",
  });
  if (p.estado === "cancelado" || p.estado === "devuelto") {
    pie.replaceChildren(nota, sep(), boton("Rehacer como pedido nuevo", "btn-borde", () => {
      detalle.close();
      abrirManual(p);
    }));
  } else {
    pie.replaceChildren(nota);
  }
}

/* Llena el pedido manual con los datos de un pedido cancelado o devuelto,
   revisando el stock de AHORA. Avisa lo que no alcanza o ya no existe. */
function llenarDesdePedido(base) {
  const local = base.telefono.length === 11 && base.telefono.startsWith("502")
    ? base.telefono.slice(3) : base.telefono;
  $("#mOrigen").value = base.origen === "web" ? "whatsapp" : base.origen;
  $("#mNombre").value = base.nombre;
  $("#mTelefono").value = local;
  $("#mZona").value = base.zona;
  $("#mDepartamento").value = base.departamento || "";
  $("#mDireccion").value = [base.direccion, base.referencias].filter(Boolean).join(" · ").slice(0, 300);
  $("#mNota").value = base.nota;
  $("#mEnvio").value = Number(base.costo_envio) || "";

  const avisos = [];
  base.pedido_items.forEach((i) => {
    const p = estado.productos.find((x) => x.id === i.producto_id && !x.archivado);
    if (!p) {
      avisos.push(i.nombre + ": ya no está en tu catálogo (archivado o borrado). Lo quité.");
      return;
    }
    let cantidad = i.cantidad;
    if (controla(p)) {
      const hay = disp(p);
      if (hay === 0) {
        avisos.push(p.nombre + ": está agotado. Lo quité.");
        return;
      }
      if (hay < cantidad) {
        avisos.push(p.nombre + ": pediste " + cantidad + ", hay " + hay +
          (hay === 1 ? " disponible" : " disponibles") + ". Puse " + hay + ".");
        cantidad = hay;
      }
    }
    if (Number(p.precio) !== Number(i.precio_unitario)) {
      avisos.push(p.nombre + ": el precio cambió de " + enDinero(i.precio_unitario) + " a " + enDinero(p.precio) + ".");
    }
    estado.manual.push({ id: p.id, cantidad });
  });

  const caja = $("#mAviso");
  const titulo = avisos.length
    ? "Revisa antes de crear el pedido:"
    : "Todas las piezas están disponibles. Los precios son los de hoy.";
  caja.replaceChildren(
    Object.assign(document.createElement("strong"), { textContent: titulo }),
    ...avisos.map((t) => Object.assign(document.createElement("span"), { textContent: t }))
  );
  caja.classList.toggle("manual-aviso-ok", !avisos.length);
  caja.hidden = false;
}

$("#pedCerrar").addEventListener("click", () => detalle.close());

/* Link de confirmación: la clienta revisa su pedido, llena su dirección y
   confirma ella misma. El pedido pasa solo a "confirmado". */
$("#pedLink").addEventListener("click", async () => {
  const p = estado.pedidoAbierto;
  if (!p) return;

  if (!Number(p.costo_envio)) {
    const seguir = await confirmar(
      "El envío está en " + enDinero(0),
      "La clienta va a ver el total sin costo de envío. Si ya lo acordaron, escríbelo en \"Costo de envío\" y toca \"Guardar datos\" antes de enviar el link.",
      "Enviar así"
    );
    if (!seguir) return $("#pedCostoEnvio").focus();
  }

  // Se abre ya, dentro del clic: después de esperar, el navegador la bloquearía
  const ventana = window.open("", "_blank");
  if (ventana) ventana.opener = null;

  const { data, error } = await sb.rpc("generar_link_confirmacion", { p_pedido: p.id });
  if (error) {
    if (ventana) ventana.close();
    return aviso(/solo_pedidos_nuevos/.test(error.message || "")
      ? "Este pedido ya no está como nuevo. Toca \"Actualizar\"."
      : mensajeError(error), "error");
  }

  const link = location.origin + "/" + estado.tienda.slug + "/confirmar/?t=" + data.token;
  const texto = [
    "Hola " + p.nombre.split(" ")[0] + " 👋",
    "Tu pedido *" + codigoDe(p) + "* está listo.",
    "",
    "*Total a pagar al recibir:* " + enDinero(p.total),
    "",
    "✍️ *Confirma tus datos de entrega aquí* y lo preparamos:",
    link,
  ].join("\n");
  const url = "https://api.whatsapp.com/send?phone=" + p.telefono + "&text=" + encodeURIComponent(texto);
  if (ventana) ventana.location.href = url;
  else location.href = url;

  await cargarPedidos();
  const actualizado = estado.pedidos.find((x) => x.id === p.id);
  if (actualizado) await abrirPedido(actualizado);
  aviso("Link generado. Envíaselo por WhatsApp.");
});

// Pide un dato antes de cambiar de estado (motivo o guía). Devuelve el
// texto, o null si se canceló.
function pedirDato({ titulo, texto, etiqueta, boton, obligatorio, valor = "", peligro = false }) {
  const d = $("#pasoEstado");
  $("#pasoTitulo").textContent = titulo;
  $("#pasoTexto").textContent = texto;
  $("#pasoEtiqueta").textContent = etiqueta;
  if (obligatorio) {
    const req = Object.assign(document.createElement("b"), { className: "req", textContent: "*" });
    req.setAttribute("aria-hidden", "true");
    $("#pasoEtiqueta").append(" ", req);
  }
  $("#pasoValor").value = valor;
  $("#pasoError").hidden = true;
  const si = $("#pasoSi");
  si.textContent = boton;
  si.className = "btn " + (peligro ? "btn-peligro" : "btn-primario");
  d.dataset.obligatorio = obligatorio ? "1" : "";
  d.returnValue = "";
  d.showModal();
  $("#pasoValor").focus();
  return new Promise((listo) => {
    d.addEventListener("close", () => listo(d.returnValue === "si" ? $("#pasoValor").value.trim() : null), { once: true });
  });
}

$("#formPaso").addEventListener("submit", (e) => {
  if (e.submitter && e.submitter.value === "si" && $("#pasoEstado").dataset.obligatorio && !$("#pasoValor").value.trim()) {
    e.preventDefault();
    $("#pasoError").textContent = "Escribe el motivo para que quede en el historial.";
    $("#pasoError").hidden = false;
    $("#pasoValor").focus();
  }
});

function errorEstado(e) {
  const m = (e && e.message) || "";
  if (/^sin_stock:/.test(m)) return "No hay suficiente inventario de " + m.slice(10) + ". Actualiza la existencia del producto.";
  if (/motivo_requerido/.test(m)) return "Escribe el motivo.";
  if (/transicion_invalida/.test(m)) return "Este pedido ya cambió de estado. Toca \"Actualizar\".";
  if (/pedido_cerrado/.test(m)) return "Los montos no se pueden cambiar después de enviado.";
  return mensajeError(e);
}

async function avanzar(p, nuevo) {
  let nota = "";
  let guia = null;

  if (nuevo === "cancelado" || nuevo === "devuelto") {
    nota = await pedirDato({
      titulo: nuevo === "cancelado" ? "Cancelar " + codigoDe(p) : "Marcar " + codigoDe(p) + " como devuelto",
      texto: nuevo === "cancelado"
        ? "Si ya se había confirmado, las piezas vuelven a tu inventario."
        : "Úsalo si la clienta no recibió o rechazó el paquete. Las piezas vuelven a tu inventario.",
      etiqueta: "Motivo",
      boton: nuevo === "cancelado" ? "Cancelar pedido" : "Marcar devuelto",
      obligatorio: true,
      peligro: true,
    });
    if (nota === null) return;
    // Segunda confirmación (sí / no)
    const seguro = await confirmar(
      nuevo === "cancelado"
        ? "¿Seguro que quieres cancelar " + codigoDe(p) + "?"
        : "¿Seguro que " + codigoDe(p) + " fue devuelto?",
      (nuevo === "cancelado"
        ? "El pedido queda cancelado y no se puede reactivar. "
        : "El pedido queda cerrado como devuelto y no se puede reactivar. ") +
        "Si tenía piezas apartadas o descontadas, vuelven a estar disponibles.",
      nuevo === "cancelado" ? "Sí, cancelar pedido" : "Sí, marcar devuelto",
      "No, volver"
    );
    if (!seguro) return;
  } else if (nuevo === "enviado") {
    guia = await pedirDato({
      titulo: "Marcar " + codigoDe(p) + " como enviado",
      texto: "Si ya tienes el número de guía de Cargo Expresso, escríbelo para mandárselo a la clienta.",
      etiqueta: "Guía (opcional)",
      boton: "Marcar enviado",
      obligatorio: false,
      valor: $("#pedGuia").value.trim() || p.guia,
    });
    if (guia === null) return;
  }

  const { error } = await sb.rpc("cambiar_estado_pedido", {
    p_pedido: p.id,
    p_estado: nuevo,
    p_nota: nota,
    p_guia: guia,
  });
  if (error) return aviso(errorEstado(error), "error");

  await Promise.all([cargarPedidos(), recargarProductos()]);
  const actualizado = estado.pedidos.find((x) => x.id === p.id);
  if (actualizado) await abrirPedido(actualizado);
  aviso("Listo. El pedido quedó " + ESTADOS[nuevo].toLowerCase() + ".");
}

$("#pedGuardar").addEventListener("click", async () => {
  const p = estado.pedidoAbierto;
  if (!p) return;
  const envio = $("#pedCostoEnvio").value === "" ? 0 : Number($("#pedCostoEnvio").value);
  if (!Number.isFinite(envio) || envio < 0) return aviso("Escribe un costo de envío válido.", "error");

  const cambios = { guia: $("#pedGuia").value.trim(), direccion: $("#pedDireccion").value.trim() };
  if (["nuevo", "confirmado"].includes(p.estado)) cambios.costo_envio = envio;

  const { error } = await sb.from("pedidos").update(cambios).eq("id", p.id);
  if (error) return aviso(errorEstado(error), "error");

  await cargarPedidos();
  const actualizado = estado.pedidos.find((x) => x.id === p.id);
  if (actualizado) await abrirPedido(actualizado);
  aviso("Listo. Datos del pedido guardados.");
});

/* ─────────────── Tienda: datos ─────────────── */

function soloDigitos(t) {
  const d = (t || "").replace(/\D/g, "");
  return d.length === 8 ? "502" + d : d;
}

function pintarDatosTienda() {
  const t = estado.tienda;
  $("#tNombre").value = t.nombre;
  $("#tWhatsapp").value = t.whatsapp && t.whatsapp.startsWith("502") && t.whatsapp.length === 11
    ? t.whatsapp.slice(3, 7) + " " + t.whatsapp.slice(7) : t.whatsapp || "";
  $("#tInstagram").value = t.instagram || "";
  $("#tHoras").value = t.horas_reserva || 48;
  $("#tError").hidden = true;
  const logo = t.logo_url ? urlImagen(t.logo_url) : "";
  $("#tLogoVista").hidden = !logo;
  $("#tLogoVacio").hidden = Boolean(logo);
  if (logo) $("#tLogoVista").src = logo;
}

function pintarEncabezado() {
  const t = estado.tienda;
  $("#tiendaNombre").textContent = t.nombre;
  $("#tiendaLogo").hidden = !t.logo_url;
  if (t.logo_url) $("#tiendaLogo").src = urlImagen(t.logo_url);
  pintarSelector();
  $("#tiendaSelector").value = t.id;
}

async function guardarTienda(campos) {
  const { data, error } = await sb.from("tiendas").update(campos)
    .eq("id", estado.tienda.id).select().single();
  if (error) throw error;
  Object.assign(estado.tienda, data);
  const enLista = estado.tiendas.find((x) => x.id === data.id);
  if (enLista && enLista !== estado.tienda) Object.assign(enLista, data);
  pintarEncabezado();
  return data;
}

$("#formTienda").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#tError");
  const nombre = $("#tNombre").value.trim();
  const whatsapp = soloDigitos($("#tWhatsapp").value);
  const instagram = $("#tInstagram").value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  const horas = Number($("#tHoras").value);
  const falla = (texto, campo) => { error.textContent = texto; error.hidden = false; $(campo).focus(); };

  if (!nombre) return falla("Escribe el nombre de la tienda.", "#tNombre");
  if (whatsapp && !/^[0-9]{10,15}$/.test(whatsapp)) return falla("Revisa el WhatsApp: deben ser 8 dígitos.", "#tWhatsapp");
  if (!/^[A-Za-z0-9._]{0,30}$/.test(instagram)) return falla("Revisa el Instagram: solo letras, números, puntos y guion bajo.", "#tInstagram");
  if (!Number.isInteger(horas) || horas < 1 || horas > 720) return falla("Las horas de apartado van de 1 a 720 (30 días).", "#tHoras");

  error.hidden = true;
  $("#tGuardar").disabled = true;
  try {
    await guardarTienda({ nombre, whatsapp, instagram, horas_reserva: horas });
    pintarDatosTienda();
    aviso("Listo. Datos de la tienda guardados.");
  } catch (err) {
    console.error(err);
    falla(mensajeError(err), "#tNombre");
  } finally {
    $("#tGuardar").disabled = false;
  }
});

$("#tLogoArchivo").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return aviso("El logo debe ser PNG, JPG o WebP.", "error");

  $("#tLogoTexto").textContent = "Subiendo…";
  const anterior = estado.tienda.logo_url;
  let ruta = null;
  try {
    const blob = await prepararFoto(archivo);
    ruta = estado.tienda.id + "/logo-" + Date.now() + (blob.type === "image/webp" ? ".webp" : ".jpg");
    const { error } = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    await guardarTienda({ logo_url: sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl });
    const vieja = rutaEnBucket(anterior);
    if (vieja) sb.storage.from(BUCKET).remove([vieja]);
    pintarDatosTienda();
    aviso("Listo. Logo actualizado.");
  } catch (err) {
    console.error(err);
    if (ruta) sb.storage.from(BUCKET).remove([ruta]);
    aviso(mensajeError(err), "error");
  } finally {
    $("#tLogoTexto").textContent = "Cambiar logo";
  }
});

/* ─────────────── Tienda: secciones ─────────────── */

async function recargarSecciones() {
  const { data, error } = await sb.from("secciones").select("*")
    .eq("tienda_id", estado.tienda.id).order("orden");
  if (error) return aviso(mensajeError(error), "error");
  estado.secciones = data;
  pintarSecciones();
  pintarFiltroSecciones();
  pintarLista();
}

function pintarSecciones() {
  const lista = estado.secciones;
  const cuantos = (id) => estado.productos.filter((p) => p.seccion_id === id && !p.archivado).length;

  $("#listaSecciones").replaceChildren(
    ...lista.map((s, i) => {
      const li = document.createElement("li");
      li.className = "fila fila-seccion" + (s.visible ? "" : " fila-oculta");

      const nombre = document.createElement("input");
      nombre.className = "seccion-nombre";
      nombre.value = s.nombre;
      nombre.maxLength = 60;
      nombre.setAttribute("aria-label", "Nombre de la sección " + s.nombre);
      const guardarNombre = async () => {
        const nuevo = nombre.value.trim();
        if (!nuevo) { nombre.value = s.nombre; return; }
        if (nuevo === s.nombre) return;
        const { error } = await sb.from("secciones").update({ nombre: nuevo }).eq("id", s.id);
        if (error) { nombre.value = s.nombre; return aviso(mensajeError(error), "error"); }
        await recargarSecciones();
        aviso("Listo. La sección ahora se llama " + nuevo + ".");
      };
      nombre.addEventListener("change", guardarNombre);
      nombre.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nombre.blur(); } });

      const info = document.createElement("span");
      info.className = "fila-meta seccion-meta";
      const n = cuantos(s.id);
      info.textContent = s.codigo + " · " + n + (n === 1 ? " producto" : " productos");

      const acciones = document.createElement("div");
      acciones.className = "fila-acciones";
      acciones.append(
        botonIcono("↑", "Subir " + s.nombre, i === 0, () => moverSeccion(s, -1)),
        botonIcono("↓", "Bajar " + s.nombre, i === lista.length - 1, () => moverSeccion(s, 1))
      );

      const vis = document.createElement("button");
      vis.type = "button";
      vis.className = "interruptor";
      vis.setAttribute("role", "switch");
      vis.setAttribute("aria-checked", String(s.visible));
      vis.setAttribute("aria-label", "Mostrar la sección " + s.nombre + " en la tienda");
      vis.addEventListener("click", async () => {
        vis.disabled = true;
        const { error } = await sb.from("secciones").update({ visible: !s.visible }).eq("id", s.id);
        vis.disabled = false;
        if (error) return aviso(mensajeError(error), "error");
        await recargarSecciones();
        aviso(!s.visible ? "Listo. " + s.nombre + " ya se ve en tu tienda." : "Listo. " + s.nombre + " y sus productos ya no se ven en tu tienda.");
      });

      const borrar = botonIcono("×", "Borrar la sección " + s.nombre, false, () => borrarSeccion(s, n));
      borrar.classList.add("btn-icono-peligro");
      acciones.append(vis, borrar);

      const texto = document.createElement("div");
      texto.className = "seccion-texto";
      texto.append(nombre, info);
      li.append(texto, acciones);
      return li;
    })
  );
}

async function moverSeccion(s, paso) {
  const lista = [...estado.secciones];
  const i = lista.indexOf(s);
  const j = i + paso;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  const cambios = lista.map((x, k) => ({ x, orden: k + 1 })).filter(({ x, orden }) => x.orden !== orden);
  const r = await Promise.all(cambios.map(({ x, orden }) => sb.from("secciones").update({ orden }).eq("id", x.id)));
  const fallo = r.find((x) => x.error);
  if (fallo) return aviso(mensajeError(fallo.error), "error");
  await recargarSecciones();
}

async function borrarSeccion(s, productos) {
  const ok = await confirmar(
    "¿Borrar la sección " + s.nombre + "?",
    productos
      ? "Sus " + productos + (productos === 1 ? " producto queda" : " productos quedan") +
        " sin sección pero siguen en tu tienda. Puedes moverlos a otra sección desde Productos."
      : "No tiene productos. Se quita de tu tienda.",
    "Borrar sección"
  );
  if (!ok) return;
  const seguro = await confirmarEscribiendo({
    titulo: "Borrar la sección " + s.nombre,
    texto: "Se quita de tu tienda. No se puede deshacer.",
    palabra: "BORRAR",
    boton: "Borrar sección",
  });
  if (!seguro) return;
  const { error } = await sb.from("secciones").delete().eq("id", s.id);
  if (error) return aviso(mensajeError(error), "error");
  await Promise.all([recargarSecciones(), recargarProductos()]);
  aviso("Listo. Sección borrada.");
}

$("#formSeccion").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#nuevaSeccion").value.trim();
  if (!nombre) return $("#nuevaSeccion").focus();
  const usados = new Set(estado.secciones.map((s) => s.slug));
  const base = aSlug(nombre).replace(/^producto$/, "seccion");
  let slug = base;
  for (let n = 2; usados.has(slug); n++) slug = base + "-" + n;
  const orden = estado.secciones.reduce((m, s) => Math.max(m, s.orden), 0) + 1;

  const { error } = await sb.from("secciones").insert({ tienda_id: estado.tienda.id, nombre, slug, orden });
  if (error) return aviso(mensajeError(error), "error");
  $("#nuevaSeccion").value = "";
  await recargarSecciones();
  aviso("Listo. La sección " + nombre + " ya está en tu tienda.");
});

/* ─────────────── Pedido manual (WhatsApp, Instagram, en persona) ─────────────── */

const manual = $("#pedidoManual");
estado.manual = []; // [{ id, cantidad }]

// La dirección es obligatoria, salvo cuando la venta es en persona
function marcarDireccion() {
  const enPersona = $("#mOrigen").value === "presencial";
  $("#mDireccionReq").hidden = enPersona;
  $("#mDireccionNota").hidden = !enPersona;
  $("#mDireccion").required = !enPersona;
}
$("#mOrigen").addEventListener("change", marcarDireccion);

function abrirManual(base) {
  estado.manual = [];
  ["#mNombre", "#mTelefono", "#mDepartamento", "#mZona", "#mDireccion", "#mNota", "#mEnvio"].forEach((c) => { $(c).value = ""; });
  $("#mOrigen").value = "whatsapp";
  $("#mCantidad").value = 1;
  $("#mConfirmar").checked = false;
  $("#mError").hidden = true;
  $("#mAviso").hidden = true;
  $("#manualTitulo").textContent = base ? "Rehacer " + codigoDe(base) + " como pedido nuevo" : "Nuevo pedido manual";
  if (base) llenarDesdePedido(base);
  marcarDireccion();

  const opciones = estado.productos
    .filter((p) => !p.archivado)
    .map((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      const stock = controla(p) ? " · " + disp(p) + " disp." : "";
      o.textContent = p.nombre + " (" + p.sku + ") — " + enDinero(p.precio) + stock;
      o.disabled = controla(p) && disp(p) === 0;
      return o;
    });
  const vacio = Object.assign(document.createElement("option"), { value: "", textContent: "Elige un producto…" });
  $("#mProducto").replaceChildren(vacio, ...opciones);
  pintarManual();
  manual.showModal();
  $("#mNombre").focus();
}

function pintarManual() {
  const lineas = estado.manual.map((l) => ({ ...l, p: estado.productos.find((x) => x.id === l.id) }));
  $("#mVacio").hidden = lineas.length > 0;
  $("#mPiezas").replaceChildren(
    ...lineas.map((l) => {
      const li = document.createElement("li");
      li.className = "pieza";
      const foto = document.createElement("img");
      foto.className = "pieza-foto";
      foto.alt = "";
      if (l.p.imagen) foto.src = urlImagen(l.p.imagen);
      const texto = document.createElement("span");
      texto.className = "pieza-texto";
      const n = document.createElement("span");
      n.textContent = (l.cantidad > 1 ? l.cantidad + " × " : "") + l.p.nombre;
      const sku = document.createElement("small");
      sku.textContent = l.p.sku;
      texto.append(n, sku);
      const v = document.createElement("span");
      v.textContent = enDinero(l.p.precio * l.cantidad);
      const quitar = botonIcono("×", "Quitar " + l.p.nombre, false, () => {
        estado.manual = estado.manual.filter((x) => x.id !== l.id);
        pintarManual();
      });
      li.append(foto, texto, v, quitar);
      return li;
    })
  );
  const subtotal = lineas.reduce((s, l) => s + l.p.precio * l.cantidad, 0);
  const envio = Number($("#mEnvio").value) || 0;
  $("#mSubtotal").textContent = enDinero(subtotal);
  $("#mTotal").textContent = enDinero(subtotal + envio);
}

$("#nuevoPedidoManual").addEventListener("click", () => abrirManual());
$("#manualCerrar").addEventListener("click", () => manual.close());
$("#manualCancelar").addEventListener("click", () => manual.close());
$("#mEnvio").addEventListener("input", pintarManual);

$("#mAgregar").addEventListener("click", () => {
  const id = $("#mProducto").value;
  const cantidad = Number($("#mCantidad").value);
  if (!id) return $("#mProducto").focus();
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) return $("#mCantidad").focus();
  const p = estado.productos.find((x) => x.id === id);
  const ya = estado.manual.find((l) => l.id === id);
  const total = (ya ? ya.cantidad : 0) + cantidad;
  if (controla(p) && total > disp(p)) {
    return aviso("Solo hay " + disp(p) + " disponibles de " + p.nombre + ".", "error");
  }
  if (ya) ya.cantidad = total;
  else estado.manual.push({ id, cantidad });
  $("#mProducto").value = "";
  $("#mCantidad").value = 1;
  pintarManual();
});

function errorManual(m) {
  if (/^agotado:/.test(m)) return "Ya no hay suficientes de " + m.slice(8) + ". Revisa las existencias.";
  if (/^no_disponible:/.test(m)) return "Una de las piezas ya no está disponible (¿la archivaste?).";
  const textos = {
    telefono_invalido: "Revisa el teléfono: deben ser 8 dígitos.",
    nombre_invalido: "Escribe el nombre de la clienta.",
    zona_invalida: "Escribe el municipio y zona.",
    envio_invalido: "Revisa el costo de envío.",
    pedido_vacio: "Agrega al menos una pieza.",
    cantidad_invalida: "Revisa las cantidades (de 1 a 50).",
  };
  return textos[m] || null;
}

$("#formManual").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#mError");
  const falla = (texto, campo) => { error.textContent = texto; error.hidden = false; if (campo) $(campo).focus(); };
  const telefono = $("#mTelefono").value.replace(/\D/g, "");

  if (!$("#mNombre").value.trim()) return falla("Escribe el nombre de la clienta.", "#mNombre");
  if (!(telefono.length === 8 || (telefono.length >= 10 && telefono.length <= 15))) return falla("Revisa el teléfono: deben ser 8 dígitos.", "#mTelefono");
  if (!$("#mZona").value.trim()) return falla("Escribe el municipio y zona.", "#mZona");
  if ($("#mOrigen").value !== "presencial" && $("#mDireccion").value.trim().length < 5) {
    return falla("Escribe la dirección exacta para el envío.", "#mDireccion");
  }
  if (!estado.manual.length) return falla("Agrega al menos una pieza.", "#mProducto");
  const envio = $("#mEnvio").value === "" ? 0 : Number($("#mEnvio").value);
  if (!Number.isFinite(envio) || envio < 0) return falla("Revisa el costo de envío.", "#mEnvio");

  error.hidden = true;
  const boton = $("#manualGuardar");
  boton.disabled = true;
  boton.textContent = "Creando…";
  const { data, error: e2 } = await sb.rpc("crear_pedido_manual", {
    p_tienda: estado.tienda.id,
    p_items: estado.manual,
    p_nombre: $("#mNombre").value.trim(),
    p_telefono: $("#mTelefono").value.trim(),
    p_zona: $("#mZona").value.trim(),
    p_origen: $("#mOrigen").value,
    p_direccion: $("#mDireccion").value.trim(),
    p_departamento: $("#mDepartamento").value,
    p_nota: $("#mNota").value.trim(),
    p_costo_envio: envio,
    p_confirmar: $("#mConfirmar").checked,
  });
  boton.disabled = false;
  boton.textContent = "Crear pedido";
  if (e2) return falla(errorManual(e2.message || "") || mensajeError(e2));

  manual.close();
  await Promise.all([cargarPedidos(), recargarProductos()]);
  irA("pedidos");
  const creado = estado.pedidos.find((x) => x.id === data.id);
  if (creado) await abrirPedido(creado);
  aviso("Listo. Pedido " + data.codigo + " creado.");
});

/* ─────────────── Clientes ───────────────
   Se buscan por nombre, teléfono, correo o dirección. La lista se arma con
   los clientes de la tienda y un resumen de sus pedidos (cuántos, total
   comprado, último). */

estado.clientes = [];
const CERRADOS = ["cancelado", "devuelto"];

// "María López, Zona 10" → "maria lopez, zona 10" (sin tildes, para buscar)
const plano = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function cargarClientes() {
  const [cli, ped] = await Promise.all([
    traerTodas(() => sb.from("clientes").select("*").eq("tienda_id", estado.tienda.id)
      .order("actualizado_en", { ascending: false }).order("id")),
    traerTodas(() => sb.from("pedidos").select("cliente_id, estado, total, creado_en")
      .eq("tienda_id", estado.tienda.id).order("id")),
  ]);
  if (cli.error || ped.error) {
    console.error(cli.error || ped.error);
    estado.clientes = [];
    return pintarClientes();
  }
  const resumen = {};
  ped.data.forEach((o) => {
    if (!o.cliente_id) return;
    const r = (resumen[o.cliente_id] ||= { pedidos: 0, comprado: 0, ultimo: null });
    if (!CERRADOS.includes(o.estado)) r.pedidos += 1;
    // Comprado = venta concretada (entregada), con la misma regla del dashboard
    if (o.estado === "entregado" || o.estado === "liquidado") r.comprado += Number(o.total);
    if (!r.ultimo || o.creado_en > r.ultimo) r.ultimo = o.creado_en;
  });
  estado.clientes = cli.data.map((c) => ({ ...c, ...(resumen[c.id] || { pedidos: 0, comprado: 0, ultimo: null }) }));
  pintarClientes();
}

function filtrarClientes() {
  const q = plano($("#buscadorClientes").value.trim());
  if (!q) return estado.clientes;
  const digitos = q.replace(/\D/g, "");
  return estado.clientes.filter((c) => {
    if (digitos.length >= 3 && c.telefono.includes(digitos)) return true;
    return [c.nombre, c.correo, c.direccion, c.zona, c.departamento].some((x) => plano(x).includes(q));
  });
}

function pintarClientes() {
  const lista = filtrarClientes();
  const total = estado.clientes.length;
  $("#clientesResumen").textContent = total + (total === 1 ? " cliente" : " clientes");
  $("#clientesVacio").hidden = lista.length > 0 || !$("#buscadorClientes").value.trim();

  $("#listaClientes").replaceChildren(
    ...lista.slice(0, 200).map((c) => {
      const li = document.createElement("li");
      li.className = "fila";

      const inicial = document.createElement("span");
      inicial.className = "cliente-inicial";
      inicial.setAttribute("aria-hidden", "true");
      inicial.textContent = (c.nombre || "?").trim().charAt(0).toUpperCase();

      const info = document.createElement("button");
      info.type = "button";
      info.className = "fila-info";
      info.setAttribute("aria-label", "Ver a " + c.nombre);
      const nombre = document.createElement("span");
      nombre.className = "fila-nombre";
      nombre.textContent = c.nombre || "Sin nombre";
      const meta = document.createElement("span");
      meta.className = "fila-meta";
      meta.textContent = [telefonoLegible(c.telefono), c.correo, c.zona].filter(Boolean).join(" · ");
      info.append(nombre, meta);
      info.addEventListener("click", () => abrirCliente(c));

      const datos = document.createElement("span");
      datos.className = "cliente-datos";
      const n = document.createElement("strong");
      n.textContent = enDinero(c.comprado);
      const s = document.createElement("small");
      s.textContent = c.pedidos + (c.pedidos === 1 ? " pedido" : " pedidos") +
        (c.ultimo ? " · último " + new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short" }).format(new Date(c.ultimo)) : "");
      datos.append(n, s);

      li.append(inicial, info, datos);
      return li;
    })
  );
}

$("#buscadorClientes").addEventListener("input", pintarClientes);

/* Ficha del cliente con todos sus pedidos */

const fichaCliente = $("#detalleCliente");
let clienteAbierto = null;

async function abrirCliente(c) {
  clienteAbierto = c;
  $("#cliTitulo").textContent = c.nombre || "Cliente";
  $("#cliResumen").textContent = c.pedidos + (c.pedidos === 1 ? " pedido" : " pedidos") +
    " · " + enDinero(c.comprado) + " comprado" +
    " · cliente desde " + new Intl.DateTimeFormat("es-GT", { month: "long", year: "numeric" }).format(new Date(c.creado_en));
  $("#cNombreCli").value = c.nombre;
  $("#cTelefonoCli").value = telefonoLegible(c.telefono);
  $("#cCorreoCli").value = c.correo || "";
  $("#cDepartamentoCli").value = c.departamento || "";
  $("#cZonaCli").value = c.zona || "";
  $("#cDireccionCli").value = c.direccion || "";
  $("#cNotasCli").value = c.notas || "";
  $("#cliError").hidden = true;
  $("#cliWhatsapp").href = "https://api.whatsapp.com/send?phone=" + c.telefono + "&text=" +
    encodeURIComponent("Hola " + (c.nombre || "").split(" ")[0] + " 👋\nTe escribimos de *" + estado.tienda.nombre + "*.");

  $("#cliPedidos").replaceChildren();
  $("#cliSinPedidos").hidden = true;
  if (!fichaCliente.open) fichaCliente.showModal();

  const { data, error } = await sb
    .from("pedidos")
    .select("*, reserva_vence, pedido_items(producto_id, nombre, cantidad, precio_unitario, imagen, sku)")
    .eq("tienda_id", estado.tienda.id)
    .eq("cliente_id", c.id)
    .order("creado_en", { ascending: false });
  if (error) return aviso(mensajeError(error), "error");

  $("#cliSinPedidos").hidden = data.length > 0;
  $("#cliPedidos").replaceChildren(
    ...data.map((p) => {
      const li = document.createElement("li");
      li.className = "fila";
      const info = document.createElement("button");
      info.type = "button";
      info.className = "fila-info";
      info.setAttribute("aria-label", "Ver pedido " + codigoDe(p));
      const t = document.createElement("span");
      t.className = "fila-nombre";
      t.textContent = codigoDe(p);
      const m = document.createElement("span");
      m.className = "fila-meta";
      const piezas = p.pedido_items.reduce((x, i) => x + i.cantidad, 0);
      m.textContent = fechaHora.format(new Date(p.creado_en)) + " · " + piezas + (piezas === 1 ? " pieza" : " piezas");
      info.append(t, m);
      info.addEventListener("click", () => {
        fichaCliente.close();
        abrirPedido(p);
      });
      const total = document.createElement("span");
      total.className = "fila-precio";
      total.textContent = enDinero(p.total);
      li.append(fotosPedido(p), info, total, insigniaEstado(p.estado));
      return li;
    })
  );
}

$("#cliCerrar").addEventListener("click", () => fichaCliente.close());

$("#formCliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = clienteAbierto;
  if (!c) return;
  const error = $("#cliError");
  const correo = $("#cCorreoCli").value.trim().toLowerCase();
  const nombre = $("#cNombreCli").value.trim();
  if (!nombre) { error.textContent = "Escribe el nombre."; error.hidden = false; return; }
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    error.textContent = "Revisa el correo, o déjalo vacío.";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  $("#cliGuardar").disabled = true;
  const { error: e2 } = await sb.from("clientes").update({
    nombre,
    correo,
    departamento: $("#cDepartamentoCli").value.trim(),
    zona: $("#cZonaCli").value.trim(),
    direccion: $("#cDireccionCli").value.trim(),
    notas: $("#cNotasCli").value.trim(),
  }).eq("id", c.id);
  $("#cliGuardar").disabled = false;
  if (e2) { error.textContent = mensajeError(e2); error.hidden = false; return; }
  await cargarClientes();
  const actualizado = estado.clientes.find((x) => x.id === c.id);
  if (actualizado) {
    clienteAbierto = actualizado;
    $("#cliTitulo").textContent = actualizado.nombre;
  }
  aviso("Listo. Datos del cliente guardados.");
});

/* ─────────────── Arranque ─────────────── */

const { data: { session } } = await sb.auth.getSession();
if (session) await verificar();
else mostrarVista("vistaLogin");

/* ─────────────── Descargar en Excel ─────────────── */

const exportar = $("#exportar");

$("#abrirExportar").addEventListener("click", () => {
  const hoy = hoyGT();
  $("#exPeriodo").value = "mes";
  $("#exMes").value = hoy.slice(0, 7);
  $("#exMes").max = hoy.slice(0, 7);
  $("#exMesCampo").hidden = true;
  $("#exNotas").checked = false;
  exportar.showModal();
});
$("#exPeriodo").addEventListener("change", () => { $("#exMesCampo").hidden = $("#exPeriodo").value !== "elegir"; });
$("#exCancelar").addEventListener("click", () => exportar.close());

// "2026-11" → primer y último día de ese mes
function rangoDeMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: mes + "-01", hasta: mes + "-" + String(ultimo).padStart(2, "0") };
}

$("#formExportar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const opcion = $("#exPeriodo").value;
  let desde = null, hasta = null, nombrePeriodo = "Todo el historial", sufijo = "todo";
  if (opcion === "mes" || opcion === "mespasado") {
    ({ desde, hasta } = rangoDeMes(rangoPeriodo(opcion).desde.slice(0, 7)));
    nombrePeriodo = nombreMes(desde);
    sufijo = desde.slice(0, 7);
  } else if (opcion === "elegir") {
    if (!/^\d{4}-\d{2}$/.test($("#exMes").value)) return aviso("Elige un mes.", "error");
    ({ desde, hasta } = rangoDeMes($("#exMes").value));
    nombrePeriodo = nombreMes(desde);
    sufijo = desde.slice(0, 7);
  }

  const boton = $("#exDescargar");
  boton.disabled = true;
  boton.textContent = "Preparando…";
  try {
    const cli = await traerTodas(() => sb.from("clientes").select("*").eq("tienda_id", estado.tienda.id)
      .order("nombre").order("id"));
    if (cli.error) throw cli.error;
    const hojas = construirHojas({
      tienda: estado.tienda, pedidos: estado.pedidos, productos: estado.productos, clientes: cli.data,
      desde, hasta, nombrePeriodo, incluirNotas: $("#exNotas").checked, nombreSeccion,
    });
    await descargarExcel(hojas, estado.tienda.slug + "_ventas_" + sufijo + ".xlsx");
    exportar.close();
    aviso("Listo: revisa tus descargas.");
  } catch (err) {
    console.error(err);
    aviso("No se pudo preparar el archivo. " + mensajeError(err), "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Descargar";
  }
});
