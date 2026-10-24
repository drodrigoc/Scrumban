const router = require('express').Router();
const ctrl   = require('../controllers/settingsController');
const { authenticate, authorize } = require('../middleware/auth');

// Google redirige el navegador aquí tras el inicio de sesión: no lleva
// token de sesión, se valida con el "state" firmado. Va antes del
// middleware de autenticación.
router.get('/email/oauth/callback', ctrl.oauthCallback);

router.use(authenticate, authorize('admin'));

router.get('/email',              ctrl.getEmail);
router.put('/email',              ctrl.updateEmail);
router.delete('/email',           ctrl.disconnect);
router.post('/email/oauth/start', ctrl.startOAuth);
router.post('/email/test',        ctrl.testEmail);
router.post('/email/retry',       ctrl.retryFailed);

module.exports = router;
