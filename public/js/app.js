/**
 * Mercado Fresco — cliente SPA (JavaScript Vanilla).
 *
 * - Una sola página: las vistas viven como <template> en index.html y se clonan aquí.
 * - Toda comunicación con el servidor usa fetch() con async/await y JSON.
 * - Los datos dinámicos se insertan SIEMPRE con .textContent / createElement
 *   (nunca .innerHTML), lo que neutraliza XSS (OWASP A03).
 * - Accesibilidad: foco al <h1> en cada cambio de vista, regiones aria-live,
 *   aviso con role="status" y operación completa con teclado (botones y enlaces nativos).
 * - El servidor es la autoridad: la sesión, los roles, los precios y el stock se
 *   validan en la API; lo que se ve aquí es sólo comodidad de interfaz.
 */
'use strict';

/* ======================================================================
   1. Utilidades
   ====================================================================== */
const API = new URL('../api/', window.location.href);
const dinero = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Constructor seguro de nodos: el texto se asigna con textContent. */
function el(etiqueta, { clase, texto, attrs } = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  if (attrs) for (const [k, v] of Object.entries(attrs)) nodo.setAttribute(k, String(v));
  nodo.append(...hijos);
  return nodo;
}

/** Llamada a la API REST. Siempre resuelve { ok, estado, datos }; nunca lanza. */
async function pedirApi(ruta, { metodo = 'GET', datos } = {}) {
  try {
    const r = await fetch(new URL(ruta, API), {
      method: metodo,
      headers: datos !== undefined ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { cuerpo = null; }
    return { ok: r.ok, estado: r.status, datos: cuerpo ?? { error: 'Respuesta inesperada del servidor.' } };
  } catch {
    return { ok: false, estado: 0, datos: { error: 'No se pudo conectar con el servidor. Revisá tu conexión.' } };
  }
}

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];
const contenido = $('#contenido');
const regionAviso = $('#aviso');
let temporizadorAviso;

/** Mensaje para lectores de pantalla (y visual): se vacía y se repone para que se vuelva a anunciar. */
function anunciar(mensaje, tipo = 'ok') {
  clearTimeout(temporizadorAviso);
  regionAviso.replaceChildren();
  temporizadorAviso = setTimeout(() => {
    regionAviso.append(el('p', { clase: tipo, texto: mensaje }));
    temporizadorAviso = setTimeout(() => regionAviso.replaceChildren(), 8000);
  }, 50);
}

function ocupado(region, valor) { region.setAttribute('aria-busy', valor ? 'true' : 'false'); }

function mensajeVacio(texto) { return el('p', { texto }); }

/** Contenedor con desplazamiento horizontal para tablas anchas (overflow-x: auto). Es enfocable
    con el teclado y tiene nombre, para que el desplazamiento también funcione sin mouse. */
function envoltorioTabla(tabla, nombre) {
  return el('div', { clase: 'tabla-envoltorio', attrs: { role: 'region', tabindex: '0', 'aria-label': nombre } }, tabla);
}

/* ======================================================================
   2. Estado
   ====================================================================== */
const estado = {
  sesion: { autenticado: false, usuario: null },
  productos: new Map(),          // id -> producto (para armar el carrito)
  carrito: new Map(),            // producto_id -> cantidad
  cupon: null,
  ultimoPedido: null,
  formatoCatalogo: 'tarjetas',    // 'tarjetas' | 'tabla' (como listado_box / listado_tabla de AE1)
};
const CUPONES = { UCP10: 0.10 }; // sólo para la vista previa; el total oficial lo calcula el servidor
const ENVIO = 800;

function guardarCarrito() {
  try { sessionStorage.setItem('mf_carrito', JSON.stringify([...estado.carrito])); } catch { /* sin almacenamiento: se sigue en memoria */ }
}
function recuperarCarrito() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem('mf_carrito') || '[]');
    for (const [id, cant] of guardado) if (Number.isInteger(id) && Number.isInteger(cant) && cant > 0) estado.carrito.set(id, cant);
  } catch { /* se ignora */ }
}
const esEmpleado = () => estado.sesion.usuario?.rol === 'empleado';
const cantidadCarrito = () => [...estado.carrito.values()].reduce((a, b) => a + b, 0);

function registrarProductos(lista) { for (const p of lista) estado.productos.set(p.id, p); }

/* ======================================================================
   3. Menú principal (según sesión y carrito)
   ====================================================================== */
const TITULOS = { '': 'Inicio', catalogo: 'Catálogo', ofertas: 'Ofertas', carrito: 'Carrito', cuenta: 'Mi cuenta', admin: 'Gestión' };

