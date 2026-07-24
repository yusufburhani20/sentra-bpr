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
router.get('/dashboard-itsupport', idebController.getITSupportDashboard);
router.get('/search-ref',   idebController.searchRefSuggestions);

// ─── Query & List ──────────────────────────────────────────────────────────────
router.get('/query',       idebController.queryByRef);
router.post('/query',      idebController.queryByRef);
router.get('/list',        idebController.getIdebList);
router.delete('/delete-ref', idebController.deleteByRef);
router.post('/delete-ref',   idebController.deleteByRef);
router.put('/record/:id',    idebController.updateRecord);
router.post('/record/update/:id', idebController.updateRecord);

// ─── Import ────────────────────────────────────────────────────────────────────
router.post('/import-csv',     idebController.uploadMiddleware, idebController.importData);
router.post('/import-records', idebController.importRecords);
router.post('/create-manual',  idebController.createManualNihil);
router.post('/import-kantor',  idebController.upsertKantor);
router.post('/import-users',   idebController.upsertUsers);
router.post('/sync-txt-folder', idebController.syncTxtFolder);

module.exports = router;
