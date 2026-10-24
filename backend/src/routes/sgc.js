const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/sgcController');
const { authenticate, authorize, authorizeSGC } = require('../middleware/auth');

router.use(authenticate);

// Lecturas
router.get('/',            authorizeSGC, ctrl.getAll);
router.get('/arbol',       authorizeSGC, ctrl.getArbol);
router.get('/with-tasks',  authorizeSGC, ctrl.getAllWithTasks);

// Niveles 1 a 3 (solo administradores)
router.post('/dimensiones',       authorize('admin'), ctrl.createDimension);
router.put('/dimensiones/:id',    authorize('admin'), ctrl.updateDimension);
router.delete('/dimensiones/:id', authorize('admin'), ctrl.deleteDimension);

router.post('/criterios',         authorize('admin'), ctrl.createCriterio);
router.put('/criterios/:id',      authorize('admin'), ctrl.updateCriterio);
router.delete('/criterios/:id',   authorize('admin'), ctrl.deleteCriterio);

router.post('/indicadores',       authorize('admin'), ctrl.createIndicador);
router.put('/indicadores/:id',    authorize('admin'), ctrl.updateIndicador);
router.delete('/indicadores/:id', authorize('admin'), ctrl.deleteIndicador);

// Nivel 4: evidencias
router.post('/',           authorize('admin'), ctrl.create);
router.put('/:id',         authorize('admin'), ctrl.update);
router.delete('/:id',      authorize('admin'), ctrl.remove);

module.exports = router;
