<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/respuesta.php';
require_once __DIR__ . '/../models/UsuarioModel.php';

// CU-06 Iniciar sesión — POST {email, password}
exigirMetodo('POST');
$d = leerJson();
$email = texto($d['email'] ?? null);
$clave = is_string($d['password'] ?? null) ? $d['password'] : null;

if ($email === null || $email === '' || $clave === null || $clave === '') {
    responderError(400, 'Ingresá tu e-mail y tu contraseña.');
}

try {
    $usuario = (new UsuarioModel())->buscarPorEmail(strtolower($email));
} catch (PDOException $e) {
    falloInterno($e);
}

// Mismo mensaje para "no existe" y "clave incorrecta": no revela qué e-mails están registrados.
if (!$usuario || !password_verify($clave, $usuario['password'])) {
    responderError(401, 'E-mail o contraseña incorrectos.');
}

iniciarSesion();
session_regenerate_id(true); // previene fijación de sesión (OWASP A07)
$_SESSION['usuario_id'] = (int) $usuario['id'];
$_SESSION['nombre']     = $usuario['nombre'];
$_SESSION['email']      = $usuario['email'];
$_SESSION['rol']        = $usuario['rol'];

responder(200, ['usuario' => ['id' => (int) $usuario['id'], 'nombre' => $usuario['nombre'], 'email' => $usuario['email'], 'rol' => $usuario['rol']]]);
