const router = require('express').Router();
const ctrl   = require('../controllers/unitController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// All authenticated users can read units (needed for user form dropdown)
router.get('/',    ctrl.getAll);

// Only admins can manage units
router.post('/',   authorize('admin'), ctrl.create);
router.put('/:id', authorize('admin'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.delete);

module.exports = router;
