// ============================================================
// PROGRAMASGT · Inicio (dashboard)
// ------------------------------------------------------------
// Todo se calcula en el navegador con los pedidos y productos que
// el panel ya cargó: no hay consultas extra a la base.
//
// Reglas (las mismas del Excel):
//  - Vendido = pedidos entregados o liquidados, por fecha de entrega.
//  - Cobrado = pedidos liquidados, por fecha de liquidación
//    (antes de la comisión de la mensajería).
//  - Pedidos recibidos = creados en el período, en cualquier estado.
//  - Los días se cuentan en hora de Guatemala.
//
// Todo el texto se pinta con textContent.
// ============================================================

import { diaGT } from "./excel.js?v=1";

const VENTA = ["entregado", "liquidado"];
const DIA = 24 * 60 * 60 * 1000;
const CLAVE_PERIODO = "pgt-panel-periodo";
const COLOR_BARRA = "#b0782a"; // validado: contraste y daltonismo sobre blanco
const SVG = "http://www.w3.org/2000/svg";

const CANALES = { web: "Tienda en línea", whatsapp: "WhatsApp", instagram: "Instagram", presencial: "En persona" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

export const PERIODOS = [
  ["mes", "Este mes"],
  ["mespasado", "Mes pasado"],
  ["7d", "Últimos 7 días"],
  ["3m", "Últimos 3 meses"],
  ["anio", "Este año"],
];

/* ─────────────── Fechas (días "AAAA-MM-DD" de Guatemala) ─────────────── */

const aFecha = (d) => new Date(d + "T00:00:00Z");
const deFecha = (f) => f.toISOString().slice(0, 10);
const sumarDias = (d, n) => deFecha(new Date(aFecha(d).getTime() + n * DIA));
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA) + 1;
const finDeMes = (anio, mes) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(); // mes 0-11
const dia = (anio, mes, d) => deFecha(new Date(Date.UTC(anio, mes, d)));

export const hoyGT = () => diaGT(new Date());

// Devuelve { desde, hasta, antes: {desde, hasta}, nombre, comparado }
export function rangoPeriodo(clave, hoy = hoyGT()) {
  const [a, m, d] = hoy.split("-").map(Number);
  const mes = m - 1;
  if (clave === "mespasado") {
    const desde = dia(a, mes - 1, 1);
    const hasta = dia(a, mes, 0);
    return {
      desde, hasta, nombre: nombreMes(desde), comparado: "el mes anterior",
      antes: { desde: dia(a, mes - 2, 1), hasta: dia(a, mes - 1, 0) },
    };
  }
  if (clave === "7d" || clave === "3m") {
    const n = clave === "7d" ? 7 : 90;
    const desde = sumarDias(hoy, -(n - 1));
    return {
      desde, hasta: hoy, nombre: clave === "7d" ? "Últimos 7 días" : "Últimos 3 meses",
      comparado: clave === "7d" ? "los 7 días anteriores" : "los 3 meses anteriores",
      antes: { desde: sumarDias(desde, -n), hasta: sumarDias(desde, -1) },
    };
  }
  if (clave === "anio") {
    // Mismo tramo del año pasado (1 ene → misma fecha)
    const finAntes = Math.min(d, finDeMes(a - 1, mes));
    return {
      desde: a + "-01-01", hasta: hoy, nombre: "Año " + a, comparado: "el mismo tramo de " + (a - 1),
      antes: { desde: (a - 1) + "-01-01", hasta: dia(a - 1, mes, finAntes) },
    };
  }
  // "mes": del 1 a hoy, contra los mismos días del mes pasado
  const finAntes = Math.min(d, finDeMes(a, mes - 1));
  return {
    desde: dia(a, mes, 1), hasta: hoy, nombre: nombreMes(hoy), comparado: "los mismos días del mes pasado",
    antes: { desde: dia(a, mes - 1, 1), hasta: dia(a, mes - 1, finAntes) },
  };
}

export function nombreMes(d) {
  const [a, m] = d.split("-").map(Number);
  const t = MESES_LARGO[m - 1];
  return t.charAt(0).toUpperCase() + t.slice(1) + " " + a;
}

const dentro = (iso, r) => {
  if (!iso) return false;
  const d = diaGT(iso);
  return d >= r.desde && d <= r.hasta;
};

