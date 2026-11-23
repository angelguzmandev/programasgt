// ============================================================
// PROGRAMASGT · Exportación a Excel (.xlsx)
// ------------------------------------------------------------
// Arma el libro con los datos que la dueña ya puede ver con su
// sesión (las reglas RLS de la base siguen aplicando) y lo
// descarga en su navegador. Nada pasa por un servidor nuestro.
//
// Reglas de formato:
//  - Fechas como fechas reales de Excel, en hora de Guatemala.
//  - Montos como números con formato "Q"#,##0.00 (nunca texto).
//  - Teléfono, SKU y código de pedido como TEXTO, para que Excel
//    no los convierta en número.
//  - Lo que escribieron clientas (nombres, notas, direcciones)
//    siempre como texto, nunca como fórmula.
//
// La librería se carga solo al exportar, desde el CDN permitido
// por la política de seguridad del panel, con versión fija.
// ============================================================

const LIBRERIA = "https://cdn.jsdelivr.net/npm/write-excel-file@4.1.1/browser/+esm";

const ZONA_GT = "America/Guatemala";
const SEIS_HORAS = 6 * 60 * 60 * 1000; // Guatemala es UTC−6 todo el año

const VENTA = ["entregado", "liquidado"];
const CERRADOS = ["cancelado", "devuelto"];

const ESTADO_TEXTO = {
  nuevo: "Nuevo", confirmado: "Confirmado", enviado: "En camino", entregado: "Entregado",
  liquidado: "Liquidado", cancelado: "Cancelado", devuelto: "Devuelto",
};
const CANAL_TEXTO = { web: "Tienda en línea", whatsapp: "WhatsApp", instagram: "Instagram", presencial: "En persona" };
const MOTIVO_STOCK = { venta: "Venta", cancelacion: "Cancelación", devolucion: "Devolución", ajuste: "Ajuste", reposicion: "Reposición" };

const FORMATO_Q = '"Q"#,##0.00';
const FORMATO_FECHA = "dd/mm/yyyy hh:mm";
const ENCABEZADO = { fontWeight: "bold", backgroundColor: "#EFEDE7" };

// "2026-11-23" del día en Guatemala (para comparar contra el período)
export const diaGT = (f) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_GT, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(f));

const enPeriodo = (f, desde, hasta) => {
  if (!f) return false;
  if (!desde) return true; // "Todo"
  const d = diaGT(f);
  return d >= desde && d <= hasta;
};

/* ─────────────── Celdas ─────────────── */

const texto = (v) => ({ value: v === null || v === undefined ? "" : String(v), type: String, format: "@" });
const numero = (v) => (v === null || v === undefined || v === "" ? null : { value: Number(v), type: Number });
const dinero = (v) => (v === null || v === undefined ? null : { value: Number(v), type: Number, format: FORMATO_Q });
// La librería escribe la hora en UTC: se corre 6 h para que se lea en hora de Guatemala
const fecha = (iso) => (iso ? { value: new Date(Date.parse(iso) - SEIS_HORAS), type: Date, format: FORMATO_FECHA } : null);
const siNo = (b) => texto(b ? "Sí" : "No");
const cab = (titulos) => titulos.map((t) => ({ value: t, ...ENCABEZADO }));

const codigoDe = (tienda, p) => tienda.prefijo_pedido + String(p.numero).padStart(4, "0");
const telefono = (t) => (t && t.length === 11 && t.startsWith("502") ? "+502 " + t.slice(3, 7) + " " + t.slice(7) : t ? "+" + t : "");

function hoja(nombre, filas, anchos) {
  return { sheet: nombre, data: filas, columns: anchos.map((width) => ({ width })), stickyRowsCount: 1 };
}

/* ─────────────── Libro ─────────────── */

