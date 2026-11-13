<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/conexion.php';

/**
 * Acceso a datos de usuarios. Sólo SQL con PDO y marcadores nombrados;
 * no conoce HTTP, sesiones ni JSON (eso es responsabilidad del controlador).
 */
final class UsuarioModel
{
    public function __construct(private ?PDO $db = null)
    {
        $this->db ??= Conexion::obtener();
    }

    public function buscarPorEmail(string $email): ?array
    {
        $st = $this->db->prepare(
            'SELECT id, nombre, email, password, rol FROM usuarios WHERE email = :email LIMIT 1'
        );
        $st->execute([':email' => $email]);
        return $st->fetch() ?: null;
    }

    public function existeEmail(string $email): bool
    {
        $st = $this->db->prepare('SELECT 1 FROM usuarios WHERE email = :email LIMIT 1');
        $st->execute([':email' => $email]);
        return (bool) $st->fetchColumn();
    }

    /** El rol siempre es 'cliente': nunca se toma del cliente HTTP. */
    public function crear(string $nombre, string $email, string $hash): int
    {
        $st = $this->db->prepare(
            "INSERT INTO usuarios (nombre, email, password, rol)
             VALUES (:nombre, :email, :password, 'cliente')"
        );
        $st->execute([':nombre' => $nombre, ':email' => $email, ':password' => $hash]);
        return (int) $this->db->lastInsertId();
    }
}
