const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const auth = require('../middleware/auth');

// All history routes require authentication
router.use(auth);

router.get('/', historyController.getHistory);
router.get('/:id', historyController.getHistoryDetails);
router.delete('/:id', historyController.deleteHistory);

module.exports = router;