function renderMenu() {
  const menu = $('#menu');
  const actual = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
  const enlace = (ruta, texto, ...extra) => {
    const a = el('a', { attrs: { href: `#/${ruta}` } }, texto, ...extra);
    if (actual === ruta) a.setAttribute('aria-current', 'page');
    return el('li', {}, a);
  };
  const n = cantidadCarrito();
  const items = [
    enlace('', 'Inicio'),
    enlace('catalogo', 'Catálogo'),
    enlace('ofertas', 'Ofertas'),
    enlace('carrito', 'Carrito ',
      el('span', { clase: 'insignia-carrito', texto: String(n), attrs: { 'aria-hidden': 'true' } }),
      el('span', { clase: 'sr-only', texto: `(${n} ${n === 1 ? 'producto' : 'productos'})` })),
  ];
  if (esEmpleado()) items.push(enlace('admin', 'Gestión'));
  if (estado.sesion.autenticado) {
    items.push(enlace('cuenta', 'Mi cuenta'));
    const salir = el('button', { texto: `Cerrar sesión`, attrs: { type: 'button' } });
    salir.append(el('span', { clase: 'sr-only', texto: ` de ${estado.sesion.usuario.nombre}` }));
    salir.addEventListener('click', cerrarSesion);
    items.push(el('li', {}, salir));
  } else {
    items.push(enlace('cuenta', 'Ingresar'));
  }
  menu.replaceChildren(...items);
}

async function consultarSesion() {
  const r = await pedirApi('sesion.php');
  estado.sesion = r.ok ? r.datos : { autenticado: false, usuario: null };
  renderMenu();
}

async function cerrarSesion() {
  const r = await pedirApi('logout.php', { metodo: 'POST' });
  if (!r.ok) { anunciar(r.datos.error, 'error'); return; }
  estado.sesion = { autenticado: false, usuario: null };
  renderMenu();
  navegar('#/');
  anunciar('Cerraste sesión correctamente.');
}

/* ======================================================================
   4. Enrutador por hash
   ====================================================================== */
let tokenRuta = 0;
let primeraVista = true;

function navegar(hash) {
  if (location.hash === hash) rutear(); else location.hash = hash;
}

