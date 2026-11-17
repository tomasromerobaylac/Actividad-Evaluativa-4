<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/respuesta.php';

// Estado de la sesión para que la SPA sepa qué mostrar — GET
// Es informativo (siempre 200): la decisión de seguridad se toma en cada endpoint protegido.
exigirMetodo('GET');
iniciarSesion();
// Una sesión incompleta (sin nombre o rol) se trata como anónima.
if (empty($_SESSION['usuario_id']) || !isset($_SESSION['nombre'], $_SESSION['rol'])) {
    responder(200, ['autenticado' => false, 'usuario' => null]);
}
responder(200, ['autenticado' => true, 'usuario' => [
    'id' => (int) $_SESSION['usuario_id'], 'nombre' => $_SESSION['nombre'], 'email' => $_SESSION['email'] ?? '', 'rol' => $_SESSION['rol'],
]]);
