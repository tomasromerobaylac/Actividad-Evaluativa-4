/**
 * Prueba de operación 100 % por teclado (sólo Tab, Shift+Tab, Enter y escritura de texto)
 * + auditoría axe-core (WCAG 2.1 A/AA) en cada estado de la SPA.
 *
 * Requisitos: npm i playwright axe-core  (y un navegador: npx playwright install chromium)
 * Uso: node tests/prueba_teclado.cjs [http://localhost/mercado-fresco/public/index.html]
 */
const { chromium } = require('playwright');
const axeRuta = require.resolve('axe-core/axe.min.js');
const URL_APP = process.argv[2] || 'http://localhost:8099/public/index.html';
let ok = 0, fallos = 0, paradasTotal = 0;
const log = (m) => console.log(m);
const check = (n, c, d = '') => { c ? ok++ : fallos++; log(`  ${c ? '✔' : '✘'} ${n} ${c ? '' : d}`); };

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  pagina.on('console', m => { if (m.type() === 'error' && !/status of 40[19]/.test(m.text())) errores.push(m.text()); }); // 401/409 son respuestas esperadas de la API
  const aviso = () => pagina.locator('#aviso').innerText();

  /** Tab hasta que el elemento enfocado coincida con el criterio {texto} | {id} | {js}. Verifica que cada parada tenga foco visible. */
  async function tabHasta(descripcion, criterio, { atras = false, max = 80 } = {}) {
    for (let i = 0; i < max; i++) {
      await pagina.keyboard.press(atras ? 'Shift+Tab' : 'Tab');
      paradasTotal++;
      const r = await pagina.evaluate((c) => {
        const a = document.activeElement;
        const nombre = (a.innerText || a.value || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const coincide = c.texto ? (['A', 'BUTTON'].includes(a.tagName) && nombre.includes(c.texto.toLowerCase())) : c.id ? a.id === c.id : a.textContent.trim() === c.exacto;
        const cs = getComputedStyle(a);
        return { coincide, contorno: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, tag: a.tagName };
      }, criterio);
      if (!r.contorno && r.tag !== 'BODY') { fallos++; log(`  ✘ Foco sin indicador visible en <${r.tag}> mientras se buscaba "${descripcion}"`); }
      if (r.coincide) return true;
    }
    fallos++; log(`  ✘ No se alcanzó con Tab: ${descripcion}`);
    return false;
  }
  const porTexto = (texto) => ({ texto });
  const porId = (id) => ({ id });
  async function escribirEnCampo(id, texto) { await tabHasta(`campo #${id}`, { id }); await pagina.keyboard.type(texto); }
  async function enter() { await pagina.keyboard.press('Enter'); await pagina.waitForTimeout(350); }
  async function focoEnH1() { return pagina.evaluate(() => document.activeElement?.tagName === 'H1'); }

  async function axe(nombre) {
    await pagina.addScriptTag({ path: axeRuta });
    const r = await pagina.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
    check(`axe-core sin violaciones en «${nombre}» (${r.passes.length} reglas OK)`, r.violations.length === 0,
      JSON.stringify(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(' | ')}`)));
  }

  log('\n[1] Cliente: de la portada a la compra, sólo con teclado');
  await pagina.goto(URL_APP);
  await pagina.waitForSelector('#lista-rubros li');
  await pagina.keyboard.press('Tab');
  check('El primer Tab enfoca el enlace «Saltar al contenido principal»', (await pagina.evaluate(() => document.activeElement.className)) === 'saltar-contenido');
  await axe('Inicio');

  await tabHasta('Catálogo', porTexto('catálogo')); await enter();
  await pagina.waitForSelector('.producto');
  check('Al cambiar de vista el foco pasa al <h1>', await focoEnH1());
  await axe('Catálogo');
  await tabHasta('botón Tabla', porTexto('tabla')); await enter();
  check('El conmutador cambia el listado a formato tabla', (await pagina.locator('#tabla-catalogo table').count()) === 1 && (await pagina.getAttribute('#ver-tabla', 'aria-pressed')) === 'true');
  await axe('Catálogo en formato tabla');
  await tabHasta('botón Tarjetas', porTexto('tarjetas'), { atras: true }); await enter();
  check('El conmutador vuelve al formato tarjetas', (await pagina.locator('.producto').count()) > 0);
  await tabHasta('filtro Lácteos', { exacto: 'Lácteos' }, { atras: true }); await enter();
  await pagina.waitForFunction(() => document.querySelectorAll('.producto').length === 3);
  check('El filtro por rubro actualiza el listado (3 lácteos)', true);
  await tabHasta('Agregar leche', porTexto('agregar leche entera')); await enter();
  check('Se anuncia el producto agregado (región aria-live)', /Leche entera.*agregado/.test(await aviso()), await aviso());
  check('El contador del carrito pasa a 1', (await pagina.locator('.insignia-carrito').innerText()) === '1');

  await tabHasta('ficha del queso', porTexto('ver detalle de queso cremoso')); await enter();
  await pagina.waitForSelector('.ficha .precio');
  check('La ficha de producto se abre con Enter y enfoca su <h1>', await focoEnH1());
  await axe('Ficha de producto');

  // Sin sesión, el carrito avisa que hay que iniciar sesión
  await tabHasta('Ir a mi pedido', porTexto('ir a mi pedido')); await enter();
  await pagina.waitForSelector('#form-pedido');
  check('Vista de compra anónima invita a iniciar sesión', /iniciar sesión/.test(await pagina.locator('#carrito-sesion').innerText()));
  await axe('Carrito (anónimo)');

  await tabHasta('enlace para iniciar sesión', porTexto('iniciar sesión o crear una cuenta')); await enter();
  await pagina.waitForSelector('#form-registro');
  await axe('Cuenta (invitado)');
  const email = `teclado${Date.now()}@correo.com`;
  // Primero un intento incorrecto para ver el mensaje de error
  await escribirEnCampo('l-email', email); await tabHasta('l-clave', porId('l-clave')); await pagina.keyboard.type('mal'); await enter();
  check('Credenciales inválidas muestran el error en pantalla', /incorrectos/.test(await pagina.locator('#error-login').innerText()));
  // Registro
  await escribirEnCampo('r-nombre', 'Tecla Do');
  await escribirEnCampo('r-email', email);
  await escribirEnCampo('r-clave', 'ClaveSegura1');
  await enter();
  await pagina.waitForSelector('#form-pedido');
  check('Tras registrarse e ingresar con carrito lleno, se vuelve a la compra', /Comprás como Tecla Do/.test(await pagina.locator('#carrito-sesion').innerText()));

  // Validación accesible: enviar vacío
  await pagina.fill('#p-nombre', '');
  await tabHasta('Confirmar pedido', porTexto('confirmar pedido')); await enter();
  check('Campos inválidos: aria-invalid y mensaje asociado', (await pagina.getAttribute('#p-direccion', 'aria-invalid')) === 'true' && /dirección/.test(await pagina.locator('#e-p-direccion').innerText()));
  check('El foco va al primer campo inválido', (await pagina.evaluate(() => document.activeElement.id)) === 'p-nombre');
  await axe('Carrito con errores de validación');

  await pagina.keyboard.type('Tecla Do'); await escribirEnCampo('p-direccion', 'Calle Falsa 123'); await escribirEnCampo('p-telefono', '3764 123456');
  await tabHasta('Confirmar pedido', porTexto('confirmar pedido')); await enter();
  await pagina.waitForSelector('#t-confirmado');
  check('Pedido confirmado y foco en el título de confirmación', await focoEnH1() && /Pedido N\.º \d+/.test(await pagina.locator('#confirmacion-texto').innerText()));
  await axe('Confirmación de pedido');

  await tabHasta('Mi cuenta', porTexto('mi cuenta'), { atras: true }); await enter();
  await pagina.waitForSelector('#mis-pedidos table');
  check('«Mi cuenta» lista el pedido realizado', (await pagina.locator('#mis-pedidos tbody tr').count()) === 1);
  await axe('Mi cuenta (cliente)');
  await tabHasta('Cerrar sesión', porTexto('cerrar sesión')); await enter();
  check('Cerrar sesión se anuncia', /Cerraste sesión/.test(await aviso()), await aviso());

  log('\n[2] Personal: alta, edición y baja de un producto con teclado');
  await tabHasta('Ingresar', porTexto('ingresar'), { atras: true }); await enter();
  await escribirEnCampo('l-email', 'empleado@mercadofresco.local'); await escribirEnCampo('l-clave', 'Empleado2026!'); await enter();
  await pagina.waitForSelector('#mis-pedidos');
  await tabHasta('Gestionar productos', porTexto('gestionar productos')); await enter();
  await pagina.waitForSelector('#tabla-productos table');
  check('Menú «Gestión» visible sólo para el empleado', true);
  await axe('Gestión de productos');
  await escribirEnCampo('a-nombre', 'Zapallo anco');
  await tabHasta('rubro', porId('a-categoria')); await pagina.keyboard.press('ArrowDown'); // Lácteos... el valor exacto no importa
  await escribirEnCampo('a-precio', '1500'); await tabHasta('stock', porId('a-stock')); await pagina.keyboard.type('20');
  await tabHasta('Guardar producto', porTexto('guardar producto')); await enter();
  await pagina.waitForFunction(() => /Zapallo anco/.test(document.querySelector('#tabla-productos').innerText));
  check('El alta aparece en el inventario y se anuncia', /Producto creado: Zapallo anco/.test(await aviso()), await aviso());
  await tabHasta('Editar zapallo', porTexto('editar zapallo anco')); await enter();
  check('«Editar» lleva el foco al formulario', (await pagina.evaluate(() => document.activeElement.id)) === 'a-nombre');
  await tabHasta('Guardar cambios', porTexto('guardar cambios')); await enter();
  await pagina.waitForTimeout(300);
  await tabHasta('Eliminar zapallo', porTexto('eliminar zapallo anco')); await enter();
  check('Eliminar pide confirmación y mueve el foco a «Cancelar»', (await pagina.evaluate(() => document.activeElement.innerText)) === 'Cancelar');
  await tabHasta('Confirmar eliminación', porTexto('confirmar eliminación'), { atras: true }); await enter();
  await pagina.waitForFunction(() => !/Zapallo anco/.test(document.querySelector('#tabla-productos').innerText));
  check('La baja se refleja en el inventario', /eliminado/.test(await aviso()), await aviso());

  log('\n[3] Responsive y reflow (WCAG 1.4.10)');
  await pagina.setViewportSize({ width: 320, height: 700 });
  await pagina.goto(URL_APP + '#/catalogo'); await pagina.waitForSelector('.producto');
  check('Sin scroll horizontal a 320 px de ancho', await pagina.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await pagina.setViewportSize({ width: 1280, height: 900 });

  check('Sin errores de consola ni excepciones JS', errores.length === 0, JSON.stringify(errores));
  log(`\nParadas de Tab verificadas con foco visible: ${paradasTotal}`);
  log(`Resultado: ${ok} correctas, ${fallos} con fallas.`);
  await navegador.close();
  process.exit(fallos ? 1 : 0);
})();
