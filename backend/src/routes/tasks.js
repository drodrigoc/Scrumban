const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/taskController');
const { authenticate, requireProjectAccess, requireTaskInProject } = require('../middleware/auth');
const { uploadTask, uploadSGC } = require('../middleware/upload');

// Toda ruta de tareas exige ver el proyecto, y toda ruta con :id exige
// que esa tarea sea de este proyecto
router.use(authenticate, requireProjectAccess('lectura'));
router.param('id', (req, res, next) => requireTaskInProject(req, res, next));

const escritura = requireProjectAccess('escritura');

// Lectura
// Las rutas literales van antes que '/:id' para que Express no las
// interprete como un id de tarea.
router.get('/',                ctrl.getByProject);
router.get('/archived-count',  ctrl.archivedCount);
router.get('/:id',             ctrl.getById);
// Descarga con sesión: los archivos no son públicos
router.get('/:id/attachments/:attachmentId/download', ctrl.downloadAttachment);

// Escritura — no para visores
router.post('/',                    escritura, ctrl.create);
router.post('/archive-completed',   escritura, ctrl.archiveCompleted);
router.patch('/:id/archive',        escritura, ctrl.archive);
router.patch('/:id/unarchive',      escritura, ctrl.unarchive);
router.put('/:id',                  escritura, ctrl.update);
router.delete('/:id',               escritura, ctrl.delete);

router.post('/:id/comments',                escritura, ctrl.addComment);
router.delete('/:id/comments/:commentId',   escritura, ctrl.deleteComment);

router.post('/:id/attachments',                    escritura, uploadTask.single('file'), ctrl.uploadAttachment);
router.delete('/:id/attachments/:attachmentId',    escritura, ctrl.deleteAttachment);

router.post('/:id/sgc-attachments',                escritura, uploadSGC.single('file'), ctrl.uploadSGCAttachment);
router.patch('/:id/sgc-attachments/:attachmentId', escritura, ctrl.reassignSGCAttachment);
router.delete('/:id/sgc-attachments/:attachmentId', escritura, ctrl.deleteSGCAttachment);

module.exports = router;
