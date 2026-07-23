const express = require('express');
const router = express.Router();
const idebController = require('../controllers/idebController');
const { requireAuth } = require('../middleware/auth');

// All iDEB routes require login
router.use(requireAuth);

// ─── Reference Data ────────────────────────────────────────────────────────────
router.get('/kantor',       idebController.getKantor);
router.get('/ref-kondisi',  idebController.getRefKondisi);
router.get('/user-info',    idebController.getUserInfo);
router.get('/users',        idebController.getAllUsers);
router.get('/stats',        idebController.getStats);
router.get('/search-ref',   idebController.searchRefSuggestions);

// ─── Query ─────────────────────────────────────────────────────────────────────
router.post('/query', idebController.queryByRef);

// ─── Import ────────────────────────────────────────────────────────────────────
router.post('/import-csv',     idebController.uploadMiddleware, idebController.importData);
router.post('/import-records', idebController.importRecords);
router.post('/import-kantor',  idebController.upsertKantor);
router.post('/import-users',   idebController.upsertUsers);

module.exports = router;
