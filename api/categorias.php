<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/respuesta.php';
require_once __DIR__ . '/../models/CategoriaModel.php';

// CU-01 Explorar el catálogo por rubro — GET
exigirMetodo('GET');
try {
    responder(200, (new CategoriaModel())->listar());
} catch (PDOException $e) {
    falloInterno($e);
}