/** Clona una plantilla, la monta en <main>, actualiza el título y mueve el foco al <h1>. */
function montar(idPlantilla, titulo) {
  const plantilla = $(`#${idPlantilla}`);
  contenido.replaceChildren(plantilla.content.cloneNode(true));
  document.title = `${titulo} — Mercado Fresco`;
  renderMenu();
  window.scrollTo(0, 0);
  if (!primeraVista) {
    const h1 = $('[data-foco]', contenido);
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
  primeraVista = false;
}

async function rutear() {
  const token = ++tokenRuta;
  const [ruta = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const vigente = () => token === tokenRuta;
  switch (ruta) {
    case '': return vistaInicio(vigente);
    case 'catalogo': return vistaCatalogo(vigente, arg || null, false);
    case 'ofertas': return vistaCatalogo(vigente, null, true);
    case 'producto': return vistaProducto(vigente, Number.parseInt(arg, 10));
    case 'carrito': return vistaCarrito(vigente);
    case 'confirmado': return vistaConfirmacion();
    case 'cuenta': return vistaCuenta(vigente);
    case 'admin': return vistaAdmin(vigente);
    default:
      montar('vista-404', 'Página no encontrada');
  }
}

/* ======================================================================
   5. Vistas
   ====================================================================== */

/* ---------- Tarjeta de producto (CU-01) ---------- */
function etiquetasProducto(p) {
  const nivel = { ok: ['Stock disponible', 'etiqueta-ok'], bajo: ['Últimas unidades', 'etiqueta-bajo'], agotado: ['Sin stock', 'etiqueta-agotado'] }[p.nivel_stock];
  const lista = el('div', { clase: 'etiquetas' }, el('span', { clase: `etiqueta ${nivel[1]}`, texto: nivel[0] }));
  if (p.oferta) lista.prepend(el('span', { clase: 'etiqueta etiqueta-oferta', texto: 'Oferta' }));
  return lista;
}

function botonAgregar(p) {
  const b = el('button', { clase: 'btn btn-mostaza btn-chico', attrs: { type: 'button' } });
  if (p.stock <= 0) {
    b.disabled = true;
    b.append('Sin stock', el('span', { clase: 'sr-only', texto: `: ${p.nombre}` }));
  } else {
    b.append('Agregar', el('span', { clase: 'sr-only', texto: ` ${p.nombre} al pedido` }));
    b.addEventListener('click', () => agregarAlCarrito(p.id));
  }
  return b;
}

function tarjetaProducto(p) {
  const detalle = el('a', { clase: 'btn btn-borde btn-chico', attrs: { href: `#/producto/${p.id}` } }, 'Ver detalle',
    el('span', { clase: 'sr-only', texto: ` de ${p.nombre}` }));
  return el('li', {}, el('article', { clase: 'producto' },
    el('span', { clase: 'emoji', texto: p.emoji, attrs: { 'aria-hidden': 'true' } }),
    el('h2', { clase: 'nombre-producto', texto: p.nombre }),
    el('p', { clase: 'rubro-txt', texto: p.categoria }),
    el('p', { clase: 'precio' }, dinero.format(p.precio), el('small', { texto: ` / ${p.unidad}` })),
    etiquetasProducto(p),
    el('div', { clase: 'acciones' }, botonAgregar(p), detalle)));
}

/* ---------- Inicio ---------- */
async function vistaInicio(vigente) {
  montar('vista-inicio', 'Almacén de barrio online');
  const lista = $('#lista-rubros');
  const r = await pedirApi('categorias.php');
  if (!vigente()) return;
  ocupado(lista, false);
  if (!r.ok) { lista.replaceChildren(el('li', { texto: r.datos.error })); return; }
  lista.replaceChildren(...r.datos.map(c => el('li', {}, el('a', { clase: 'rubro', attrs: { href: `#/catalogo/${c.slug}` } },
    el('span', { clase: 'emoji', texto: c.emoji, attrs: { 'aria-hidden': 'true' } }),
    el('strong', { texto: c.nombre }),
    el('span', { clase: 'cant', texto: `${c.cantidad} ${c.cantidad === 1 ? 'producto' : 'productos'}` })))));
}

/* ---------- Catálogo / Ofertas (CU-01) ---------- */
async function vistaCatalogo(vigente, slug, soloOfertas) {
  montar('vista-catalogo', soloOfertas ? 'Ofertas' : 'Catálogo');
  const lista = $('#lista-productos');
  const filtros = $('#filtros');
  const cantidad = $('#resultado-cantidad');
  if (soloOfertas) $('h1', contenido).textContent = 'Ofertas de la semana';
  $('#catalogo-desc').textContent = soloOfertas
    ? 'Productos con precio promocional.'
    : 'Elegí un rubro para filtrar y agregá productos a tu pedido.';

  const rutaProductos = soloOfertas ? 'productos.php?oferta=1' : (slug ? `productos.php?categoria=${encodeURIComponent(slug)}` : 'productos.php');
  const [rc, rp] = await Promise.all([pedirApi('categorias.php'), pedirApi(rutaProductos)]);
  if (!vigente()) return;
  ocupado(lista, false);

  if (rc.ok) {
    const link = (href, texto, activo) => {
      const a = el('a', { texto, attrs: { href } });
      if (activo) a.setAttribute('aria-current', 'true');
      return el('li', {}, a);
    };
    filtros.replaceChildren(
      link('#/catalogo', 'Todos', !slug && !soloOfertas),
      ...rc.datos.map(c => link(`#/catalogo/${c.slug}`, c.nombre, c.slug === slug)));
  }
  if (!rp.ok) {
    lista.replaceChildren(el('li', { texto: rp.datos.error }));
    cantidad.textContent = '';
    return;
  }
  registrarProductos(rp.datos);
  const titulo = rc.ok && slug ? rc.datos.find(c => c.slug === slug)?.nombre : null;
  if (titulo) $('h1', contenido).textContent = titulo;
  cantidad.textContent = `${rp.datos.length} ${rp.datos.length === 1 ? 'producto' : 'productos'}`;
  const contenedorTabla = $('#tabla-catalogo');
  const dibujar = () => {
    const comoTabla = estado.formatoCatalogo === 'tabla';
    $('#ver-tarjetas').setAttribute('aria-pressed', String(!comoTabla));
    $('#ver-tabla').setAttribute('aria-pressed', String(comoTabla));
    lista.hidden = comoTabla;
    contenedorTabla.hidden = !comoTabla;
    if (!rp.datos.length) { lista.replaceChildren(el('li', { texto: 'No hay productos para mostrar.' })); return; }
    if (comoTabla) contenedorTabla.replaceChildren(tablaProductos(rp.datos));
    else lista.replaceChildren(...rp.datos.map(tarjetaProducto));
  };
  $('#ver-tarjetas').addEventListener('click', () => { estado.formatoCatalogo = 'tarjetas'; dibujar(); anunciar('Listado en formato de tarjetas.'); });
  $('#ver-tabla').addEventListener('click', () => { estado.formatoCatalogo = 'tabla'; dibujar(); anunciar('Listado en formato de tabla.'); });
  dibujar();
}

/** Mismo listado en formato tabla (CU-01): columnas, stock con color de alerta y acciones. */
function tablaProductos(lista) {
  const cab = ['Producto', 'Rubro', 'Unidad', 'Precio', 'Stock', 'Acciones'];
  const filas = lista.map(p => {
    const nivel = { ok: ['Disponible', 'etiqueta-ok'], bajo: ['Stock bajo', 'etiqueta-bajo'], agotado: ['Sin stock', 'etiqueta-agotado'] }[p.nivel_stock];
    return el('tr', {},
      el('th', { attrs: { scope: 'row' } }, el('span', { texto: p.emoji, attrs: { 'aria-hidden': 'true' } }), ` ${p.nombre}`),
      el('td', { texto: p.categoria }),
      el('td', { texto: p.unidad }),
      el('td', { clase: 'num', texto: dinero.format(p.precio) }),
      el('td', {}, el('span', { clase: `etiqueta ${nivel[1]}`, texto: `${nivel[0]} (${p.stock})` })),
      el('td', {}, el('div', { clase: 'acciones' }, botonAgregar(p),
        el('a', { clase: 'btn btn-borde btn-chico', attrs: { href: `#/producto/${p.id}` } }, 'Ver', el('span', { clase: 'sr-only', texto: ` detalle de ${p.nombre}` })))));
  });
  return envoltorioTabla(el('table', {},
    el('caption', { texto: 'Catálogo de productos' }),
    el('thead', {}, el('tr', {}, ...cab.map(c => el('th', { texto: c, attrs: { scope: 'col' }, clase: c === 'Precio' ? 'num' : '' })))),
    el('tbody', {}, ...filas)), 'Tabla de productos');
}

/* ---------- Ficha de producto (CU-02) ---------- */
async function vistaProducto(vigente, id) {
  montar('vista-producto', 'Producto');
  const ficha = $('#ficha');
  const r = Number.isInteger(id) ? await pedirApi(`productos.php?id=${id}`) : { ok: false, estado: 404, datos: {} };
  if (!vigente()) return;
  ocupado(ficha, false);
  if (!r.ok) {
    ficha.replaceChildren(el('h1', { texto: 'Producto no encontrado', attrs: { id: 't-producto', 'data-foco': '' } }));
    document.title = 'Producto no encontrado — Mercado Fresco';
    return;
  }
  const p = r.datos;
  registrarProductos([p]);
  document.title = `${p.nombre} — Mercado Fresco`;
  ficha.replaceChildren(
    el('div', { clase: 'emoji-grande', texto: p.emoji, attrs: { 'aria-hidden': 'true' } }),
    el('div', {},
      el('h1', { texto: p.nombre, attrs: { id: 't-producto', 'data-foco': '' } }),
      el('p', { texto: `Rubro: ${p.categoria}` }),
      el('p', { clase: 'precio' }, dinero.format(p.precio), el('small', { texto: ` / ${p.unidad}` })),
      etiquetasProducto(p),
      el('p', { texto: `Stock: ${p.stock} ${p.unidad}` }),
      el('div', { clase: 'acciones' }, botonAgregar(p), el('a', { clase: 'btn btn-borde', attrs: { href: '#/carrito' } }, 'Ir a mi pedido'))));
  const h1 = $('[data-foco]', ficha);
  h1.setAttribute('tabindex', '-1');
  h1.focus({ preventScroll: true });
}

/* ---------- Carrito (estado local) ---------- */
function agregarAlCarrito(id, delta = 1) {
  const p = estado.productos.get(id);
  if (!p) return;
  const actual = estado.carrito.get(id) || 0;
  const nueva = actual + delta;
  if (nueva > p.stock) { anunciar(`Sólo hay ${p.stock} ${p.unidad} de ${p.nombre} en stock.`, 'error'); return; }
  if (nueva <= 0) estado.carrito.delete(id); else estado.carrito.set(id, nueva);
  guardarCarrito();
  renderMenu();
  if (delta > 0) anunciar(`${p.nombre} agregado al pedido. Tenés ${cantidadCarrito()} ${cantidadCarrito() === 1 ? 'producto' : 'productos'}.`);
}

function totalesCarrito() {
  let subtotal = 0;
  for (const [id, c] of estado.carrito) subtotal += (estado.productos.get(id)?.precio ?? 0) * c;
  const descuento = Math.round(subtotal * (CUPONES[estado.cupon] ?? 0) * 100) / 100;
  return { subtotal, descuento, total: subtotal - descuento + (subtotal > 0 ? ENVIO : 0) };
}

/* ---------- Armar pedido y confirmar compra (CU-03 / CU-04) ---------- */
async function vistaCarrito(vigente) {
  montar('vista-carrito', 'Finalizar compra');
  // Si se recargó la página, el mapa de productos está vacío: se completa desde la API.
  if ([...estado.carrito.keys()].some(id => !estado.productos.has(id))) {
    const r = await pedirApi('productos.php');
    if (!vigente()) return;
    if (r.ok) registrarProductos(r.datos);
  }
  // Se descartan del carrito productos que ya no existen
  for (const id of [...estado.carrito.keys()]) if (!estado.productos.has(id)) estado.carrito.delete(id);

  const aviso = $('#carrito-sesion');
  const formulario = $('#form-pedido');
  const dibujarSesion = () => {
    aviso.replaceChildren(estado.sesion.autenticado ? el('p', { clase: 'sub', texto: `Comprás como ${estado.sesion.usuario.nombre}.` })
      : el('p', { clase: 'error-form' }, 'Para confirmar el pedido necesitás ', el('a', { attrs: { href: '#/cuenta' } }, 'iniciar sesión o crear una cuenta'), '. Tu carrito se conserva.'));
  };
  dibujarSesion();
  if (estado.sesion.autenticado) { $('#p-nombre').value = estado.sesion.usuario.nombre; $('#p-email').value = estado.sesion.usuario.email ?? ''; }

  const dibujarLista = (enfocar) => {
    const lista = $('#carrito-lista');
    const vacio = $('#carrito-vacio');
    lista.replaceChildren(...[...estado.carrito].map(([id, cant]) => {
      const p = estado.productos.get(id);
      const menos = el('button', { texto: '−', attrs: { type: 'button', 'aria-label': `Quitar una unidad de ${p.nombre}`, 'data-id': id, 'data-accion': 'menos' } });
      const mas = el('button', { texto: '+', attrs: { type: 'button', 'aria-label': `Agregar una unidad de ${p.nombre}`, 'data-id': id, 'data-accion': 'mas' } });
      const quitar = el('button', { clase: 'btn btn-borde btn-chico', attrs: { type: 'button', 'data-id': id, 'data-accion': 'quitar' } }, 'Quitar', el('span', { clase: 'sr-only', texto: ` ${p.nombre}` }));
      menos.addEventListener('click', () => { agregarAlCarrito(id, -1); dibujarLista(`[data-id="${id}"][data-accion="menos"]`); });
      mas.addEventListener('click', () => { agregarAlCarrito(id, 1); dibujarLista(`[data-id="${id}"][data-accion="mas"]`); });
      quitar.addEventListener('click', () => { estado.carrito.delete(id); guardarCarrito(); renderMenu(); anunciar(`${p.nombre} quitado del pedido.`); dibujarLista('#t-resumen'); });
      return el('li', {},
        el('div', {}, el('span', { clase: 'nombre', texto: p.nombre }), el('br'),
          el('span', { clase: 'sub', texto: `${dinero.format(p.precio)} / ${p.unidad}` }),
          el('div', { clase: 'cantidad' }, menos, el('output', { texto: String(cant), attrs: { 'aria-label': `Cantidad de ${p.nombre}` } }), mas)),
        el('div', {}, el('strong', { texto: dinero.format(p.precio * cant) }), el('br'), quitar));
    }));
    vacio.hidden = estado.carrito.size > 0;
    const t = totalesCarrito();
    $('#t-subtotal').textContent = dinero.format(t.subtotal);
    $('#fila-descuento').hidden = t.descuento === 0;
    $('#t-descuento').textContent = `-${dinero.format(t.descuento)}`;
    $('#t-envio').textContent = dinero.format(estado.carrito.size ? ENVIO : 0);
    $('#t-total').textContent = dinero.format(t.total);
    if (enfocar) $(enfocar)?.focus();
  };
  dibujarLista();

  $('#form-cupon').addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = $('#p-cupon').value.trim().toUpperCase();
    if (codigo && !(codigo in CUPONES)) { estado.cupon = null; dibujarLista(); anunciar('El código de descuento no es válido.', 'error'); return; }
    estado.cupon = codigo || null;
    dibujarLista();
    anunciar(codigo ? 'Descuento del 10% aplicado.' : 'Descuento quitado.');
  });

  const validar = (campo, mensaje, condicion) => {
    const input = $(`#p-${campo}`);
    const msg = $(`#e-p-${campo}`);
    const mal = !condicion(input.value.trim());
    msg.textContent = mal ? mensaje : '';
    input.setAttribute('aria-invalid', mal ? 'true' : 'false');
    return mal ? input : null;
  };

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorForm = $('#error-pedido');
    errorForm.textContent = '';
    const invalidos = [
      validar('nombre', 'Ingresá tu nombre y apellido.', v => v.length > 1),
      validar('direccion', 'Ingresá la dirección de entrega.', v => v.length > 4),
      validar('telefono', 'Ingresá un teléfono válido (6 a 25 dígitos).', v => /^[0-9 ()+-]{6,25}$/.test(v)),
      validar('email', 'Ingresá un e-mail con formato válido (usuario@dominio.com).', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),
    ].filter(Boolean);
    if (invalidos.length) { invalidos[0].focus(); anunciar('Revisá los datos marcados en el formulario.', 'error'); return; }
    if (estado.carrito.size === 0) { errorForm.textContent = 'Tu pedido está vacío: agregá al menos un producto.'; return; }
    if (!estado.sesion.autenticado) { errorForm.textContent = 'Iniciá sesión para confirmar el pedido.'; return; }

    const boton = $('button[type="submit"]', formulario);
    boton.disabled = true;
    const datos = Object.fromEntries(new FormData(formulario));
    const r = await pedirApi('pedidos.php', { metodo: 'POST', datos: {
      nombre: datos.nombre, direccion: datos.direccion, telefono: datos.telefono, email: datos.email, pago: datos.pago, notas: datos.notas,
      cupon: estado.cupon, items: [...estado.carrito].map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
    } });
    boton.disabled = false;
    if (r.ok) {
      estado.ultimoPedido = r.datos;
      estado.carrito.clear(); estado.cupon = null; guardarCarrito();
      const lista = await pedirApi('productos.php'); if (lista.ok) registrarProductos(lista.datos);
      navegar('#/confirmado');
      return;
    }
    if (r.estado === 401) { await consultarSesion(); dibujarSesion(); }
    if (r.estado === 409) { const lista = await pedirApi('productos.php'); if (lista.ok) registrarProductos(lista.datos); }
    errorForm.textContent = r.datos.error;
    anunciar(r.datos.error, 'error');
  });
}

