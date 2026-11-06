const router = require('express').Router();
const ctrl = require('../controllers/auditoriaController');
const { authenticate, authorize } = require('../middleware/auth');

// Solo administradores
router.use(authenticate, authorize('admin'));

router.get('/',           ctrl.listar);
router.get('/export.csv', ctrl.exportarCsv);

module.exports = router;
