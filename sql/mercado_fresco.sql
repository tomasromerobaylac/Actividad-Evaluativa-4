-- Mercado Fresco · AE4 — esquema + datos iniciales (MySQL / MariaDB)
-- Cómo ejecutarlo: phpMyAdmin > Importar, o:  mysql -u root -p --default-character-set=utf8mb4 < sql/mercado_fresco.sql

CREATE DATABASE IF NOT EXISTS mercado_fresco
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mercado_fresco;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS pedido_items, pedidos, productos, categorias, usuarios;
SET FOREIGN_KEY_CHECKS = 1;

-- CU-05 / CU-06 (registro, login) y control de acceso por rol (CU-07)
CREATE TABLE usuarios (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL,
  email      VARCHAR(190) NOT NULL,
  password   VARCHAR(255) NOT NULL,  -- hash BCRYPT de password_hash() (60 car.; margen a 255)
  rol        ENUM('cliente','empleado') NOT NULL DEFAULT 'cliente',
  creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

-- CU-01 (explorar por rubro)
CREATE TABLE categorias (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL,
  slug    VARCHAR(60) NOT NULL,
  emoji   VARCHAR(8)  NOT NULL DEFAULT '',
  UNIQUE KEY uq_categorias_slug (slug)
) ENGINE=InnoDB;

-- CU-01, CU-02 (consulta) · CU-07 (alta, modificación, baja lógica e inventario)
CREATE TABLE productos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  categoria_id  INT UNSIGNED NOT NULL,
  precio        DECIMAL(10,2) NOT NULL,
  unidad        ENUM('kg','un.','l','g','doc.') NOT NULL DEFAULT 'un.',
  emoji         VARCHAR(8) NOT NULL DEFAULT '',
  oferta        TINYINT(1) NOT NULL DEFAULT 0,
  stock         INT UNSIGNED NOT NULL DEFAULT 0,
  stock_minimo  INT UNSIGNED NOT NULL DEFAULT 0,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  KEY ix_productos_categoria (categoria_id)
) ENGINE=InnoDB;

-- CU-04 (confirmar la compra)
CREATE TABLE pedidos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  direccion   VARCHAR(200) NOT NULL,
  telefono    VARCHAR(25)  NOT NULL,
  email       VARCHAR(190) NOT NULL,
  pago        ENUM('efectivo','tarjeta','transferencia') NOT NULL,
  notas       VARCHAR(300) NOT NULL DEFAULT '',
  subtotal    DECIMAL(10,2) NOT NULL,
  descuento   DECIMAL(10,2) NOT NULL DEFAULT 0,
  envio       DECIMAL(10,2) NOT NULL,
  total       DECIMAL(10,2) NOT NULL,
  estado      ENUM('pendiente','entregado') NOT NULL DEFAULT 'pendiente',
  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE pedido_items (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id        INT UNSIGNED NOT NULL,
  producto_id      INT UNSIGNED NOT NULL,
  cantidad         INT UNSIGNED NOT NULL,
  precio_unitario  DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB;

-- ---------- Datos iniciales ----------
INSERT INTO categorias (id, nombre, slug, emoji) VALUES
  (1, 'Frutas y verduras', 'frutas-verduras', '🥬'),
  (2, 'Lácteos', 'lacteos', '🧀'),
  (3, 'Carnicería', 'carniceria', '🥩'),
  (4, 'Panadería', 'panaderia', '🍞'),
  (5, 'Limpieza', 'limpieza', '🧴'),
  (6, 'Bebidas', 'bebidas', '🥤'),
  (7, 'Almacén', 'almacen', '🌾'),
  (8, 'Kiosco', 'kiosco', '🍫');

INSERT INTO productos (nombre, categoria_id, precio, unidad, emoji, oferta, stock, stock_minimo) VALUES
  ('Tomate perita', 1, 1850.00, 'kg', '🍅', 1, 42, 10),
  ('Papa negra', 1, 980.00, 'kg', '🥔', 0, 120, 20),
  ('Banana ecuatoriana', 1, 1320.00, 'kg', '🍌', 0, 6, 10),
  ('Leche entera La Serrana', 2, 1150.00, 'un.', '🥛', 0, 88, 15),
  ('Queso cremoso', 2, 4200.00, 'un.', '🧀', 0, 30, 10),
  ('Yogur bebible frutilla', 2, 1680.00, 'un.', '🍓', 0, 4, 12),
  ('Bife de chorizo', 3, 9800.00, 'kg', '🥩', 0, 25, 8),
  ('Milanesa de nalga', 3, 8100.00, 'kg', '🍖', 0, 18, 8),
  ('Pan francés', 4, 1400.00, 'kg', '🥖', 0, 60, 15),
  ('Facturas surtidas', 4, 3600.00, 'doc.', '🥐', 0, 3, 5),
  ('Detergente x 750 ml', 5, 2150.00, 'un.', '🧴', 0, 40, 10),
  ('Agua mineral sin gas', 6, 1050.00, 'un.', '💧', 0, 75, 15),
  ('Arroz largo fino', 7, 1200.00, 'kg', '🍚', 0, 50, 12),
  ('Aceite de girasol 1.5L', 7, 2400.00, 'un.', '🫒', 0, 8, 10),
  ('Alfajor de maicena', 8, 650.00, 'un.', '🍪', 0, 60, 15),
  ('Chocolate en barra', 8, 1800.00, 'un.', '🍫', 0, 5, 10);

-- Cuenta de personal para la demostración (rol empleado). Contraseña: Empleado2026!
-- Cambiarla antes de cualquier uso real. Los clientes se crean desde la pantalla de registro.
INSERT INTO usuarios (nombre, email, password, rol) VALUES
  ('Personal del local', 'empleado@mercadofresco.local', '$2y$10$PPqo6vI2ujU8i.gnfueHxu7ADVHgbOIsdc1To7h7Ubl6MSV944/.6', 'empleado');
