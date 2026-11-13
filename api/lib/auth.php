<?php
declare(strict_types=1);

require_once __DIR__ . '/respuesta.php';

/**
 * Control de acceso (OWASP A01 / A07).
 * - exigirLogin():    401 Unauthorized si la petición es anónima.
 * - exigirEmpleado(): 401 si es anónima, 403 Forbidden si es cliente.
 * Ambas validan la sesión en el servidor con $_SESSION.
 */
function exigirLogin(): int
{
    iniciarSesion();
    if (empty($_SESSION['usuario_id'])) {
        responderError(401, 'Tenés que iniciar sesión.');
    }
    return (int) $_SESSION['usuario_id'];
}

function exigirEmpleado(): int
{
    $id = exigirLogin();
    if (($_SESSION['rol'] ?? '') !== 'empleado') {
        responderError(403, 'Esta acción es sólo para personal del local.');
    }
    return $id;
}