function vistaConfirmacion() {
  if (!estado.ultimoPedido) { navegar('#/'); return; }
  montar('vista-confirmacion', 'Pedido confirmado');
  const p = estado.ultimoPedido;
  $('#confirmacion-texto').textContent = `Gracias por tu compra. Pedido N.º ${p.id} por ${dinero.format(p.total)} (envío incluido). Te contactaremos para coordinar la entrega.`;
  renderMenu();
}

/* ---------- Cuenta (CU-05 / CU-06) ---------- */
function tablaPedidos(contenedor, pedidos, titulo, conCliente) {
  if (!pedidos.length) { contenedor.replaceChildren(mensajeVacio('Todavía no hay pedidos.')); return; }
  const cabecera = ['N.º', ...(conCliente ? ['Cliente'] : []), 'Fecha', 'Pago', 'Total', 'Estado'];
  const tabla = el('table', {},
    el('caption', { texto: titulo }),
    el('thead', {}, el('tr', {}, ...cabecera.map(c => el('th', { texto: c, attrs: { scope: 'col' }, clase: c === 'Total' ? 'num' : '' })))),
    el('tbody', {}, ...pedidos.map(p => el('tr', {},
      el('th', { texto: String(p.id), attrs: { scope: 'row' } }),
      ...(conCliente ? [el('td', { texto: p.nombre })] : []),
      el('td', { texto: p.creado_en.slice(0, 16) }),
      el('td', { texto: p.pago }),
      el('td', { clase: 'num', texto: dinero.format(p.total) }),
      el('td', { texto: p.estado })))));
  contenedor.replaceChildren(envoltorioTabla(tabla, titulo));
}

