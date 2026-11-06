const router = require('express').Router();
const ctrl   = require('../controllers/peiController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// El catálogo lo consulta cualquiera con sesión: se usa para alinear proyectos
router.get('/', ctrl.getArbol);

// Tablero consolidado: muestra proyectos de toda la institución
router.get('/tablero', authorize('admin', 'superViewer'), ctrl.getTablero);

// Edición del catálogo (solo administradores)
const admin = authorize('admin');
router.put('/plan', admin, ctrl.updatePlan);

router.post('/lineas',       admin, ctrl.createLinea);
router.put('/lineas/:id',    admin, ctrl.updateLinea);
router.delete('/lineas/:id', admin, ctrl.deleteLinea);

router.post('/acciones',       admin, ctrl.createAccion);
router.put('/acciones/:id',    admin, ctrl.updateAccion);
router.delete('/acciones/:id', admin, ctrl.deleteAccion);

router.post('/actividades',       admin, ctrl.createActividad);
router.put('/actividades/:id',    admin, ctrl.updateActividad);
router.delete('/actividades/:id', admin, ctrl.deleteActividad);

module.exports = router;
