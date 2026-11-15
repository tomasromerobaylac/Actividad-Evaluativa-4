<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/../models/PedidoModel.php';

/**
 * Recurso /pedidos (requiere sesión)
 *   POST {items:[{producto_id,cantidad}], nombre, direccion, telefono, email, pago, notas?, cupon?}   CU-04
 *   GET  lista los pedidos propios (el empleado ve todos)                                      CU-04/CU-07
 */
$metodo = exigirMetodo('GET', 'POST');
$usuarioId = exigirLogin();

try {
    $pedidos = new PedidoModel();

    if ($metodo === 'GET') {
        responder(200, $pedidos->listar($usuarioId, ($_SESSION['rol'] ?? '') === 'empleado'));
    }

    $d = leerJson();
    $crudos = $d['items'] ?? null;
    if (!is_array($crudos) || $crudos === [] || count($crudos) > 50) {
        responderError(400, 'Tu pedido está vacío: agregá al menos un producto.');
    }
    $items = [];
    foreach ($crudos as $it) {
        $pid = is_array($it) ? filter_var($it['producto_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) : false;
        $cant = is_array($it) ? filter_var($it['cantidad'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 99]]) : false;
        if ($pid === false || $cant === false) {
            responderError(400, 'Cada ítem necesita un producto_id y una cantidad entre 1 y 99.');
        }
        $items[$pid] = ($items[$pid] ?? 0) + $cant;
    }

    $nombre = texto($d['nombre'] ?? null);
    $direccion = texto($d['direccion'] ?? null);
    $telefono = texto($d['telefono'] ?? null);
    $email = texto($d['email'] ?? null);
    $pago = texto($d['pago'] ?? null);
    $notas = texto($d['notas'] ?? null) ?? '';
    $cupon = texto($d['cupon'] ?? null);
    if ($nombre === null || $nombre === '' || mb_strlen($nombre) > 120) {
        responderError(400, 'Ingresá tu nombre y apellido.');
    }
    if ($direccion === null || $direccion === '' || mb_strlen($direccion) > 200) {
        responderError(400, 'Ingresá la dirección de entrega.');
    }
    if ($telefono === null || !preg_match('/^[0-9 ()+\-]{6,25}$/', $telefono)) {
        responderError(400, 'Ingresá un teléfono válido.');
    }
    if ($email === null || mb_strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        responderError(400, 'Ingresá un e-mail válido.');
    }
    if (!in_array($pago, ['efectivo', 'tarjeta', 'transferencia'], true)) {
        responderError(400, 'Elegí un medio de pago.');
    }
    if (mb_strlen($notas) > 300) {
        responderError(400, 'Las notas admiten hasta 300 caracteres.');
    }
    $cupon = $cupon !== null && $cupon !== '' ? strtoupper($cupon) : null;
    if ($cupon !== null && !isset(PedidoModel::CUPONES[$cupon])) {
        responderError(400, 'El código de descuento no es válido.');
    }

    try {
        $creado = $pedidos->crear($usuarioId, $items,
            ['nombre' => $nombre, 'direccion' => $direccion, 'telefono' => $telefono, 'email' => $email, 'pago' => $pago, 'notas' => $notas],
            $cupon);
    } catch (ProductoInexistente) {
        responderError(400, 'Algún producto del pedido ya no está disponible.');
    } catch (StockInsuficiente $e) {
        responderError(409, $e->getMessage());
    }
    responder(201, $creado);
} catch (PDOException $e) {
    falloInterno($e);
}