async function vistaCuenta(vigente) {
  montar('vista-cuenta', 'Mi cuenta');
  const invitado = $('#cuenta-invitado');
  const panel = $('#cuenta-panel');

  if (!estado.sesion.autenticado) {
    invitado.hidden = false;
    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#error-login');
      err.textContent = '';
      const d = Object.fromEntries(new FormData(e.target));
      if (!d.email.trim() || !d.password) { err.textContent = 'Ingresá tu e-mail y tu contraseña.'; $('#l-email').focus(); return; }
      await iniciarSesion(d.email.trim(), d.password, err);
    });
    $('#form-registro').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#error-registro');
      err.textContent = '';
      const d = Object.fromEntries(new FormData(e.target));
      const r = await pedirApi('registro.php', { metodo: 'POST', datos: { nombre: d.nombre, email: d.email, password: d.password } });
      if (!r.ok) { err.textContent = r.datos.error; return; }
      await iniciarSesion(d.email.trim(), d.password, err);
    });
    return;
  }

  panel.hidden = false;
  $('#cuenta-saludo').textContent = `Hola, ${estado.sesion.usuario.nombre}. Tu perfil es: ${estado.sesion.usuario.rol}.`;
  const acciones = $('#cuenta-acciones');
  if (esEmpleado()) acciones.append(el('a', { clase: 'btn btn-mostaza', attrs: { href: '#/admin' } }, 'Gestionar productos'));
  const salir = el('button', { clase: 'btn btn-borde', texto: 'Cerrar sesión', attrs: { type: 'button' } });
  salir.addEventListener('click', cerrarSesion);
  acciones.append(salir);

  const cont = $('#mis-pedidos');
  const r = await pedirApi('pedidos.php');
  if (!vigente()) return;
  ocupado(cont, false);
  if (r.estado === 401) { await consultarSesion(); return rutear(); }
  if (!r.ok) { cont.replaceChildren(mensajeVacio(r.datos.error)); return; }
  tablaPedidos(cont, r.datos, esEmpleado() ? 'Pedidos de todos los clientes' : 'Mis pedidos', esEmpleado());
}

