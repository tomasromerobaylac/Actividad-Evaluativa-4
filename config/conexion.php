<?php
declare(strict_types=1);

/**
 * Conexión PDO a MySQL con patrón Singleton.
 *
 * Una única instancia de PDO por petición. Los datos de acceso se leen de
 * variables de entorno y, si no existen, se usan los valores por defecto de
 * XAMPP (usuario root sin contraseña).
 */
final class Conexion
{
    private static ?PDO $instancia = null;

    private function __construct() {}
    private function __clone() {}

    public static function obtener(): PDO
    {
        if (self::$instancia === null) {
            $host   = getenv('DB_HOST') ?: 'localhost';
            $nombre = getenv('DB_NAME') ?: 'mercado_fresco';
            $usuario = getenv('DB_USER') ?: 'root';
            $clave  = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';

            // PDOException se propaga: la captura cada controlador y responde 500
            // genérico, de modo que el detalle técnico nunca llega al cliente.
            self::$instancia = new PDO(
                "mysql:host={$host};dbname={$nombre};charset=utf8mb4",
                $usuario,
                $clave,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
        }
        return self::$instancia;
    }
}
