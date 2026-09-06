const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.put('/profile', authenticate, ctrl.updateProfile);
router.post('/verify-password', authenticate, ctrl.verifyPassword);

module.exports = router;
