<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/respuesta.php';

// CU-06 Cerrar sesión — POST
exigirMetodo('POST');
iniciarSesion();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();
responder(200, ['mensaje' => 'Sesión cerrada.']);
