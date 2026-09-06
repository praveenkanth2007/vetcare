const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/payments.controller');

router.use(authenticate);
router.get('/pending', ctrl.pending);
router.get('/:admissionId/history', ctrl.history);
router.post('/:admissionId/pay', ctrl.recordPayment);
router.post('/:admissionId/mark-paid', ctrl.markPaid);

module.exports = router;
