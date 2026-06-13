const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/taskController');
const { authenticate, denyProjectViewer } = require('../middleware/auth');
const { uploadTask, uploadSGC } = require('../middleware/upload');

router.use(authenticate);

// Solo lectura — permitido a todos
router.get('/',    ctrl.getByProject);
router.get('/:id', ctrl.getById);

// Escritura — bloqueado para viewers del proyecto
router.post('/',              denyProjectViewer, ctrl.create);
router.patch('/positions',    denyProjectViewer, ctrl.updatePositions);
router.put('/:id',            denyProjectViewer, ctrl.update);
router.delete('/:id',         denyProjectViewer, ctrl.delete);

router.post('/:id/comments',                denyProjectViewer, ctrl.addComment);
router.delete('/:id/comments/:commentId',   denyProjectViewer, ctrl.deleteComment);

router.post('/:id/attachments',                    denyProjectViewer, uploadTask.single('file'), ctrl.uploadAttachment);
router.delete('/:id/attachments/:attachmentId',    denyProjectViewer, ctrl.deleteAttachment);

router.post('/:id/sgc-attachments',                denyProjectViewer, uploadSGC.single('file'), ctrl.uploadSGCAttachment);
router.delete('/:id/sgc-attachments/:attachmentId', denyProjectViewer, ctrl.deleteSGCAttachment);

module.exports = router;
