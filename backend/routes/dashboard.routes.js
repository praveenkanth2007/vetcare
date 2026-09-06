const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');

router.use(authenticate);
router.get('/summary', ctrl.summary);

module.exports = router;
