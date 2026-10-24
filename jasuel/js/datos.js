/* ============================================================
   JASUEL · Datos del sitio
   ------------------------------------------------------------
   ESTE ES EL UNICO ARCHIVO QUE HAY QUE EDITAR PARA EL DIA A DIA:
   el numero de WhatsApp, los productos, los precios y las fotos.

   Para agregar una joya: copiá un bloque { ... } completo,
   pegalo al final de la lista y cambiale los datos.
   ============================================================ */

const CONFIG = {
  // Numero de WhatsApp con codigo de pais, solo digitos. Guatemala = 502.
  // >>> PENDIENTE: cambiar por el numero real de la clienta <<<
  whatsapp: "50200000000",

  instagram: "jasuel.gt",
  moneda: "Q",
};

/* Las categorias salen solas de los productos, pero este orden manda. */
const ORDEN_CATEGORIAS = ["Collares", "Pulseras", "Anillos", "Aretes", "Sets"];

/* ------------------------------------------------------------
   PRECIOS DE EJEMPLO. Confirmar cada uno antes de publicar.
   Las fotos actuales salieron del Instagram y estan en baja
   resolucion: reemplazarlas por las originales en assets/productos/.
   ------------------------------------------------------------ */
const PRODUCTOS = [
  {
    id: "collar-pantera",
    nombre: "Collar Pantera",
    categoria: "Collares",
    precio: 265,
    img: "assets/productos/collar-pantera.webp",
    alt: "Collar de eslabones dorados con dije de pantera y cuentas rojas",
    descripcion:
      "Cadena de eslabon alargado de un lado y cuentas rojas del otro, con el dije de pantera al centro. Es la pieza que se lleva sola: va con camisa blanca y con vestido negro.",
    datos: ["Baño de oro 18k", "Largo 45 cm con extension", "Cierre de mosqueton"],
  },
  {
    id: "pulsera-amuleto",
    nombre: "Pulsera Doble Amuleto",
    categoria: "Pulseras",
    precio: 215,
    img: "assets/productos/pulsera-amuleto.webp",
    alt: "Pulsera doble dorada con dijes de abanico, moneda y circon",
    descripcion:
      "Dos cadenas finas en una sola pulsera, con tres dijes: abanico, moneda y una piedra pequeña. Se ve bien sola o encima de un reloj.",
    datos: ["Baño de oro 18k", "Ajustable de 16 a 19 cm", "Dijes fijos, no se caen"],
  },
  {
    id: "trio-anillos",
    nombre: "Trío Textura",
    categoria: "Anillos",
    precio: 180,
    img: "assets/productos/trio-anillos.webp",
    alt: "Tres anillos dorados texturizados apilados",
    descripcion:
      "Tres anillos para usar juntos en un dedo o repartidos. Cada uno tiene un labrado distinto, así que la mano no queda plana.",
    datos: ["Baño de oro 18k", "Juego de 3 anillos", "Tallas 6, 7 y 8"],
  },
  {
    id: "aretes-gota",
    nombre: "Aretes Gota Luxe",
    categoria: "Aretes",
    precio: 195,
    img: "assets/productos/aretes-gota.webp",
    alt: "Aretes largos dorados con anillos sobre marmol",
    descripcion:
      "Aretes largos con caída, livianos para traerlos todo el día. El brillo es parejo, sin partes opacas.",
    datos: ["Baño de oro 18k", "Largo 6 cm", "Poste de acero quirúrgico"],
  },
  {
    id: "set-esencial",
    nombre: "Set Esencial",
    categoria: "Sets",
    precio: 425,
    img: "assets/productos/set-esencial.webp",
    alt: "Set de argollas, collar con dije y aretes pequeños dorados",
    descripcion:
      "El set para quien está empezando: argollas, un collar con dije y aretes chiquitos. Combina entre sí y con lo que ya tengas.",
    datos: ["Baño de oro 18k", "Incluye 3 piezas", "Viene en caja de regalo"],
  },
  {
    id: "set-perla",
    nombre: "Set Perla Clásica",
    categoria: "Sets",
    precio: 385,
    img: "assets/productos/set-perla.webp",
    alt: "Aretes de perla, anillo con perla y brazalete dorado junto a una caja de regalo",
    descripcion:
      "Aretes de perla, anillo a juego y brazalete liso. Es el regalo que no falla: llega listo en caja con listón.",
    datos: ["Baño de oro 18k", "Perla sintética de alta calidad", "Incluye 3 piezas"],
  },
];
