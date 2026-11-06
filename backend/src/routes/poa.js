const router = require('express').Router();
const ctrl   = require('../controllers/poaController');
const { authenticate, authorize } = require('../middleware/auth');

// Control del POA: solo administradores
router.use(authenticate, authorize('admin'));

router.get('/',                         ctrl.listar);
router.put('/proyectos/:id/bloqueo',    ctrl.bloqueo);
router.post('/bloquear-todos',          ctrl.bloquearTodos);
router.post('/desbloquear-todos',       ctrl.desbloquearTodos);
router.put('/cierre',                   ctrl.programarCierre);

module.exports = router;