/* ─────────────── Cálculos ─────────────── */

const suma = (lista) => lista.reduce((s, p) => s + Number(p.total), 0);

function cifras(pedidos, r) {
  const vendidos = pedidos.filter((p) => VENTA.includes(p.estado) && dentro(p.entregado_en, r));
  const vendido = suma(vendidos);
  return {
    vendidos,
    vendido,
    cobrado: suma(pedidos.filter((p) => p.estado === "liquidado" && dentro(p.liquidado_en, r))),
    recibidos: pedidos.filter((p) => dentro(p.creado_en, r)),
    promedio: vendidos.length ? vendido / vendidos.length : 0,
  };
}

// Barras: por día (≤ 7 días), por semana (≤ ~3 meses) o por mes
function cubetas(r) {
  const n = diasEntre(r.desde, r.hasta);
  const lista = [];
  if (n <= 7) {
    for (let i = 0; i < n; i++) {
      const d = sumarDias(r.desde, i);
      const f = aFecha(d);
      lista.push({ desde: d, hasta: d, etiqueta: String(f.getUTCDate()), titulo: f.getUTCDate() + " " + MESES[f.getUTCMonth()] });
    }
  } else if (n <= 100) {
    for (let d = r.desde; d <= r.hasta; d = sumarDias(d, 7)) {
      const h = sumarDias(d, 6) > r.hasta ? r.hasta : sumarDias(d, 6);
      const fd = aFecha(d), fh = aFecha(h);
      const corto = fd.getUTCDate() + " " + MESES[fd.getUTCMonth()];
      lista.push({
        desde: d, hasta: h, etiqueta: corto,
        titulo: d === h ? corto : corto + " – " + fh.getUTCDate() + " " + MESES[fh.getUTCMonth()],
      });
    }
  } else {
    let [a, m] = r.desde.split("-").map(Number);
    for (;;) {
      const d = dia(a, m - 1, 1);
      if (d > r.hasta) break;
      const h = dia(a, m, 0) > r.hasta ? r.hasta : dia(a, m, 0);
      lista.push({ desde: d < r.desde ? r.desde : d, hasta: h, etiqueta: MESES[m - 1], titulo: nombreMes(d) });
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
  }
  return lista;
}

/* ─────────────── Pequeños ayudantes del DOM ─────────────── */

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined && texto !== null) e.textContent = texto;
  return e;
}

