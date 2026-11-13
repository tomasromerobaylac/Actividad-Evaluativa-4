<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/respuesta.php';
require_once __DIR__ . '/../models/UsuarioModel.php';

// CU-05 Registrarse — POST {nombre, email, password}
exigirMetodo('POST');
$d = leerJson();
$nombre = texto($d['nombre'] ?? null);
$email  = texto($d['email'] ?? null);
$clave  = is_string($d['password'] ?? null) ? $d['password'] : null;

if ($nombre === null || $nombre === '' || mb_strlen($nombre) > 120) {
    responderError(400, 'Ingresá tu nombre (hasta 120 caracteres).');
}
if ($email === null || mb_strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    responderError(400, 'Ingresá un e-mail válido.');
}
if ($clave === null || strlen($clave) < 8 || strlen($clave) > 72) {
    responderError(400, 'La contraseña debe tener entre 8 y 72 caracteres.');
}

try {
    $usuarios = new UsuarioModel();
    if ($usuarios->existeEmail($email)) {
        responderError(409, 'Ya existe una cuenta con ese e-mail.');
    }
    $id = $usuarios->crear($nombre, strtolower($email), password_hash($clave, PASSWORD_BCRYPT));
    responder(201, ['id' => $id, 'mensaje' => 'Cuenta creada. Ya podés iniciar sesión.']);
} catch (PDOException $e) {
    // 23000 = violación de UNIQUE (carrera entre dos registros simultáneos)
    if ($e->getCode() === '23000') {
        responderError(409, 'Ya existe una cuenta con ese e-mail.');
    }
    falloInterno($e);
}
