const express = require('express');
const router = express.Router();

router.get('/start', (req, res) => res.send('eBay OAuth start placeholder - implement server-side'));
router.get('/callback', (req, res) => res.send('eBay OAuth callback placeholder'));

module.exports = router;