async function iniciarSesion(email, password, nodoError) {
  const r = await pedirApi('login.php', { metodo: 'POST', datos: { email, password } });
  if (!r.ok) { nodoError.textContent = r.datos.error; return; }
  estado.sesion = { autenticado: true, usuario: r.datos.usuario };
  renderMenu();
  navegar(estado.carrito.size ? '#/carrito' : '#/cuenta');
  anunciar(`Sesión iniciada. Hola, ${r.datos.usuario.nombre}.`);
}

/* ---------- Gestión de productos (CU-07, sólo personal) ---------- */
async function vistaAdmin(vigente) {
  if (!estado.sesion.autenticado) { navegar('#/cuenta'); anunciar('Iniciá sesión con una cuenta de personal para gestionar productos.', 'error'); return; }
  if (!esEmpleado()) { navegar('#/'); anunciar('Esa sección es sólo para el personal del local.', 'error'); return; }
  montar('vista-admin', 'Gestión de productos');

  const form = $('#form-producto');
  const selectRubro = $('#a-categoria');
  const tablaCont = $('#tabla-productos');
  const error = $('#error-producto');
  let editando = null;

  const rc = await pedirApi('categorias.php');
  if (!vigente()) return;
  if (rc.ok) selectRubro.replaceChildren(...rc.datos.map(c => el('option', { texto: c.nombre, attrs: { value: c.id } })));

  const resetForm = () => {
    editando = null;
    form.reset();
    $('#a-minimo').value = '5';
    $('#t-form-producto').textContent = 'Nuevo producto';
    $('#btn-guardar').textContent = 'Guardar producto';
    $('#btn-cancelar').hidden = true;
    error.textContent = '';
  };

  async function cargarTablas() {
    ocupado(tablaCont, true);
    const [rp, rped] = await Promise.all([pedirApi('productos.php'), pedirApi('pedidos.php')]);
    if (!vigente()) return;
    ocupado(tablaCont, false); ocupado($('#admin-pedidos'), false);
    if (rp.ok) { registrarProductos(rp.datos); dibujarTabla(rp.datos); } else tablaCont.replaceChildren(mensajeVacio(rp.datos.error));
    if (rped.ok) tablaPedidos($('#admin-pedidos'), rped.datos, 'Últimos pedidos', true); else $('#admin-pedidos').replaceChildren(mensajeVacio(rped.datos.error));
  }

  function dibujarTabla(lista) {
    const filas = lista.map(p => {
      const editar = el('button', { clase: 'btn btn-borde btn-chico', attrs: { type: 'button' } }, 'Editar', el('span', { clase: 'sr-only', texto: ` ${p.nombre}` }));
      const eliminar = el('button', { clase: 'btn btn-borde btn-chico', attrs: { type: 'button' } }, 'Eliminar', el('span', { clase: 'sr-only', texto: ` ${p.nombre}` }));
      const celda = el('td', {}, el('div', { clase: 'acciones' }, editar, eliminar));

      editar.addEventListener('click', () => {
        editando = p.id;
        $('#a-nombre').value = p.nombre; selectRubro.value = String(p.categoria_id); $('#a-precio').value = p.precio;
        $('#a-unidad').value = p.unidad; $('#a-emoji').value = p.emoji; $('#a-stock').value = p.stock;
        $('#a-minimo').value = p.stock_minimo; $('#a-oferta').checked = p.oferta;
        $('#t-form-producto').textContent = `Editar producto: ${p.nombre}`;
        $('#btn-guardar').textContent = 'Guardar cambios';
        $('#btn-cancelar').hidden = false;
        error.textContent = '';
        $('#a-nombre').focus();
        form.scrollIntoView({ block: 'center' });
      });

      // Eliminar en dos pasos con botones nativos (sin ventanas emergentes del navegador)
      eliminar.addEventListener('click', () => {
        const si = el('button', { clase: 'btn btn-peligro btn-chico', attrs: { type: 'button' } }, 'Confirmar eliminación', el('span', { clase: 'sr-only', texto: ` de ${p.nombre}` }));
        const no = el('button', { clase: 'btn btn-borde btn-chico', texto: 'Cancelar', attrs: { type: 'button' } });
        celda.replaceChildren(el('div', { clase: 'acciones' }, si, no));
        no.focus();
        no.addEventListener('click', () => { celda.replaceChildren(el('div', { clase: 'acciones' }, editar, eliminar)); eliminar.focus(); });
        si.addEventListener('click', async () => {
          const r = await pedirApi(`productos.php?id=${p.id}`, { metodo: 'DELETE' });
          if (!r.ok) { anunciar(r.datos.error, 'error'); return; }
          estado.productos.delete(p.id); estado.carrito.delete(p.id); guardarCarrito(); renderMenu();
          await cargarTablas();
          $('#t-inventario').focus();
          anunciar(`Producto eliminado: ${p.nombre}.`);
        });
      });

      return el('tr', {},
        el('th', { attrs: { scope: 'row' } }, el('span', { texto: p.emoji, attrs: { 'aria-hidden': 'true' } }), ` ${p.nombre}`),
        el('td', { texto: p.categoria }),
        el('td', { clase: 'num', texto: dinero.format(p.precio) }),
        el('td', { clase: 'num', texto: `${p.stock} ${p.unidad}` }),
        el('td', { texto: { ok: 'Normal', bajo: 'Stock bajo', agotado: 'Agotado' }[p.nivel_stock] + (p.oferta ? ' · Oferta' : '') }),
        celda);
    });
    tablaCont.replaceChildren(envoltorioTabla(el('table', {},
      el('caption', { texto: `${lista.length} productos activos` }),
      el('thead', {}, el('tr', {}, ...['Producto', 'Rubro', 'Precio', 'Stock', 'Estado', 'Acciones'].map(c => el('th', { texto: c, attrs: { scope: 'col' }, clase: c === 'Precio' || c === 'Stock' ? 'num' : '' })))),
      el('tbody', {}, ...filas)), 'Inventario de productos'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const d = Object.fromEntries(new FormData(form));
    const cuerpo = { nombre: d.nombre, categoria_id: Number(d.categoria_id), precio: Number(d.precio), unidad: d.unidad,
      emoji: d.emoji, oferta: $('#a-oferta').checked, stock: Number(d.stock), stock_minimo: Number(d.stock_minimo) };
    const r = editando
      ? await pedirApi(`productos.php?id=${editando}`, { metodo: 'PUT', datos: cuerpo })
      : await pedirApi('productos.php', { metodo: 'POST', datos: cuerpo });
    if (!r.ok) {
      error.textContent = r.datos.error;
      if (r.estado === 401 || r.estado === 403) { await consultarSesion(); rutear(); }
      return;
    }
    const nombre = r.datos.nombre;
    const eraEdicion = editando !== null;
    resetForm();
    await cargarTablas();
    anunciar(eraEdicion ? `Producto actualizado: ${nombre}.` : `Producto creado: ${nombre}.`);
    $('#a-nombre').focus();
  });
  $('#btn-cancelar').addEventListener('click', () => { resetForm(); $('#a-nombre').focus(); });

  await cargarTablas();
}

/* ======================================================================
   6. Arranque
   ====================================================================== */
async function iniciar() {
  recuperarCarrito();
  window.addEventListener('hashchange', rutear);
  // El enlace «Saltar al contenido» no debe cambiar la ruta del hash: sólo mueve el foco a <main>.
  $('.saltar-contenido').addEventListener('click', (e) => {
    e.preventDefault();
    contenido.focus();
  });
  await consultarSesion();
  rutear();
}
iniciar();
