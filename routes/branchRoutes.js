const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, branchController.getBranches);
router.post('/', requireAuth, branchController.createBranch);
router.put('/:id', requireAuth, branchController.updateBranch);
router.delete('/:id', requireAuth, branchController.deleteBranch);

module.exports = router;
