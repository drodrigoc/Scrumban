const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const {
  limiteLoginCuenta, limiteLoginCorreo, limiteLoginIP, limiteRecuperacion, limiteRestablecer,
} = require('../middleware/seguridad');

router.post('/login', limiteLoginIP, limiteLoginCorreo, limiteLoginCuenta, ctrl.login);
router.post('/forgot-password', limiteRecuperacion, ctrl.forgotPassword);
router.post('/reset-password', limiteRestablecer, ctrl.resetPassword);
router.get('/me', authenticate, ctrl.getMe);

module.exports = router;