function svg(etiqueta, attrs = {}) {
  const e = document.createElementNS(SVG, etiqueta);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

/* ─────────────── Pintar ─────────────── */

let ctx = null;       // { tienda, pedidos, productos, enDinero, urlImagen, irAPedidos, irAProductos, abrirPedido }
let periodo = "mes";
try { periodo = localStorage.getItem(CLAVE_PERIODO) || "mes"; } catch { /* sin almacenamiento */ }
if (!PERIODOS.some(([c]) => c === periodo)) periodo = "mes";

let relojAncho;
window.addEventListener("resize", () => {
  clearTimeout(relojAncho);
  relojAncho = setTimeout(() => { if (ctx && !document.querySelector("#seccionInicio").hidden) pintarGrafica(); }, 150);
});

export function pintarInicio(datos) {
  ctx = datos;
  if (!ctx.tienda) return;
  pintarHoy();
  pintarPeriodos();
  pintarPeriodo();
}

/* ── Para hoy: lo que hay que atender, sin importar el período ── */

function pintarHoy() {
  const { pedidos, productos, enDinero } = ctx;
  const ahora = Date.now();
  const filas = [];

  const nuevos = pedidos.filter((p) => p.estado === "nuevo");
  if (nuevos.length) {
    const vencen = nuevos.filter((p) => p.reserva_vence && Date.parse(p.reserva_vence) - ahora < DIA).length;
    filas.push({
      urgente: vencen > 0,
      titulo: plural(nuevos.length, "pedido nuevo por confirmar", "pedidos nuevos por confirmar"),
      detalle: vencen ? plural(vencen, "deja de apartar sus piezas", "dejan de apartar sus piezas") + " en menos de 24 horas"
        : "Confírmalos para apartar las piezas",
      ir: () => ctx.irAPedidos("atender"),
    });
  }

  const porEnviar = pedidos.filter((p) => p.estado === "confirmado");
  if (porEnviar.length) {
    const viejo = Math.min(...porEnviar.map((p) => Date.parse(p.confirmado_en || p.creado_en)));
    const dias = Math.floor((ahora - viejo) / DIA);
    filas.push({
      urgente: dias >= 2,
      titulo: plural(porEnviar.length, "pedido confirmado por enviar", "pedidos confirmados por enviar"),
      detalle: dias >= 1 ? "El más antiguo lleva " + plural(dias, "día", "días") + " esperando" : "Confirmados hoy",
      ir: () => ctx.irAPedidos("atender"),
    });
  }

  const atorados = pedidos.filter((p) => p.estado === "enviado" && p.enviado_en && ahora - Date.parse(p.enviado_en) > 5 * DIA);
  if (atorados.length) {
    filas.push({
      urgente: true,
      titulo: plural(atorados.length, "envío lleva", "envíos llevan") + " más de 5 días en camino",
      detalle: "Revisa la guía con la mensajería",
      ir: () => ctx.irAPedidos("enviado"),
    });
  }

  const calle = pedidos.filter((p) => p.estado === "entregado");
  if (calle.length) {
    const viejos = calle.filter((p) => p.entregado_en && ahora - Date.parse(p.entregado_en) > 7 * DIA);
    filas.push({
      urgente: viejos.length > 0,
      titulo: enDinero(suma(calle)) + " por cobrar",
      detalle: viejos.length ? enDinero(suma(viejos)) + " lleva más de 7 días sin liquidar" : "Entregado, falta que la mensajería te pague",
      ir: () => ctx.irAPedidos("entregado"),
    });
  }

  const agotados = productos.filter((p) => !p.archivado && p.visible && p.existencia !== null && (p.disponible ?? p.existencia) === 0);
  if (agotados.length) {
    filas.push({
      urgente: false,
      titulo: plural(agotados.length, "producto agotado se ve", "productos agotados se ven") + " en la tienda",
      detalle: "Repón existencias u ocúltalos",
      ir: () => ctx.irAProductos("agotados"),
    });
  }

  const lista = document.querySelector("#hoyLista");
  document.querySelector("#hoyVacio").hidden = filas.length > 0;
  lista.replaceChildren(...filas.map((f) => {
    const li = el("li");
    const b = el("button", "hoy-fila" + (f.urgente ? " hoy-urgente" : ""));
    b.type = "button";
    const txt = el("span", "hoy-texto");
    txt.append(el("span", "hoy-titulo", f.titulo), el("span", "hoy-detalle", f.detalle));
    b.append(el("span", "hoy-punto"), txt, el("span", "hoy-flecha", "›"));
    b.addEventListener("click", f.ir);
    li.append(b);
    return li;
  }));
}

function pintarPeriodos() {
  document.querySelector("#periodos").replaceChildren(...PERIODOS.map(([clave, texto]) => {
    const b = el("button", "chip", texto);
    b.type = "button";
    b.setAttribute("aria-pressed", String(periodo === clave));
    b.addEventListener("click", () => {
      periodo = clave;
      try { localStorage.setItem(CLAVE_PERIODO, clave); } catch { /* sin almacenamiento */ }
      pintarPeriodos();
      pintarPeriodo();
    });
    return b;
  }));
}

/* ── El período elegido ── */

function pintarPeriodo() {
  const r = rangoPeriodo(periodo);
  const ahora = cifras(ctx.pedidos, r);
  const antes = cifras(ctx.pedidos, r.antes);
  document.querySelector("#periodoNombre").textContent = r.nombre;
  pintarKpis(ahora, antes, r);
  pintarGrafica();
  pintarResultados(ahora.recibidos);
  pintarCanales(ahora.recibidos);
  pintarTop(ahora.vendidos);
  pintarInventario();
}

function pintarKpis(ahora, antes, r) {
  const { enDinero } = ctx;
  const tile = (titulo, valor, previo, esDinero, nota) => {
    const t = el("div", "tarjeta");
    t.append(el("p", "tarjeta-titulo", titulo), el("p", "tarjeta-valor", esDinero ? enDinero(valor) : String(valor)));
    const dif = Math.round((valor - previo) * 100) / 100;
    const d = el("p", "kpi-cambio " + (dif > 0 ? "kpi-sube" : dif < 0 ? "kpi-baja" : ""));
    const cifra = esDinero ? enDinero(Math.abs(dif)) : String(Math.abs(dif));
    d.textContent = previo === 0 && valor > 0 ? "Sin datos para comparar con " + r.comparado
      : dif === 0 ? "Igual que " + r.comparado
      : (dif > 0 ? "▲ " : "▼ ") + cifra + (dif > 0 ? " más" : " menos") + " que " + r.comparado;
    t.append(d);
    if (nota) t.append(el("p", "tarjeta-nota", nota));
    return t;
  };
  document.querySelector("#kpis").replaceChildren(
    tile("Vendido", ahora.vendido, antes.vendido, true, plural(ahora.vendidos.length, "pedido entregado", "pedidos entregados")),
    tile("Cobrado", ahora.cobrado, antes.cobrado, true, "Antes de la comisión de la mensajería"),
    tile("Pedidos recibidos", ahora.recibidos.length, antes.recibidos.length, false, "En cualquier estado"),
    tile("Pedido promedio", Math.round(ahora.promedio * 100) / 100, Math.round(antes.promedio * 100) / 100, true, "De los entregados"),
  );
}

/* ── Gráfica de columnas: vendido por día, semana o mes ── */

function cortoQ(n) {
  const m = ctx.tienda.moneda || "Q";
  if (n >= 1000) return m + (n / 1000).toLocaleString("es-GT", { maximumFractionDigits: 1 }) + "k";
  return m + Math.round(n);
}

function escalaBonita(max) {
  // Sin ventas (tienda nueva): eje de Q0 a Q1k. Ojo: un paso de 0 dejaría
  // colgado el ciclo de la cuadrícula.
  if (!(max > 0)) return [500, 1000];
  const paso0 = max / 4;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= paso0) || 10 * mag;
  return [paso, Math.ceil(max / paso) * paso];
}

