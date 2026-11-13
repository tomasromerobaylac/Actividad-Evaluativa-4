# Mercado Fresco

Trabajo integrador final (AE4) de la asignatura Paradigmas y Lenguajes de Programación III, carrera Ingeniería en Sistemas de Información, Universidad de la Cuenca del Plata. Comisión A, Grupo D, año lectivo 2026.

Integrantes: Acosta, Leandro; Romero Baylac, Santiago; Romero Baylac, Tomás.

## Descripción

Mercado Fresco es una tienda en línea para un almacén de barrio. El cliente consulta el catálogo por rubro (en formato de tarjetas o de tabla), revisa la ficha de cada producto, arma su pedido y lo confirma con sus datos de entrega. El personal del local, con una cuenta de rol "empleado", da de alta, modifica y da de baja productos y consulta los pedidos recibidos.

El proyecto es la evolución de la maqueta estática desarrollada en la AE1. Las pantallas de aquella maqueta se convirtieron en una aplicación de una sola página (SPA) escrita en JavaScript sin librerías, que se comunica con un servidor PHP y una base de datos MySQL mediante una API REST que intercambia JSON.

Los casos de uso son los definidos en la AE1 (CU-01 a CU-04: consultar el catálogo, ver la ficha de un producto, armar el pedido y confirmar la compra), más tres incorporados en las etapas posteriores: CU-05 registrarse, CU-06 iniciar y cerrar sesión y CU-07 gestionar productos e inventario.

## Arquitectura

Se aplicó el patrón Modelo-Vista-Controlador de forma desacoplada: la vista (cliente) y el servidor sólo se comunican por peticiones HTTP asíncronas con intercambio de JSON.

```
mercado-fresco/
├── config/
│   └── conexion.php          Conexión PDO a MySQL (patrón Singleton)
├── models/                   Modelo: acceso a datos con PDO y consultas preparadas
│   ├── UsuarioModel.php
│   ├── CategoriaModel.php
│   ├── ProductoModel.php
│   └── PedidoModel.php
├── api/                      Controlador: endpoints REST con respuesta JSON
│   ├── lib/
│   │   ├── respuesta.php     Cabeceras, códigos HTTP, lectura de JSON y sesión
│   │   └── auth.php          Control de acceso (401 y 403)
│   ├── registro.php
│   ├── login.php
│   ├── logout.php
│   ├── sesion.php
│   ├── categorias.php
│   ├── productos.php
│   └── pedidos.php
├── public/                   Vista: aplicación de una sola página
│   ├── index.html
│   ├── css/estilos.css
│   ├── js/app.js
│   └── img/icono.svg
├── sql/
│   └── mercado_fresco.sql    Esquema de la base de datos y datos iniciales
├── tests/                    Pruebas automáticas (opcionales)
└── README.md
```

Cada capa tiene una responsabilidad. El modelo sólo contiene consultas SQL y no conoce HTTP ni sesiones. El controlador valida la petición (método, datos, sesión y rol), invoca al modelo y responde JSON con el código de estado correspondiente. La vista no contiene PHP ni SQL y se limita a mostrar los datos que recibe de la API.

## Requisitos

- XAMPP con PHP 8.1 o superior (Apache y MySQL/MariaDB).
- Un navegador actual (se probó con Chrome).

## Instalación en XAMPP

1. Clonar el repositorio dentro de la carpeta `htdocs` de XAMPP con el nombre `mercado-fresco`:

   ```
   git clone https://github.com/tomasromerobaylac/Actividad-Evaluativa-4.git C:\xampp\htdocs\mercado-fresco
   ```

   También puede descargarse el ZIP y descomprimirlo en esa misma ruta. La carpeta resultante debe contener `api`, `config`, `models`, `public` y `sql`.

2. Abrir el Panel de Control de XAMPP e iniciar los módulos Apache y MySQL.

3. Crear la base de datos. Ingresar a `http://localhost/phpmyadmin`, elegir la pestaña "Importar", seleccionar el archivo `sql/mercado_fresco.sql` y presionar "Importar". El script crea la base `mercado_fresco`, las tablas y los datos iniciales (8 rubros, 16 productos y una cuenta de personal).

   Alternativa por consola:

   ```
   C:\xampp\mysql\bin\mysql -u root --default-character-set=utf8mb4 < sql\mercado_fresco.sql
   ```

4. Abrir el sitio en `http://localhost/mercado-fresco/public/`.

La conexión usa por defecto el servidor `localhost`, la base `mercado_fresco`, el usuario `root` y contraseña vacía, que son los valores de una instalación nueva de XAMPP. Si la configuración es distinta, pueden definirse las variables de entorno `DB_HOST`, `DB_NAME`, `DB_USER` y `DB_PASS`, o modificarse los valores por defecto en `config/conexion.php`.

