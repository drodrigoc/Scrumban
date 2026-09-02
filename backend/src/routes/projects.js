const router = require('express').Router();
const ctrl   = require('../controllers/projectController');
const budget = require('../controllers/budgetController');
const phases = require('../controllers/phaseController');
const { authenticate, denyProjectViewer } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

router.post('/:id/members', ctrl.addMember);
router.patch('/:id/members/:userId/role', ctrl.updateMemberRole);
router.delete('/:id/members/:userId', ctrl.removeMember);

router.get('/:id/labels', ctrl.getLabels);
router.post('/:id/labels', ctrl.createLabel);

// Columnas del tablero Kanban (compartidas por proyecto)
router.get('/:id/columns', ctrl.getColumns);
router.put('/:id/columns', denyProjectViewer, ctrl.saveColumns);

// Presupuesto — partidas de costos fijos y variables
router.get('/:id/budget',            budget.getAll);
router.post('/:id/budget',           denyProjectViewer, budget.create);
router.put('/:id/budget/:itemId',    denyProjectViewer, budget.update);
router.delete('/:id/budget/:itemId', denyProjectViewer, budget.remove);

// Fases — cronograma macro del proyecto
router.get('/:id/phases',             phases.getAll);
router.post('/:id/phases',            denyProjectViewer, phases.create);
router.put('/:id/phases/:phaseId',    denyProjectViewer, phases.update);
router.delete('/:id/phases/:phaseId', denyProjectViewer, phases.remove);

module.exports = router;
