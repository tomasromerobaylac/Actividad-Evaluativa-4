// Pruebas de la API REST (Node 18+). Uso:  node tests/test_api.mjs [http://localhost/mercado-fresco/api]
// Requiere la base importada (sql/mercado_fresco.sql). Deja datos de prueba mínimos.
const BASE = process.argv[2] || 'http://localhost:8099/api';
let ok = 0, fallos = 0;

function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✔ ${nombre}`); }
  else { fallos++; console.log(`  ✘ ${nombre} ${detalle}`); }
}

class Cliente {
  cookie = '';
  async pedir(ruta, { metodo = 'GET', datos, crudo } = {}) {
    const r = await fetch(`${BASE}/${ruta}`, {
      method: metodo,
      headers: { ...(datos || crudo ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: crudo ?? (datos ? JSON.stringify(datos) : undefined),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch {}
    return { estado: r.status, json, cabeceras: r.headers, texto, setCookie: sc };
  }
}

const anon = new Cliente(), cliente = new Cliente(), empleado = new Cliente();
const email = `prueba${Date.now()}@correo.com`;
const entrega = { nombre: 'Ana Prueba', direccion: 'San Martín 100', telefono: '3764-123456', email: 'ana@correo.com', pago: 'efectivo' };

console.log('\n[1] Catálogo público (CU-01 / CU-02)');
let r = await anon.pedir('productos.php');
check('GET productos → 200 y lista JSON', r.estado === 200 && Array.isArray(r.json) && r.json.length >= 16);
check('Content-Type application/json; charset=utf-8', /application\/json; charset=utf-8/i.test(r.cabeceras.get('content-type')));
r = await anon.pedir('productos.php?categoria=lacteos');
check('Filtro por categoría', r.json.length === 3 && r.json.every(p => p.categoria_slug === 'lacteos'));
r = await anon.pedir('productos.php?oferta=1');
check('Filtro ofertas', r.json.length >= 1 && r.json.every(p => p.oferta === true));
r = await anon.pedir('categorias.php');
check('GET categorias → 200 con 8 rubros', r.estado === 200 && r.json.length === 8);
r = await anon.pedir('productos.php?id=1');
check('GET ficha de producto → 200', r.estado === 200 && r.json.id === 1);
r = await anon.pedir('productos.php?id=99999');
check('Producto inexistente → 404', r.estado === 404);
r = await anon.pedir('productos.php?id=abc');
check('id inválido → 400', r.estado === 400);
r = await anon.pedir('productos.php?categoria=' + encodeURIComponent("' OR '1'='1"));
check('Inyección SQL en ?categoria → lista vacía (consulta preparada)', r.estado === 200 && r.json.length === 0);

console.log('\n[2] Registro y autenticación (CU-05 / CU-06)');
r = await anon.pedir('registro.php', { metodo: 'POST', datos: { nombre: '', email: 'x', password: '1' } });
check('Registro con datos inválidos → 400', r.estado === 400);
r = await anon.pedir('registro.php', { metodo: 'POST', crudo: '{no es json' });
check('Registro con JSON roto → 400', r.estado === 400);
r = await anon.pedir('registro.php', { metodo: 'POST', datos: { nombre: '<img src=x onerror=alert(1)>', email, password: 'ClaveSegura1', rol: 'empleado' } });
check('Registro válido → 201', r.estado === 201 && r.json.id > 0);
r = await anon.pedir('registro.php', { metodo: 'POST', datos: { nombre: 'Otra', email, password: 'ClaveSegura1' } });
check('E-mail repetido → 409', r.estado === 409);
r = await anon.pedir('registro.php');
check('GET en registro → 405 con cabecera Allow', r.estado === 405 && r.cabeceras.get('allow') === 'POST');
r = await anon.pedir('login.php', { metodo: 'POST', datos: { email, password: 'incorrecta' } });
check('Clave incorrecta → 401', r.estado === 401);
r = await anon.pedir('login.php', { metodo: 'POST', datos: { email: "' OR '1'='1' -- ", password: 'x' } });
check("Inyección SQL en login → 401", r.estado === 401);
r = await anon.pedir('login.php', { metodo: 'POST', datos: { email } });
check('Login sin contraseña → 400', r.estado === 400);

// Fijación de sesión: se parte de una sesión anónima previa y se verifica que el id cambie
r = await cliente.pedir('sesion.php');
check('sesion.php anónima → 200 autenticado:false', r.estado === 200 && r.json.autenticado === false);
r = await cliente.pedir('login.php', { metodo: 'POST', datos: { email, password: 'ClaveSegura1' } });
check('Login correcto → 200 y rol cliente (el rol enviado en el registro se ignoró)', r.estado === 200 && r.json.usuario.rol === 'cliente');
check('Cookie de sesión HttpOnly + SameSite=Lax', /HttpOnly/i.test(r.setCookie || '') && /SameSite=Lax/i.test(r.setCookie || ''));
r = await cliente.pedir('sesion.php');
check('sesion.php con cookie → autenticado:true', r.json.autenticado === true && r.json.usuario.nombre.includes('<img'));
{ // con un id de sesión inventado por el atacante el servidor NO debe aceptarlo (use_strict_mode + regenerate)
  const atacante = new Cliente(); atacante.cookie = 'PHPSESSID=idfijadoporelatacante123456789';
  const l = await atacante.pedir('login.php', { metodo: 'POST', datos: { email, password: 'ClaveSegura1' } });
  check('Fijación de sesión: el id fijado no se reutiliza tras el login', !/idfijadoporelatacante/.test(l.setCookie || atacante.cookie));
}

console.log('\n[3] Control de acceso (OWASP A01)');
r = await anon.pedir('productos.php', { metodo: 'POST', datos: { nombre: 'X' } });
check('Anónimo crea producto → 401', r.estado === 401);
r = await anon.pedir('productos.php?id=1', { metodo: 'DELETE' });
check('Anónimo elimina producto → 401', r.estado === 401);
r = await anon.pedir('pedidos.php');
check('Anónimo consulta pedidos → 401', r.estado === 401);
const prodOk = { nombre: 'Producto de prueba', categoria_id: 1, precio: 100, unidad: 'kg', emoji: '🧪', oferta: false, stock: 10, stock_minimo: 2 };
r = await cliente.pedir('productos.php', { metodo: 'POST', datos: prodOk });
check('Cliente crea producto → 403', r.estado === 403);

console.log('\n[4] CRUD de productos como empleado (CU-07)');
r = await empleado.pedir('login.php', { metodo: 'POST', datos: { email: 'empleado@mercadofresco.local', password: 'Empleado2026!' } });
check('Login empleado → 200', r.estado === 200 && r.json.usuario.rol === 'empleado');
r = await empleado.pedir('productos.php', { metodo: 'POST', datos: { ...prodOk, precio: -5 } });
check('Alta con precio negativo → 400', r.estado === 400);
r = await empleado.pedir('productos.php', { metodo: 'POST', datos: { ...prodOk, categoria_id: 999 } });
check('Alta con categoría inexistente → 400', r.estado === 400);
r = await empleado.pedir('productos.php', { metodo: 'POST', datos: prodOk });
check('Alta válida → 201', r.estado === 201 && r.json.id > 0);
const nuevoId = r.json?.id;
r = await empleado.pedir(`productos.php?id=${nuevoId}`, { metodo: 'PUT', datos: { ...prodOk, nombre: 'Producto editado', precio: 250.5, stock: 7 } });
check('Modificación → 200 con datos nuevos', r.estado === 200 && r.json.nombre === 'Producto editado' && r.json.precio === 250.5);
r = await empleado.pedir('productos.php', { metodo: 'PUT', datos: prodOk });
check('PUT sin id → 400', r.estado === 400);
r = await empleado.pedir(`productos.php?id=${nuevoId}`, { metodo: 'DELETE' });
check('Baja → 200', r.estado === 200);
r = await anon.pedir(`productos.php?id=${nuevoId}`);
check('El producto dado de baja ya no se publica (404)', r.estado === 404);
r = await empleado.pedir(`productos.php?id=${nuevoId}`, { metodo: 'DELETE' });
check('Baja repetida → 404', r.estado === 404);
r = await empleado.pedir('productos.php', { metodo: 'PATCH' });
check('Método no soportado → 405', r.estado === 405);

console.log('\n[5] Pedidos (CU-03 / CU-04)');
const antes = (await anon.pedir('productos.php?id=1')).json.stock;
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, items: [] } });
check('Pedido vacío → 400', r.estado === 400);
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, email: 'no-es-un-mail', items: [{ producto_id: 1, cantidad: 1 }] } });
check('E-mail de entrega inválido → 400', r.estado === 400);
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, pago: 'bitcoin', items: [{ producto_id: 1, cantidad: 1 }] } });
check('Medio de pago inválido → 400', r.estado === 400);
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, items: [{ producto_id: 1, cantidad: 2 }], cupon: 'NOEXISTE' } });
check('Cupón inválido → 400', r.estado === 400);
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, items: [{ producto_id: 1, cantidad: 2 }, { producto_id: 4, cantidad: 1 }], cupon: 'ucp10', total: 1 } });
const p1 = (await anon.pedir('productos.php?id=1')).json.precio, p4 = (await anon.pedir('productos.php?id=4')).json.precio;
const sub = p1 * 2 + p4, desc = Math.round(sub * 0.1 * 100) / 100;
check('Pedido válido → 201', r.estado === 201 && r.json.id > 0, JSON.stringify(r.json));
check('Total calculado en el servidor (ignora el "total" enviado) con cupón y envío', r.json?.total === sub - desc + 800, JSON.stringify(r.json));
check('El stock se descuenta', (await anon.pedir('productos.php?id=1')).json.stock === antes - 2);
const stock1 = (await anon.pedir('productos.php?id=1')).json.stock, stock4 = (await anon.pedir('productos.php?id=4')).json.stock;
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, items: [{ producto_id: 4, cantidad: 1 }, { producto_id: 1, cantidad: 99 }] } });
check('Stock insuficiente → 409', r.estado === 409);
check('Rollback: ningún stock cambió tras el pedido fallido',
  (await anon.pedir('productos.php?id=1')).json.stock === stock1 && (await anon.pedir('productos.php?id=4')).json.stock === stock4);
r = await cliente.pedir('pedidos.php', { metodo: 'POST', datos: { ...entrega, items: [{ producto_id: 99999, cantidad: 1 }] } });
check('Producto inexistente en el pedido → 400', r.estado === 400);
r = await cliente.pedir('pedidos.php');
check('Cliente ve sólo sus pedidos', r.estado === 200 && r.json.length === 1);
r = await empleado.pedir('pedidos.php');
check('Empleado ve todos los pedidos', r.estado === 200 && r.json.length >= 1);

console.log('\n[6] Almacenamiento de contraseñas (OWASP A02)');
const { execSync } = await import('node:child_process');
try {
  const h = execSync(`mysql -uroot mercado_fresco -N -e "SELECT password FROM usuarios WHERE email='${email}'"`).toString().trim();
  check('El hash guardado es BCRYPT ($2y$, 60 caracteres) y no la clave', /^\$2y\$\d\d\$/.test(h) && h.length === 60 && !h.includes('ClaveSegura1'));
} catch { console.log('  (omitido: cliente mysql no disponible)'); }

console.log('\n[7] Cierre de sesión');
r = await cliente.pedir('logout.php', { metodo: 'POST' });
check('Logout → 200', r.estado === 200);
r = await cliente.pedir('pedidos.php');
check('Tras el logout el recurso protegido responde 401', r.estado === 401);

console.log(`\nResultado: ${ok} correctas, ${fallos} con fallas.`);
process.exit(fallos ? 1 : 0);