function pintarGrafica() {
  const r = rangoPeriodo(periodo);
  const grupos = cubetas(r).map((c) => {
    const lista = ctx.pedidos.filter((p) => VENTA.includes(p.estado) && dentro(p.entregado_en, c));
    return { ...c, total: suma(lista), pedidos: lista.length };
  });
  const caja = document.querySelector("#grafica");
  const tip = document.querySelector("#graficaTip");
  tip.hidden = true;
  const total = grupos.reduce((s, g) => s + g.total, 0);
  document.querySelector("#graficaVacia").hidden = total > 0;

  const ancho = Math.max(280, caja.clientWidth || 600);
  const alto = 220;
  const izq = 48, der = 8, arriba = 10, abajo = 26;
  const areaAncho = ancho - izq - der, areaAlto = alto - arriba - abajo;
  const [paso, tope] = escalaBonita(Math.max(...grupos.map((g) => g.total)));
  const y = (v) => arriba + areaAlto - (v / tope) * areaAlto;

  const s = svg("svg", {
    viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto, role: "img",
    "aria-label": "Vendido por " + (grupos.length && grupos[0].desde === grupos[0].hasta ? "día" : "período") + ": " +
      grupos.map((g) => g.titulo + " " + ctx.enDinero(g.total)).join(", "),
  });

  // Cuadrícula fina y etiquetas del eje (en tinta, no en el color de la serie)
  for (let i = 0, v = 0; v <= tope + 1e-9 && i < 12; i++, v += paso) {
    s.append(svg("line", { x1: izq, x2: ancho - der, y1: y(v), y2: y(v), class: v === 0 ? "g-base" : "g-linea" }));
    const t = svg("text", { x: izq - 8, y: y(v) + 4, "text-anchor": "end", class: "g-eje" });
    t.textContent = cortoQ(v);
    s.append(t);
  }

  const banda = areaAncho / grupos.length;
  const grosor = Math.min(24, banda * 0.6);
  const cadaCuanto = Math.ceil(grupos.length / Math.max(1, Math.floor(areaAncho / 44)));
  grupos.forEach((g, i) => {
    const cx = izq + banda * i + banda / 2;
    const top = y(g.total), base = y(0);
    const h = base - top;
    if (h > 0.5) {
      const rad = Math.min(4, h, grosor / 2);
      const x0 = cx - grosor / 2, x1 = cx + grosor / 2;
      // Arriba redondeado, abajo recto contra la base
      s.append(svg("path", {
        class: "g-barra", fill: COLOR_BARRA,
        d: `M${x0},${base} V${top + rad} Q${x0},${top} ${x0 + rad},${top} H${x1 - rad} Q${x1},${top} ${x1},${top + rad} V${base} Z`,
      }));
    }
    if (i % cadaCuanto === 0) {
      const t = svg("text", { x: cx, y: alto - 8, "text-anchor": "middle", class: "g-eje" });
      t.textContent = g.etiqueta;
      s.append(t);
    }
    // Zona de toque más grande que la barra
    const zona = svg("rect", { x: izq + banda * i, y: arriba, width: banda, height: areaAlto, class: "g-zona", tabindex: "0" });
    const mostrar = () => {
      tip.replaceChildren(el("strong", "", g.titulo), el("span", "", ctx.enDinero(g.total)),
        el("span", "g-tip-tenue", plural(g.pedidos, "pedido", "pedidos")));
      tip.hidden = false;
      const izqTip = Math.min(Math.max(cx - tip.offsetWidth / 2, 0), ancho - tip.offsetWidth);
      tip.style.left = izqTip + "px";
      tip.style.top = Math.max(0, Math.min(top, base - 20) - tip.offsetHeight - 8) + "px";
      zona.classList.add("activa");
    };
    const ocultar = () => { tip.hidden = true; zona.classList.remove("activa"); };
    zona.addEventListener("pointerenter", mostrar);
    zona.addEventListener("pointerleave", ocultar);
    zona.addEventListener("focus", mostrar);
    zona.addEventListener("blur", ocultar);
    s.append(zona);
  });

  caja.replaceChildren(s);
}

