const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/taskController');
const { authenticate, denyProjectViewer } = require('../middleware/auth');
const { uploadTask, uploadSGC } = require('../middleware/upload');

router.use(authenticate);

// Solo lectura — permitido a todos
// Las rutas literales van antes que '/:id' para que Express no las
// interprete como un id de tarea.
router.get('/',                ctrl.getByProject);
router.get('/archived-count',  ctrl.archivedCount);
router.get('/:id',             ctrl.getById);
// Descarga con sesión: los archivos de Drive no son públicos
router.get('/:id/attachments/:attachmentId/download', ctrl.downloadAttachment);

// Escritura — bloqueado para viewers del proyecto
router.post('/',                    denyProjectViewer, ctrl.create);
router.patch('/positions',          denyProjectViewer, ctrl.updatePositions);
router.post('/archive-completed',   denyProjectViewer, ctrl.archiveCompleted);
router.patch('/:id/archive',        denyProjectViewer, ctrl.archive);
router.patch('/:id/unarchive',      denyProjectViewer, ctrl.unarchive);
router.put('/:id',                  denyProjectViewer, ctrl.update);
router.delete('/:id',               denyProjectViewer, ctrl.delete);

router.post('/:id/comments',                denyProjectViewer, ctrl.addComment);
router.delete('/:id/comments/:commentId',   denyProjectViewer, ctrl.deleteComment);

router.post('/:id/attachments',                    denyProjectViewer, uploadTask.single('file'), ctrl.uploadAttachment);
router.delete('/:id/attachments/:attachmentId',    denyProjectViewer, ctrl.deleteAttachment);

router.post('/:id/sgc-attachments',                denyProjectViewer, uploadSGC.single('file'), ctrl.uploadSGCAttachment);
router.delete('/:id/sgc-attachments/:attachmentId', denyProjectViewer, ctrl.deleteSGCAttachment);

module.exports = router;
