const router = require('express').Router();
const ctrl   = require('../controllers/projectController');
const budget = require('../controllers/budgetController');
const phases = require('../controllers/phaseController');
const pei    = require('../controllers/peiController');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

router.use(authenticate);

// Niveles de acceso: ver middleware/auth.js (accesoAProyecto)
const lectura   = requireProjectAccess('lectura');
const escritura = requireProjectAccess('escritura');
const gestion   = requireProjectAccess('gestion');
// Como gestión, pero se cierra cuando el administrador bloquea la
// planificación de un proyecto POA (ver middleware/auth.js)
const planificacion = requireProjectAccess('planificacion');

// La lista ya filtra por los proyectos de cada usuario
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);

router.get('/:id', lectura, ctrl.getById);
router.put('/:id', gestion, ctrl.update);
// Archivar, restaurar y eliminar: administrador o coordinador de la unidad
// (lo decide el controlador con req.acceso)
router.patch('/:id/archive',   lectura, ctrl.archive);
router.patch('/:id/unarchive', lectura, ctrl.unarchive);
router.delete('/:id',          lectura, ctrl.delete);

router.post('/:id/members', gestion, ctrl.addMember);
router.patch('/:id/members/:userId/role', gestion, ctrl.updateMemberRole);
router.delete('/:id/members/:userId', gestion, ctrl.removeMember);

router.get('/:id/labels', lectura, ctrl.getLabels);
router.post('/:id/labels', escritura, ctrl.createLabel);

// Columnas del tablero Kanban (compartidas por proyecto)
router.get('/:id/columns', lectura, ctrl.getColumns);
router.put('/:id/columns', escritura, ctrl.saveColumns);

// Presupuesto — partidas de costos fijos y variables. Con la planificación
// bloqueada solo se actualiza el ejecutado de las fijas (lo decide el
// controlador), que es ejecución y no plan.
router.get('/:id/budget',            lectura, budget.getAll);
router.post('/:id/budget',           planificacion, budget.create);
router.put('/:id/budget/:itemId',    gestion, budget.update);
router.delete('/:id/budget/:itemId', planificacion, budget.remove);

// Fases — cronograma macro del proyecto
router.get('/:id/phases',             lectura, phases.getAll);
router.post('/:id/phases',            planificacion, phases.create);
router.put('/:id/phases/:phaseId',    planificacion, phases.update);
router.delete('/:id/phases/:phaseId', planificacion, phases.remove);

// Alineación con el Plan Estratégico Institucional
router.get('/:id/pei',               lectura, pei.getProyecto);
// Vincular o quitar actividades es plan; marcarlas cumplidas es ejecución
router.post('/:id/pei',              planificacion, pei.vincular);
router.put('/:id/pei/:vinculoId',    gestion, pei.actualizarVinculo);
router.delete('/:id/pei/:vinculoId', planificacion, pei.desvincular);

module.exports = router;