/* ── Cómo terminaron los pedidos recibidos ── */

function barraFila(etiqueta, valor, max, texto) {
  const li = el("li", "barra-fila");
  const cab = el("div", "barra-cab");
  cab.append(el("span", "", etiqueta), el("span", "barra-valor", texto));
  const pista = el("div", "barra-pista");
  const relleno = el("div", "barra-relleno");
  relleno.style.width = (max ? Math.max(valor / max * 100, valor ? 2 : 0) : 0) + "%";
  pista.append(relleno);
  li.append(cab, pista);
  return li;
}

function pintarResultados(recibidos) {
  const n = recibidos.length;
  const cuenta = (f) => recibidos.filter(f).length;
  const pct = (v) => (n ? Math.round(v / n * 100) : 0) + "%";
  const filas = [
    ["Entregados", cuenta((p) => VENTA.includes(p.estado))],
    ["Todavía en proceso", cuenta((p) => ["nuevo", "confirmado", "enviado"].includes(p.estado))],
    ["Cancelados", cuenta((p) => p.estado === "cancelado")],
    ["Rechazados en la entrega", cuenta((p) => p.estado === "devuelto")],
  ];
  document.querySelector("#resultadosTotal").textContent = plural(n, "pedido recibido", "pedidos recibidos");
  document.querySelector("#resultados").replaceChildren(
    ...filas.map(([t, v]) => barraFila(t, v, n, v + " · " + pct(v)))
  );

  const cerrados = recibidos.filter((p) => (p.estado === "cancelado" || p.estado === "devuelto"));
  const motivos = document.querySelector("#motivos");
  motivos.hidden = cerrados.length === 0;
  document.querySelector("#motivosLista").replaceChildren(...cerrados.map((p) => {
    const li = el("li");
    const b = el("button", "motivo-fila");
    b.type = "button";
    b.append(
      el("strong", "", ctx.codigo(p)),
      el("span", "", (p.estado === "cancelado" ? "Cancelado" : "Rechazado") + ": " + (p.motivo_cierre || "sin motivo")),
    );
    b.addEventListener("click", () => ctx.abrirPedido(p));
    li.append(b);
    return li;
  }));
}

function pintarCanales(recibidos) {
  const conteo = {};
  recibidos.forEach((p) => { conteo[p.origen] = (conteo[p.origen] || 0) + 1; });
  const filas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  const max = filas.length ? filas[0][1] : 0;
  const caja = document.querySelector("#canales");
  if (!filas.length) return caja.replaceChildren(el("li", "vacio-chico", "Sin pedidos en este período."));
  caja.replaceChildren(...filas.map(([c, v]) =>
    barraFila(CANALES[c] || c, v, max, plural(v, "pedido", "pedidos"))));
}

