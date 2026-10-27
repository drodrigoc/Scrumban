const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/checklistController');
const { authenticate, requireProjectAccess, requireTaskInProject } = require('../middleware/auth');

// Mismo control que las tareas: ver el proyecto, y la tarea debe ser suya
router.use(authenticate, requireProjectAccess('lectura'), requireTaskInProject);

const escritura = requireProjectAccess('escritura');

router.get('/',            ctrl.getItems);
router.post('/',           escritura, ctrl.addItem);
router.patch('/:item_id',  escritura, ctrl.updateItem);
router.delete('/:item_id', escritura, ctrl.deleteItem);

module.exports = router;
