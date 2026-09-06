const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/analytics.controller');

router.use(authenticate);
router.get('/animals', ctrl.speciesOverview);
router.get('/animals/:species', ctrl.speciesDetail);

module.exports = router;
