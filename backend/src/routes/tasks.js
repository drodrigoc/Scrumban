const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/taskController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/', ctrl.getByProject);
router.post('/', ctrl.create);
router.patch('/positions', ctrl.updatePositions);

router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

router.post('/:id/comments', ctrl.addComment);
router.delete('/:id/comments/:commentId', ctrl.deleteComment);

router.post('/:id/attachments', upload.single('file'), ctrl.uploadAttachment);
router.delete('/:id/attachments/:attachmentId', ctrl.deleteAttachment);

module.exports = router;
