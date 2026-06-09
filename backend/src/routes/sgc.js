const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/sgcController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/',            ctrl.getAll);
router.get('/with-tasks',  authorize('admin', 'superViewer'), ctrl.getAllWithTasks);
router.post('/',           authorize('admin'), ctrl.create);
router.put('/:id',         authorize('admin'), ctrl.update);
router.delete('/:id',      authorize('admin'), ctrl.remove);

module.exports = router;
