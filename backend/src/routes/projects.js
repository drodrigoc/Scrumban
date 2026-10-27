const router = require('express').Router();
const ctrl   = require('../controllers/projectController');
const budget = require('../controllers/budgetController');
const phases = require('../controllers/phaseController');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

router.use(authenticate);

// Niveles de acceso: ver middleware/auth.js (accesoAProyecto)
const lectura   = requireProjectAccess('lectura');
const escritura = requireProjectAccess('escritura');
const gestion   = requireProjectAccess('gestion');

// La lista ya filtra por los proyectos de cada usuario
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);

router.get('/:id', lectura, ctrl.getById);
router.put('/:id', gestion, ctrl.update);
// Eliminar: solo el dueño o un admin (lo decide el controlador)
router.delete('/:id', lectura, ctrl.delete);

router.post('/:id/members', gestion, ctrl.addMember);
router.patch('/:id/members/:userId/role', gestion, ctrl.updateMemberRole);
router.delete('/:id/members/:userId', gestion, ctrl.removeMember);

router.get('/:id/labels', lectura, ctrl.getLabels);
router.post('/:id/labels', escritura, ctrl.createLabel);

// Columnas del tablero Kanban (compartidas por proyecto)
router.get('/:id/columns', lectura, ctrl.getColumns);
router.put('/:id/columns', escritura, ctrl.saveColumns);

// Presupuesto — partidas de costos fijos y variables
router.get('/:id/budget',            lectura, budget.getAll);
router.post('/:id/budget',           gestion, budget.create);
router.put('/:id/budget/:itemId',    gestion, budget.update);
router.delete('/:id/budget/:itemId', gestion, budget.remove);

// Fases — cronograma macro del proyecto
router.get('/:id/phases',             lectura, phases.getAll);
router.post('/:id/phases',            gestion, phases.create);
router.put('/:id/phases/:phaseId',    gestion, phases.update);
router.delete('/:id/phases/:phaseId', gestion, phases.remove);

module.exports = router;
