# Investigación de mercado: POS / mesas y pedidos para restaurantes en Guatemala

**Documento interno. No publicar en el sitio.**
Fecha: 30 de septiembre de 2026 · Para revisión del socio antes de decidir si se construye.

---

## Resumen en una línea

Hay un hueco real en el mercado, pero **no es el que imaginamos al inicio**. No es "una app de mesas y
pedidos" — eso ya lo venden once competidores. El hueco es **el único POS que sigue vendiendo y
facturando cuando se cae el internet**.

---

## 1. El cruce que define la oportunidad

Tres datos que, juntos, describen una contradicción que nadie en el mercado está resolviendo:

| Dato | Fuente |
|---|---|
| FEL es **obligatorio desde julio 2023** para todo el régimen de IVA, incluido Pequeño Contribuyente | [Portal SAT FEL](https://portal.sat.gob.gt/portal/efactura/), [Minfin](https://saladeprensa.minfin.gob.gt/pequenos-contribuyentes-deberan-emitir-fel/) |
| FEL **requiere conexión** para certificar cada documento | Acuerdo de Directorio 13-2018 |
| Guatemala tiene **62% de penetración de internet** (38% offline) y corre sobre datos móviles prepago | [DataReportal Digital 2026](https://datareportal.com/reports/digital-2026-guatemala) |

**Conclusión:** la ley exige facturar en línea en un país que no siempre tiene línea. Nadie vende la
solución a eso de frente.

- **Loyverse** tiene modo offline pero **no tiene FEL**.
- **Los locales** tienen FEL pero son caros, pesados y asumen conexión permanente.

---

## 2. Mapa de precios del mercado guatemalteco

| Producto | Precio publicado | FEL | Gratis |
|---|---|---|---|
| Loyverse | **Gratis** (add-ons US$5–25/mes por tienda) | No | Sí |
| Sabor Suite | US$45/mes ≈ Q350/mes | Sí | No indica |
| Vendty GT | ~Q315/mes (planes anuales inconsistentes — verificar) | Sí (Digifact) | 7 días |
| Kitchen502 | **Q2,142–Q3,570/mes** + Q1,785 implementación | Sí (INFILE/DIGIFACT) | No |
| GuatePos, SDIG, SoftGuate, BAC Credomatic | **No publican precio** | — | — |
| Soft Restaurant (MX) | MX$500–900/mes ≈ Q200–360 | — | No |

**Hallazgo estructural:** **Square y Toast no operan en Guatemala.** Su propia documentación de
disponibilidad internacional no lista ningún país de Latinoamérica. Los dos productos con mejor
diseño del mundo no están aquí y no emiten FEL — **no hay presión competitiva de calidad de UX en
este mercado.** La barra está en el suelo.

---

## 3. Los tres huecos, en orden de valor

### Hueco 1 — FEL con cola offline y contingencia garantizada
El más grande y el más defendible. La promesa es literal: *"se cae tu internet o se cae el
certificador — seguís vendiendo, nosotros certificamos y regularizamos solo cuando vuelve la señal."*
Resuelve el miedo número uno del dueño: **si no puedo facturar, no puedo cobrar.**

### Hueco 2 — El tramo Q149–Q249/mes está vacío
Mira el salto: gratis-sin-FEL → Q315 → **Q2,142**. Kitchen502 cuesta 6 a 10 veces más que Sabor
Suite. Para un comedor que factura Q30–60k/mes, Q2,380/mes es impensable. El hueco es un producto
todo-incluido con **el costo del certificador ya dentro del precio**, una sola factura, sin cargo de
implementación, autoservicio en 20 minutos.

El "agenda una demo" de GuatePos, SDIG y SoftGuate es la confesión de que el sector vende
**consultoría, no producto**. Un competidor de autoservicio les come el tramo bajo entero.

### Hueco 3 — Hecho y probado en hardware real de aquí
Target de referencia: **tablet Android de gama baja con 2GB de RAM + térmica Bluetooth 58mm de
Q760** (referencia HARTEC). No "compatible con" — **probado ahí**. Con consumidor final en un toque
(el caso dominante en un comedor), recibo que quepa en 58mm con IVA y UUID legibles, y el menú
cargable desde una foto en lugar de "carga de mucha información a detalle".

### Bonus estratégico gratis
**Publicar el precio en quetzales en la home, sin demo obligatoria.** Solo tres competidores lo
hacen. Eso por sí solo es ventaja competitiva en este mercado.

---

## 4. Cómo opera de verdad un comedor (y qué rompe el software genérico)

**El error de modelado más común:** tratar la mesa como la identidad de la cuenta. La entidad es
**la cuenta**; la mesa es un atributo cambiable. Si no, no se puede mover un cliente de mesa 3 a 7,
juntar 7+8, ni separarlas después — y el mesero lo "resuelve" abriendo otra cuenta y anulando la
primera, que es exactamente el hueco por donde se roba.

**Casos borde obligatorios:** cuenta dividida con pago mixto (mitad efectivo, mitad tarjeta, propina
distinta en cada parte), cambio de mesa con comanda en cocina, fusionar y separar mesas, para-llevar
y WhatsApp en la misma cola que las mesas, corrección antes vs. después de cocina (modificación sin
merma vs. merma con responsable), cortesías con motivo y autorizante, y el "ya no hay" marcado
**desde cocina** que apaga el plato para todos al instante.

**Propina en Guatemala:** no está regulada por ley, es voluntaria (DIACO). El 10% sugerido es
costumbre y el reparto es conflictivo — en muchos restaurantes ya no es exclusivo del mesero que
atendió. El software debe dejarla **opcional y editable**, separada de la base gravable, y soportar
pool o individual como configuración.

### Los tres actores tienen intereses opuestos

| | Dueño | Mesero | Cocinero |
|---|---|---|---|
| Quiere | Auditoría: qué se anuló, qué se regaló, quién lo hizo | Cerrar mesas rápido; que el sistema no lo delate ni lo haga más lento | Comandas legibles y que sala deje de vender lo que no hay |
| Ante un error | Que quede registrado | Que desaparezca | Saberlo a tiempo |

**Implicación de diseño, y es la más importante del documento:** el software no puede ser "del
dueño" ni "del mesero". Si es solo del dueño (vigilancia), el mesero lo sabotea — anota en libreta y
captura al final del día, con lo que los datos son ficción. Si es solo del mesero, el dueño no paga.
La única salida es que **al mesero le ahorre trabajo real** y que la auditoría sea un **subproducto
automático** de ese ahorro, nunca un paso extra. **La trazabilidad debe ser invisible para quien la
genera.**

### Las 5 condiciones de supervivencia
Si falla una, lo abandonan en una semana:

1. Pedido completo más rápido que la libreta, **y sin internet**.
2. Cuenta abierta y mutable sin pedir permiso al dueño.
3. Cierre de caja que **explica el descuadre** (anulaciones, cortesías y descuentos con motivo, hora
   y usuario). Es el reemplazo digital de "estar en la caja" — y el único entregable que justifica la
   mensualidad.
4. Mesero nuevo operativo en **10 minutos, sin manual** (la rotación es la constante del rubro).
5. Agotados en tiempo real y todos los canales en un solo lugar. Si terminan usando el sistema **y**
   la libreta, el doble trabajo mata la adopción.

### La objeción que ningún proveedor dice en voz alta
Digitalizar las ventas las hace **visibles al fisco**. Para un negocio parcialmente informal,
registrar el 100% es un riesgo, no un beneficio. Competimos contra ese incentivo, no solo contra
otros POS.

---

## 5. Viabilidad técnica

### Stack recomendado
**PWA (Vite + TypeScript + Tailwind) + IndexedDB vía Dexie + cola de eventos propia → backend
Fastify + Postgres + Zod en Docker detrás de Caddy.**

**Por qué:** es casi exactamente el stack que ya tenemos corriendo en `asistente-ia/` (Node 20,
Fastify 5, postgres.js, Zod, Docker, Caddy, TS). Ahorra 1–2 semanas reales. Cero curva de Dart, cero
Play Store, cero build nativo, actualización instantánea sin pedirle nada al cliente.

### El consejo técnico más valioso: NO usar motor de sincronización
Se evaluaron PowerSync, ElectricSQL, RxDB, PouchDB y CRDTs (Yjs/Automerge). Adoptar uno "para
hacerlo bien" es la forma más común de quemar 6 semanas sin nada vendible.

Un CRDT garantiza **convergencia, no corrección de negocio**: dos meseros cerrando la misma mesa
offline convergen a un estado que puede cobrar doble o ninguno. ElectricSQL solo cubre el camino de
lectura. RxDB es last-write-wins con el servidor ganando, lo que puede perder datos.

**La salida:** si cada pedido es **append-only** (líneas inmutables con ID generado en el cliente,
ULID/UUIDv7) y "cerrar cuenta" es un evento de **dueño único**, basta una cola de eventos
idempotente contra nuestro propio endpoint. Eso se escribe en días.

### Impresión térmica: donde se cae el 80% de las demos
Todo pasa por **ESC/POS**. Límite duro: **iOS no puede imprimir** — Safari no implementa Web
Bluetooth ni WebUSB. Web Bluetooth y WebUSB son solo Chromium y requieren HTTPS. Epson ePOS-Print
exige impresora de gama con Ethernet y choca con mixed content. Star CloudPRNT requiere hospedar un
servidor compatible y añade retardo de polling.

**Decisión:** Android + impresora Bluetooth ESC/POS como **única configuración soportada**, con 1 o 2
modelos **certificados y comprados antes de programar esa semana**. El iPhone sirve para consultar,
no para la caja. Decirlo explícitamente en la venta.

### Cobro
**Recurrente** es la vía correcta para el SaaS: 4.5% + IVA por cobro exitoso, sin afiliación ni
mensualidad, suscripciones recurrentes sin costo extra, alta autoservicio. VisaNet/NeoNet tiene
comisión más baja (~3.5–4.5%) pero exige contrato, RTU, patente y trámite largo — no vale la pena
hasta tener volumen.

### Costos
Infraestructura: **US$8–10/mes con 10 negocios, US$25–50 con 50, US$60–120 con 200.** Es ruido.

**El costo real es soporte:** 1 hora al mes × 50 clientes = un empleo de medio tiempo. Ese es el
número a modelar, no el VPS.

**Trampa económica a evitar:** el certificador FEL cobra Q0.25–1.50 por DTE más Q99–499/mes de
plan. Un comedor con 40 tickets/día son ~Q300/mes en DTE — **el doble de la suscripción**. Si
absorbemos el DTE sin pensarlo, **perdemos dinero por cliente.**

---

## 6. La contradicción sin resolver

Los informes chocan en el punto más importante:

- **Operación** dice: sin FEL la app es *"una libreta más cara"*.
- **Viabilidad** dice: FEL fuera del MVP o se come 6 semanas.
- **Mercado** dice: FEL offline **es** el producto.

**Lectura recomendada:** el de mercado tiene razón, y eso significa que **no hay MVP de 6–8
semanas**. Si FEL es el diferenciador, es lo primero que se construye, no lo último. Un POS de
comandas sin FEL compite contra Loyverse, que es gratis — y pierde.

---

## 7. Qué hacer antes de escribir código

**No escribir código.** Ir a **5 comedores** (mercado, zona 1, donde el internet sea malo) y
preguntar tres cosas:

1. ¿Cómo facturás hoy? ¿Qué certificador usás y cuánto pagás?
2. ¿Qué hacés cuando se cae el internet a las 8pm con el comedor lleno?
3. ¿Pagarías Q200 al mes por algo que nunca te deje sin facturar?

Si la pregunta 2 les cambia la cara, hay producto. Si dicen "nunca se me cae" o "uso talonario", el
hueco no está donde creemos.

**Prueba de fuego adicional:** conseguir un comedor que se comprometa al piloto y preguntarle si
pagaría por algo que **no** factura FEL. Ese "no" cuesta una conversación hoy; descubrirlo en la
semana 8 cuesta dos meses.

---

## 8. Límites de esta investigación — leer antes de decidir

Esta investigación se hizo con búsqueda web, no con trabajo de campo, y tiene huecos que importan:

- **Reddit bloqueado** (r/restaurantowners, r/KitchenConfidential) para el agente de búsqueda.
- **El portal de certificadores de la SAT devolvió HTTP 403.** La lista de certificadores que
  aparece aquí viene de fuentes secundarias y **las autorizaciones pueden revocarse** — hay que
  verificarla manualmente en portal.sat.gob.gt antes de contratar.
- **Los grupos de Facebook guatemaltecos no son indexables**, así que no hay quejas verbatim de
  dueños locales.
- **Buena parte de la evidencia son blogs de proveedores de POS**, que son parte interesada. Las
  cifras llamativas (68% de pérdidas por comandas manuales, 5–10% de la facturación por fraude
  interno) son material de marketing, **no estudios verificables**.
- **No se pudo confirmar:** precio de OlaClick Premium, ni precios de GuatePos, SDIG, SoftGuate,
  INVU POS GT ni BAC Credomatic (ninguno publica). Los precios anuales de Vendty son internamente
  inconsistentes.

**Los tres informes, por separado, llegaron a la misma recomendación: 5–10 entrevistas presenciales
valen más que todo lo que se encontró en línea.** Ese es trabajo que solo nosotros podemos hacer
aquí, y es precisamente la ventaja que ningún competidor extranjero va a tener.

---

## Fuentes principales

**Competencia:** [Kitchen502](https://kitchen502.com/) · [Sabor Suite](https://saborsuite.com/pos-para-restaurantes/) · [Vendty GT](https://www.vendty.com/gt) · [GuatePos](https://guatepos.com/restaurantes/) · [Loyverse precios](https://loyverse.com/en-us/pricing) · [ComparaSoftware GT](https://www.comparasoftware.gt/punto-de-venta) · [Square disponibilidad internacional](https://squareup.com/help/us/en/article/5717-international-availability) · [Toast precios](https://pos.toasttab.com/pricing)

**FEL:** [Portal SAT](https://portal.sat.gob.gt/portal/efactura/) · [Minfin](https://saladeprensa.minfin.gob.gt/pequenos-contribuyentes-deberan-emitir-fel/) · [Guía KODDIX](https://www.koddix.com/blog/fel-guatemala-guia-completa) · [Certificadores](https://facturasimple.com/gt/blog/gt-factura-electronica-en-linea-fel-certificadores-sat) · [EDICOM](https://edicomgroup.com/blog/online-electronic-invoice-system-works-fel-de-guatemala) · [Infile](https://infile.com.gt/) · [paquete open source infile-fel](https://github.com/realsoftgt/infile-fel)

**Hardware y conectividad:** [HARTEC térmica 80mm Q760](https://hartec-gt.com/producto/impresora-termica-bluetoothusb-80mm/) · [TecnoSISTEMAS 3nStar](https://www.tecnosistemas.com.gt/impresoras-de-recibos-3nstar-guatemala.php) · [DataReportal Digital 2026 Guatemala](https://datareportal.com/reports/digital-2026-guatemala)

**Técnico:** [PowerSync vs ElectricSQL](https://powersync.com/blog/electricsql-vs-powersync-vs-replicache) · [RxDB alternativas](https://rxdb.info/alternatives.html) · [Epson ePOS-Print](https://files.support.epson.com/pdf/pos/bulk/tm-i_epos-print_um_en_revk.pdf) · [Star CloudPRNT](https://starmicronics.com/blog/webprnt-cloudprnt-comparison/) · [Recurrente](https://www.recurrente.com/) · [DigitalOcean](https://www.digitalocean.com/pricing/droplets) · [Supabase](https://supabase.com/pricing)

**Operación:** [Panca: robos internos](https://www.panca.pe/blog/como-evitar-robos-restaurante-con-sistema-pos/) · [Scrampi: mesas y domicilios](https://scrampi.com/blog/organizar-mesas-comandas-domicilios-restaurante/) · [Yimi: dividir cuentas](https://yimiglobal.com/blog/dividir-cuentas-en-un-restaurante-como-manejarlo/) · [Prensa Libre: propina](https://www.prensalibre.com/economia/es-legal-que-le-cobren-la-propina-en-la-factura-en-guatemala-esto-dice-la-ley/)