/* ── Lo más vendido (por unidades entregadas en el período) ── */

function pintarTop(vendidos) {
  const por = {};
  vendidos.forEach((p) => (p.pedido_items || []).forEach((i) => {
    const r = (por[i.producto_id || i.nombre] ||= { nombre: i.nombre, imagen: i.imagen, unidades: 0, importe: 0 });
    r.unidades += i.cantidad;
    r.importe += i.cantidad * i.precio_unitario;
  }));
  const top = Object.values(por).sort((a, b) => b.unidades - a.unidades || b.importe - a.importe).slice(0, 5);
  const caja = document.querySelector("#top");
  if (!top.length) return caja.replaceChildren(el("li", "vacio-chico", "Todavía no hay ventas entregadas en este período."));
  caja.replaceChildren(...top.map((t, i) => {
    const li = el("li", "top-fila");
    const foto = el("img", "top-foto");
    foto.alt = "";
    foto.loading = "lazy";
    foto.width = 40;
    foto.height = 40;
    if (t.imagen) foto.src = ctx.urlImagen(t.imagen);
    const txt = el("div", "top-texto");
    txt.append(el("span", "top-nombre", t.nombre), el("span", "top-meta", plural(t.unidades, "unidad", "unidades")));
    li.append(el("span", "top-lugar", String(i + 1)), foto, txt, el("span", "top-importe", ctx.enDinero(t.importe)));
    return li;
  }));
}

/* ── Inventario: agotados y lo que se va a acabar pronto ── */

function pintarInventario() {
  const { productos, pedidos, enDinero } = ctx;
  const activos = productos.filter((p) => !p.archivado && p.existencia !== null && p.existencia !== undefined);
  const disp = (p) => p.disponible ?? p.existencia;

  // Ritmo: piezas en pedidos no cancelados de los últimos 30 días
  const hace30 = Date.now() - 30 * DIA;
  const ritmo = {};
  pedidos.forEach((p) => {
    if (p.estado === "cancelado" || p.estado === "devuelto" || Date.parse(p.creado_en) < hace30) return;
    (p.pedido_items || []).forEach((i) => { ritmo[i.producto_id] = (ritmo[i.producto_id] || 0) + i.cantidad; });
  });

  const agotados = activos.filter((p) => p.visible && disp(p) === 0);
  const pronto = activos
    .filter((p) => disp(p) > 0 && ritmo[p.id])
    .map((p) => ({ p, dias: Math.floor(disp(p) / (ritmo[p.id] / 30)) }))
    .filter((x) => x.dias <= 14)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 5);

  const filas = [
    ...agotados.slice(0, 5).map((p) => ({ nombre: p.nombre, nota: "Agotado y visible", clase: "inv-agotado" })),
    ...pronto.map(({ p, dias }) => ({
      nombre: p.nombre,
      nota: plural(disp(p), "disponible", "disponibles") + " · " + (dias < 1 ? "se acaba en días" : "alcanza para ~" + plural(dias, "día", "días")),
      clase: "inv-pronto",
    })),
  ];
  const caja = document.querySelector("#inventario");
  caja.replaceChildren(...(filas.length ? filas.map((f) => {
    const li = el("li", "inv-fila " + f.clase);
    const b = el("button", "inv-boton");
    b.type = "button";
    b.append(el("span", "inv-nombre", f.nombre), el("span", "inv-nota", f.nota));
    b.addEventListener("click", () => ctx.irAProductos(f.clase === "inv-agotado" ? "agotados" : "bajos"));
    li.append(b);
    return li;
  }) : [el("li", "vacio-chico", activos.length ? "Nada urgente: hay existencias para las próximas 2 semanas." : "Ningún producto lleva control de existencias.")]));

  const piezas = activos.reduce((s, p) => s + p.existencia, 0);
  const valor = activos.reduce((s, p) => s + p.existencia * Number(p.precio), 0);
  document.querySelector("#inventarioPie").textContent = activos.length
    ? plural(piezas, "pieza", "piezas") + " en mano · " + enDinero(valor) + " a precio de venta"
    : "";
}