### Uso

- Cliente: desde "Ingresar" se crea una cuenta; luego se agregan productos al carrito y se confirma el pedido. El código de descuento de ejemplo es `UCP10`.
- Personal del local: ingresar con `empleado@mercadofresco.local` y la contraseña `Empleado2026!`, y acceder a "Gestión". Es una cuenta de demostración que debería reemplazarse en un uso real.

### Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| El catálogo muestra "Ocurrió un error interno" | La base de datos no fue importada o MySQL está detenido. Repetir los pasos 2 y 3. El detalle del error queda en `C:\xampp\apache\logs\error.log`. |
| Los acentos se ven incorrectos | La importación no usó utf8mb4. Importar con phpMyAdmin o con la opción `--default-character-set=utf8mb4`. |
| Apache no inicia | Otro programa ocupa el puerto 80. Cerrarlo o cambiar el puerto en `httpd.conf`. |

## API REST

Todas las respuestas tienen `Content-Type: application/json; charset=utf-8` y un código de estado HTTP. Los errores devuelven un objeto `{"error": "mensaje"}`. El detalle de los parámetros de entrada y salida se encuentra en el informe técnico.

| Método | URL | Acceso | Caso de uso | Códigos |
|---|---|---|---|---|
| GET | `api/categorias.php` | público | CU-01 | 200, 500 |
| GET | `api/productos.php` (opcional `?categoria=` y `?oferta=1`) | público | CU-01 | 200, 500 |
| GET | `api/productos.php?id=N` | público | CU-02 | 200, 400, 404, 500 |
| POST | `api/productos.php` | empleado | CU-07 | 201, 400, 401, 403, 500 |
| PUT | `api/productos.php?id=N` | empleado | CU-07 | 200, 400, 401, 403, 404, 500 |
| DELETE | `api/productos.php?id=N` | empleado | CU-07 | 200, 400, 401, 403, 404, 500 |
| POST | `api/pedidos.php` | con sesión | CU-03 y CU-04 | 201, 400, 401, 409, 500 |
| GET | `api/pedidos.php` | con sesión | CU-04 y CU-07 | 200, 401, 500 |
| POST | `api/registro.php` | público | CU-05 | 201, 400, 409, 500 |
| POST | `api/login.php` | público | CU-06 | 200, 400, 401, 500 |
| POST | `api/logout.php` | público | CU-06 | 200 |
| GET | `api/sesion.php` | público | CU-06 | 200 |

## Seguridad

Las medidas aplicadas siguen el estándar OWASP Top 10:

- Control de acceso (A01): los endpoints protegidos validan la sesión en el servidor con `$_SESSION`. Una petición anónima recibe el código 401 y un cliente que intenta una acción de personal recibe 403. El rol nunca se toma de los datos enviados por el cliente.
- Criptografía (A02): las contraseñas se almacenan con `password_hash()` (BCRYPT) en una columna `VARCHAR(255)` y se verifican con `password_verify()`.
- Inyección (A03): todas las consultas usan PDO con marcadores nombrados (`:campo`). En el cliente, los datos se insertan con `createElement` y `textContent`, sin utilizar `innerHTML`.
- Diseño (A04): los precios, el descuento y el total del pedido se calculan en el servidor a partir de la base de datos. El pedido se registra dentro de una transacción que bloquea las filas de los productos y se revierte ante cualquier error.
- Configuración (A05): las excepciones de PDO se registran en el log del servidor y el cliente sólo recibe un error 500 genérico. Las carpetas `config`, `models` y `sql` tienen un `.htaccess` que impide el acceso desde la web.
- Autenticación y sesiones (A07): tras iniciar sesión se ejecuta `session_regenerate_id(true)` para evitar la fijación de sesión; la cookie es `HttpOnly` con `SameSite=Lax`.

## Accesibilidad

La interfaz usa HTML semántico y atributos ARIA, puede operarse sólo con el teclado (Tab y Enter), muestra el foco con la regla `:focus-visible` y notifica los cambios dinámicos mediante regiones `aria-live="polite"`. La auditoría de accesibilidad de Lighthouse arrojó 100 sobre 100 en las vistas de inicio, catálogo, ficha de producto, finalización de compra y cuenta.

## Pruebas (opcional)

```
# Pruebas de la API (con la base de datos importada)
node tests/test_api.mjs http://localhost/mercado-fresco/api

# Navegación por teclado y auditoría con axe-core
cd tests
npm install
npx playwright install chromium
cd ..
node tests/prueba_teclado.cjs http://localhost/mercado-fresco/public/index.html
```

La auditoría de Lighthouse puede repetirse desde Chrome: F12, pestaña "Lighthouse", categoría "Accessibility" y "Analyze page load".
