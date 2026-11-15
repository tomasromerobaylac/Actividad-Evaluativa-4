<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/../models/ProductoModel.php';
require_once __DIR__ . '/../models/CategoriaModel.php';

/**
 * Recurso /productos
 *   GET    ?categoria=slug&oferta=1   CU-01 listar (público)
 *   GET    ?id=N                      CU-02 ficha de producto (público)
 *   POST   {…}                        CU-07 alta (empleado)
 *   PUT    ?id=N {…}                  CU-07 modificación (empleado)
 *   DELETE ?id=N                      CU-07 baja lógica (empleado)
 */
$metodo = exigirMetodo('GET', 'POST', 'PUT', 'DELETE');
$id = isset($_GET['id']) ? filter_var($_GET['id'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) : null;
if (isset($_GET['id']) && $id === false) {
    responderError(400, 'El parámetro id debe ser un entero positivo.');
}

/** Valida y normaliza el JSON de alta/modificación. */
function validarProducto(array $d): array
{
    $nombre = texto($d['nombre'] ?? null);
    $unidad = texto($d['unidad'] ?? null);
    $emoji  = texto($d['emoji'] ?? null) ?? '';
    $cat    = filter_var($d['categoria_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $precio = filter_var($d['precio'] ?? null, FILTER_VALIDATE_FLOAT);
    $stock  = filter_var($d['stock'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $minimo = filter_var($d['stock_minimo'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);

    if ($nombre === null || $nombre === '' || mb_strlen($nombre) > 120) {
        responderError(400, 'El nombre es obligatorio (hasta 120 caracteres).');
    }
    if (!in_array($unidad, ['kg', 'un.', 'l', 'g', 'doc.'], true)) {
        responderError(400, 'La unidad debe ser kg, un., l, g o doc.');
    }
    if ($cat === false || !(new CategoriaModel())->existe($cat)) {
        responderError(400, 'Elegí una categoría válida.');
    }
    if ($precio === false || $precio <= 0 || $precio > 9999999) {
        responderError(400, 'El precio debe ser un número mayor a 0.');
    }
    if ($stock === false || $minimo === false) {
        responderError(400, 'El stock y el stock mínimo deben ser enteros de 0 en adelante.');
    }
    if (mb_strlen($emoji) > 8) {
        responderError(400, 'El emoji es demasiado largo.');
    }
    return ['nombre' => $nombre, 'categoria_id' => $cat, 'precio' => round($precio, 2), 'unidad' => $unidad,
            'emoji' => $emoji, 'oferta' => !empty($d['oferta']), 'stock' => $stock, 'stock_minimo' => $minimo];
}

try {
    $productos = new ProductoModel();

    if ($metodo === 'GET') {
        if ($id !== null) {
            $p = $productos->obtener($id);
            $p ? responder(200, $p) : responderError(404, 'El producto no existe.');
        }
        $slug = texto($_GET['categoria'] ?? null);
        responder(200, $productos->listar($slug !== '' ? $slug : null, ($_GET['oferta'] ?? '') === '1'));
    }

    exigirEmpleado(); // 401 anónimo · 403 cliente

    if ($metodo === 'POST') {
        $nuevo = $productos->crear(validarProducto(leerJson()));
        responder(201, $productos->obtener($nuevo));
    }

    if ($id === null) {
        responderError(400, 'Indicá el id del producto (?id=).');
    }
    if ($metodo === 'PUT') {
        $datos = validarProducto(leerJson());
        $productos->actualizar($id, $datos) ? responder(200, $productos->obtener($id))
                                            : responderError(404, 'El producto no existe.');
    }
    // DELETE
    $productos->eliminar($id) ? responder(200, ['mensaje' => 'Producto eliminado.'])
                              : responderError(404, 'El producto no existe.');
} catch (PDOException $e) {
    falloInterno($e);
}
