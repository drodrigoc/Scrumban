const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/',                       ctrl.getAll);
router.get('/stats',                  ctrl.getStats);
router.get('/team-overview',          authorize('admin', 'coordinator', 'superViewer'), ctrl.getTeamOverview);
router.get('/:id',                    ctrl.getById);
router.post('/',                      authorize('admin'), ctrl.create);
router.put('/:id',                    ctrl.update);
router.patch('/:id/toggle-status',    authorize('admin'), ctrl.toggleStatus);
router.patch('/:id/reset-password',   authorize('admin'), ctrl.resetPassword);

module.exports = router;
