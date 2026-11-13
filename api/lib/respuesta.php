<?php
declare(strict_types=1);

/**
 * Utilidades comunes de los controladores REST.
 * Todo endpoint responde JSON (UTF-8) con un código HTTP semántico.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function responder(int $codigo, array $datos = []): never
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function responderError(int $codigo, string $mensaje): never
{
    responder($codigo, ['error' => $mensaje]);
}

/** Corta con 405 si el método HTTP no está permitido. */
function exigirMetodo(string ...$permitidos): string
{
    $metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($metodo, $permitidos, true)) {
        header('Allow: ' . implode(', ', $permitidos));
        responderError(405, 'Método no permitido.');
    }
    return $metodo;
}

/** Lee y decodifica el cuerpo JSON. Devuelve 400 si falta o es inválido. */
function leerJson(): array
{
    $crudo = file_get_contents('php://input');
    $datos = json_decode($crudo === false ? '' : $crudo, true);
    if (!is_array($datos)) {
        responderError(400, 'El cuerpo de la petición debe ser un JSON válido.');
    }
    return $datos;
}

/** Texto recortado; null si el valor no es una cadena. */
function texto(mixed $valor): ?string
{
    return is_string($valor) ? trim($valor) : null;
}

/** Sesión con cookie HttpOnly + SameSite y modo estricto (sin ids de sesión inventados). */
function iniciarSesion(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',
            'use_strict_mode' => true,
        ]);
    }
}

/** Registra el detalle técnico en el log del servidor y responde 500 genérico. */
function falloInterno(Throwable $e): never
{
    error_log('[mercado-fresco] ' . get_class($e) . ': ' . $e->getMessage());
    responderError(500, 'Ocurrió un error interno. Intentá nuevamente en unos minutos.');
}
