const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/checklistController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/',           ctrl.getItems);
router.post('/',          ctrl.addItem);
router.patch('/:item_id', ctrl.updateItem);
router.delete('/:item_id',ctrl.deleteItem);

module.exports = router;