// datos: { tienda, pedidos (con pedido_items), productos, clientes, desde, hasta, nombrePeriodo, incluirNotas }
export function construirHojas(datos) {
  const { tienda, pedidos, productos, clientes, desde, hasta, nombrePeriodo, incluirNotas } = datos;
  const nombreSeccion = datos.nombreSeccion || (() => "");

  const delPeriodo = pedidos.filter((p) => enPeriodo(p.creado_en, desde, hasta));
  const vendidos = pedidos.filter((p) => VENTA.includes(p.estado) && enPeriodo(p.entregado_en, desde, hasta));
  const liquidados = pedidos.filter((p) => p.estado === "liquidado" && enPeriodo(p.liquidado_en, desde, hasta));
  const porCobrar = pedidos.filter((p) => p.estado === "entregado");
  const suma = (lista) => lista.reduce((s, p) => s + Number(p.total), 0);

  // ── Resumen
  const vendido = suma(vendidos);
  const resumen = [
    [{ value: tienda.nombre, fontWeight: "bold", fontSize: 14 }],
    [texto("Período"), texto(nombrePeriodo)],
    [texto("Descargado el"), fecha(new Date().toISOString())],
    [],
    cab(["Cifra", "Valor"]),
    [texto("Vendido (pedidos entregados)"), dinero(vendido)],
    [texto("Cobrado (liquidado por la mensajería, antes de su comisión)"), dinero(suma(liquidados))],
    [texto("Por cobrar hoy (entregado, falta que la mensajería pague)"), dinero(suma(porCobrar))],
    [texto("Pedidos recibidos"), numero(delPeriodo.length)],
    [texto("Pedidos entregados"), numero(vendidos.length)],
    [texto("Pedido promedio"), dinero(vendidos.length ? vendido / vendidos.length : 0)],
    [texto("Cancelados"), numero(delPeriodo.filter((p) => p.estado === "cancelado").length)],
    [texto("Rechazados en la entrega (devueltos)"), numero(delPeriodo.filter((p) => p.estado === "devuelto").length)],
    [],
    [{ value: "Cómo se calcula", fontWeight: "bold" }],
    [texto("Vendido: suma del total de los pedidos entregados (o ya liquidados) cuya fecha de entrega cae en el período. Los cancelados y devueltos no cuentan.")],
    [texto("Cobrado: suma de los pedidos marcados como liquidados en el período. Es lo cobrado a las clientas; la comisión de la mensajería no está descontada.")],
    [texto("Pedidos recibidos: todos los pedidos creados en el período, en cualquier estado.")],
    [texto("Las fechas están en hora de Guatemala.")],
  ];

  // ── Pedidos (creados en el período)
  const filasPedidos = [cab([
    "Código", "Fecha del pedido", "Estado", "Canal", "Cliente", "Teléfono", "Correo",
    "Departamento", "Municipio y zona", "Dirección", "Referencias", "Piezas",
    "Subtotal", "Envío", "Descuento", "Total",
    "Confirmado el", "Confirmó la clienta", "Enviado el", "Guía", "Entregado el", "Liquidado el",
    "Motivo de cancelación o devolución", "Nota",
  ])];
  delPeriodo.forEach((p) => filasPedidos.push([
    texto(codigoDe(tienda, p)), fecha(p.creado_en), texto(ESTADO_TEXTO[p.estado] || p.estado),
    texto(CANAL_TEXTO[p.origen] || p.origen), texto(p.nombre), texto(telefono(p.telefono)), texto(p.correo),
    texto(p.departamento), texto(p.zona), texto(p.direccion), texto(p.referencias),
    numero((p.pedido_items || []).reduce((s, i) => s + i.cantidad, 0)),
    dinero(p.subtotal), dinero(p.costo_envio), dinero(p.descuento), dinero(p.total),
    fecha(p.confirmado_en), siNo(p.confirmado_por_cliente_en), fecha(p.enviado_en), texto(p.guia),
    fecha(p.entregado_en), fecha(p.liquidado_en), texto(p.motivo_cierre), texto(p.nota),
  ]));

  // ── Cobros (liquidados en el período, aunque se hayan creado antes)
  const filasCobros = [cab(["Código", "Cliente", "Entregado el", "Liquidado el", "Guía", "Total"])];
  liquidados.forEach((p) => filasCobros.push([
    texto(codigoDe(tienda, p)), texto(p.nombre), fecha(p.entregado_en), fecha(p.liquidado_en), texto(p.guia), dinero(p.total),
  ]));
  filasCobros.push([], [{ value: "Total cobrado", fontWeight: "bold" }, null, null, null, null,
    { value: suma(liquidados), type: Number, format: FORMATO_Q, fontWeight: "bold" }]);

  // ── Piezas vendidas (cada línea de los pedidos del período)
  const filasPiezas = [cab(["Código del pedido", "Fecha", "Estado", "SKU", "Producto", "Cantidad", "Precio unitario", "Importe"])];
  delPeriodo.forEach((p) => (p.pedido_items || []).forEach((i) => filasPiezas.push([
    texto(codigoDe(tienda, p)), fecha(p.creado_en), texto(ESTADO_TEXTO[p.estado] || p.estado),
    texto(i.sku), texto(i.nombre), numero(i.cantidad), dinero(i.precio_unitario), dinero(i.cantidad * i.precio_unitario),
  ])));

  // ── Productos (con lo vendido en el período)
  const ventaPorProducto = {};
  vendidos.forEach((p) => (p.pedido_items || []).forEach((i) => {
    const v = (ventaPorProducto[i.producto_id] ||= { unidades: 0, importe: 0, ultima: null });
    v.unidades += i.cantidad;
    v.importe += i.cantidad * i.precio_unitario;
    if (!v.ultima || p.entregado_en > v.ultima) v.ultima = p.entregado_en;
  }));
  const filasProductos = [cab([
    "SKU", "Producto", "Sección", "Precio", "En mano", "Apartadas", "Disponible",
    "Visible en la tienda", "Archivado", "Etiqueta", "Unidades vendidas", "Ventas", "Última venta",
  ])];
  productos.forEach((p) => {
    const v = ventaPorProducto[p.id] || { unidades: 0, importe: 0, ultima: null };
    const controla = p.existencia !== null && p.existencia !== undefined;
    filasProductos.push([
      texto(p.sku), texto(p.nombre), texto(nombreSeccion(p.seccion_id)), dinero(p.precio),
      controla ? numero(p.existencia) : texto("Sin control"), controla ? numero(p.apartadas || 0) : null,
      controla ? numero(p.disponible ?? p.existencia) : null,
      siNo(p.visible && !p.archivado), siNo(p.archivado), texto(p.etiqueta),
      numero(v.unidades), dinero(v.importe), fecha(v.ultima),
    ]);
  });

  // ── Clientes (historial completo)
  const porCliente = {};
  pedidos.forEach((p) => {
    if (!p.cliente_id) return;
    const r = (porCliente[p.cliente_id] ||= { pedidos: 0, comprado: 0, ultimo: null });
    if (!CERRADOS.includes(p.estado)) r.pedidos += 1;
    if (VENTA.includes(p.estado)) r.comprado += Number(p.total);
    if (!r.ultimo || p.creado_en > r.ultimo) r.ultimo = p.creado_en;
  });
  const titulosClientes = ["Nombre", "Teléfono", "Correo", "Departamento", "Municipio y zona", "Dirección",
    "Cliente desde", "Pedidos", "Total comprado", "Último pedido"];
  if (incluirNotas) titulosClientes.push("Notas internas");
  const filasClientes = [cab(titulosClientes)];
  clientes.forEach((c) => {
    const r = porCliente[c.id] || { pedidos: 0, comprado: 0, ultimo: null };
    const fila = [
      texto(c.nombre), texto(telefono(c.telefono)), texto(c.correo), texto(c.departamento), texto(c.zona),
      texto(c.direccion), fecha(c.creado_en), numero(r.pedidos), dinero(r.comprado), fecha(r.ultimo),
    ];
    if (incluirNotas) fila.push(texto(c.notas));
    filasClientes.push(fila);
  });

  return [
    hoja("Resumen", resumen, [58, 22]),
    hoja("Pedidos", filasPedidos, [11, 17, 12, 15, 24, 17, 26, 15, 22, 34, 24, 8, 12, 11, 11, 12, 17, 10, 17, 14, 17, 17, 30, 30]),
    hoja("Cobros", filasCobros, [12, 26, 17, 17, 14, 14]),
    hoja("Piezas vendidas", filasPiezas, [12, 17, 12, 11, 28, 10, 15, 13]),
    hoja("Productos", filasProductos, [11, 28, 14, 12, 10, 11, 11, 11, 10, 22, 12, 13, 17]),
    hoja("Clientes", filasClientes, incluirNotas
      ? [26, 17, 28, 15, 22, 34, 17, 9, 15, 17, 40]
      : [26, 17, 28, 15, 22, 34, 17, 9, 15, 17]),
  ];
}

export async function descargarExcel(hojas, nombreArchivo) {
  const { default: writeExcelFile } = await import(LIBRERIA);
  await writeExcelFile(hojas, { fontFamily: "Calibri", fontSize: 11 }).toFile(nombreArchivo);
}
