<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/conexion.php';

final class CategoriaModel
{
    public function __construct(private ?PDO $db = null)
    {
        $this->db ??= Conexion::obtener();
    }

    public function listar(): array
    {
        $st = $this->db->prepare(
            'SELECT c.id, c.nombre, c.slug, c.emoji, COUNT(p.id) AS cantidad
               FROM categorias c
          LEFT JOIN productos p ON p.categoria_id = c.id AND p.activo = 1
           GROUP BY c.id, c.nombre, c.slug, c.emoji
           ORDER BY c.id'
        );
        $st->execute();
        return array_map(fn($f) => $f + ['cantidad' => (int) $f['cantidad']] , $st->fetchAll());
    }

    public function existe(int $id): bool
    {
        $st = $this->db->prepare('SELECT 1 FROM categorias WHERE id = :id');
        $st->execute([':id' => $id]);
        return (bool) $st->fetchColumn();
    }
}
