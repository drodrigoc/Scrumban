const router = require('express').Router();
const ctrl = require('../controllers/projectController');
const { authenticate } = require('../middleware/auth');

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

module.exports = router;
