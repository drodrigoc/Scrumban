const router = require('express').Router();
const ctrl   = require('../controllers/peiController');
const { authenticate, authorize, authorizePEI } = require('../middleware/auth');

router.use(authenticate);

// El catálogo lo consulta cualquiera con sesión: lo usa el panel de
// alineación de cada proyecto para elegir actividades
router.get('/', ctrl.getArbol);

// Tablero consolidado (proyectos de toda la institución): administrador,
// Super Visor y quien tenga acceso al Plan estratégico, como en el SGC
router.get('/tablero', authorizePEI, ctrl.getTablero);

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
