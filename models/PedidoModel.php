<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/conexion.php';

/** Excepción de negocio: no alcanza el stock de algún producto. */
final class StockInsuficiente extends RuntimeException {}
/** Excepción de negocio: producto inexistente o dado de baja. */
final class ProductoInexistente extends RuntimeException {}

final class PedidoModel
{
    public const ENVIO = 800.00;
    public const CUPONES = ['UCP10' => 0.10];

    public function __construct(private ?PDO $db = null)
    {
        $this->db ??= Conexion::obtener();
    }

    /**
     * Crea el pedido de forma atómica: bloquea las filas de producto, valida
     * stock, descuenta, calcula totales con los precios de la base (nunca los
     * que envía el cliente) y confirma. Ante cualquier error hace rollBack().
     *
     * @param array<int,int> $items  producto_id => cantidad
     */
    public function crear(int $usuarioId, array $items, array $entrega, ?string $cupon): array
    {
        $this->db->beginTransaction();
        try {
            $subtotal = 0.0;
            $lineas = [];
            ksort($items); // orden fijo de bloqueo: evita deadlocks entre pedidos concurrentes

            $sel = $this->db->prepare(
                'SELECT id, nombre, precio, stock FROM productos WHERE id = :id AND activo = 1 FOR UPDATE'
            );
            foreach ($items as $productoId => $cantidad) {
                $sel->execute([':id' => $productoId]);
                $p = $sel->fetch();
                if (!$p) {
                    throw new ProductoInexistente("Producto $productoId inexistente");
                }
                if ((int) $p['stock'] < $cantidad) {
                    throw new StockInsuficiente('No hay stock suficiente de ' . $p['nombre'] . '.');
                }
                $precio = (float) $p['precio'];
                $subtotal += $precio * $cantidad;
                $lineas[] = ['id' => (int) $p['id'], 'cantidad' => $cantidad, 'precio' => $precio];
            }

            $descuento = round($subtotal * (self::CUPONES[$cupon ?? ''] ?? 0.0), 2);
            $total = round($subtotal - $descuento + self::ENVIO, 2);

            $ins = $this->db->prepare(
                'INSERT INTO pedidos (usuario_id, nombre, direccion, telefono, email, pago, notas, subtotal, descuento, envio, total)
                 VALUES (:usuario_id, :nombre, :direccion, :telefono, :email, :pago, :notas, :subtotal, :descuento, :envio, :total)'
            );
            $ins->execute([
                ':usuario_id' => $usuarioId,
                ':nombre'     => $entrega['nombre'],
                ':direccion'  => $entrega['direccion'],
                ':telefono'   => $entrega['telefono'],
                ':email'      => $entrega['email'],
                ':pago'       => $entrega['pago'],
                ':notas'      => $entrega['notas'],
                ':subtotal'   => $subtotal,
                ':descuento'  => $descuento,
                ':envio'      => self::ENVIO,
                ':total'      => $total,
            ]);
            $pedidoId = (int) $this->db->lastInsertId();

            $insItem = $this->db->prepare(
                'INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
                 VALUES (:pedido_id, :producto_id, :cantidad, :precio_unitario)'
            );
            $baja = $this->db->prepare('UPDATE productos SET stock = stock - :cantidad WHERE id = :id');
            foreach ($lineas as $l) {
                $insItem->execute([
                    ':pedido_id' => $pedidoId, ':producto_id' => $l['id'],
                    ':cantidad' => $l['cantidad'], ':precio_unitario' => $l['precio'],
                ]);
                $baja->execute([':cantidad' => $l['cantidad'], ':id' => $l['id']]);
            }

            $this->db->commit();
            return ['id' => $pedidoId, 'subtotal' => $subtotal, 'descuento' => $descuento,
                    'envio' => self::ENVIO, 'total' => $total];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /** Pedidos de un usuario; si $todos es true (empleado) devuelve los de todos. */
    public function listar(int $usuarioId, bool $todos): array
    {
        $sql = 'SELECT p.id, p.nombre, p.pago, p.total, p.estado, p.creado_en, COUNT(i.id) AS lineas
                  FROM pedidos p LEFT JOIN pedido_items i ON i.pedido_id = p.id'
             . ($todos ? '' : ' WHERE p.usuario_id = :uid')
             . ' GROUP BY p.id, p.nombre, p.pago, p.total, p.estado, p.creado_en
                 ORDER BY p.id DESC LIMIT 50';
        $st = $this->db->prepare($sql);
        $st->execute($todos ? [] : [':uid' => $usuarioId]);
        return array_map(fn($f) => [
            'id' => (int) $f['id'], 'nombre' => $f['nombre'], 'pago' => $f['pago'],
            'total' => (float) $f['total'], 'estado' => $f['estado'],
            'creado_en' => $f['creado_en'], 'lineas' => (int) $f['lineas'],
        ], $st->fetchAll());
    }
}
