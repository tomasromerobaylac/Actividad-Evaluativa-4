<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/conexion.php';

/** CRUD de productos (baja lógica con la columna `activo`). */
final class ProductoModel
{
    private const SELECT = 'SELECT p.id, p.nombre, p.categoria_id, c.nombre AS categoria, c.slug AS categoria_slug,
                                   p.precio, p.unidad, p.emoji, p.oferta, p.stock, p.stock_minimo
                              FROM productos p
                              JOIN categorias c ON c.id = p.categoria_id';

    public function __construct(private ?PDO $db = null)
    {
        $this->db ??= Conexion::obtener();
    }

    /** @return array<int,array<string,mixed>> */
    public function listar(?string $categoriaSlug = null, bool $soloOfertas = false): array
    {
        $sql = self::SELECT . ' WHERE p.activo = 1';
        $params = [];
        if ($categoriaSlug !== null) {
            $sql .= ' AND c.slug = :slug';
            $params[':slug'] = $categoriaSlug;
        }
        if ($soloOfertas) {
            $sql .= ' AND p.oferta = 1';
        }
        $st = $this->db->prepare($sql . ' ORDER BY c.id, p.nombre');
        $st->execute($params);
        return array_map([$this, 'normalizar'], $st->fetchAll());
    }

    public function obtener(int $id): ?array
    {
        $st = $this->db->prepare(self::SELECT . ' WHERE p.id = :id AND p.activo = 1');
        $st->execute([':id' => $id]);
        $fila = $st->fetch();
        return $fila ? $this->normalizar($fila) : null;
    }

    public function crear(array $d): int
    {
        $st = $this->db->prepare(
            'INSERT INTO productos (nombre, categoria_id, precio, unidad, emoji, oferta, stock, stock_minimo)
             VALUES (:nombre, :categoria_id, :precio, :unidad, :emoji, :oferta, :stock, :stock_minimo)'
        );
        $st->execute($this->parametros($d));
        return (int) $this->db->lastInsertId();
    }

    public function actualizar(int $id, array $d): bool
    {
        $st = $this->db->prepare(
            'UPDATE productos
                SET nombre = :nombre, categoria_id = :categoria_id, precio = :precio, unidad = :unidad,
                    emoji = :emoji, oferta = :oferta, stock = :stock, stock_minimo = :stock_minimo
              WHERE id = :id AND activo = 1'
        );
        $st->execute($this->parametros($d) + [':id' => $id]);
        // rowCount() = 0 también si no cambió ningún valor; se confirma con obtener()
        return $st->rowCount() > 0 || $this->obtener($id) !== null;
    }

    public function eliminar(int $id): bool
    {
        $st = $this->db->prepare('UPDATE productos SET activo = 0 WHERE id = :id AND activo = 1');
        $st->execute([':id' => $id]);
        return $st->rowCount() > 0;
    }

    private function parametros(array $d): array
    {
        return [
            ':nombre'       => $d['nombre'],
            ':categoria_id' => $d['categoria_id'],
            ':precio'       => $d['precio'],
            ':unidad'       => $d['unidad'],
            ':emoji'        => $d['emoji'],
            ':oferta'       => $d['oferta'] ? 1 : 0,
            ':stock'        => $d['stock'],
            ':stock_minimo' => $d['stock_minimo'],
        ];
    }

    private function normalizar(array $f): array
    {
        $f['id'] = (int) $f['id'];
        $f['categoria_id'] = (int) $f['categoria_id'];
        $f['precio'] = (float) $f['precio'];
        $f['oferta'] = (bool) $f['oferta'];
        $f['stock'] = (int) $f['stock'];
        $f['stock_minimo'] = (int) $f['stock_minimo'];
        $f['nivel_stock'] = $f['stock'] <= 0 ? 'agotado' : ($f['stock'] <= $f['stock_minimo'] ? 'bajo' : 'ok');
        return $f;
    }
}
