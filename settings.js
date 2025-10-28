const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const AES_KEY = (process.env.AES_KEY || 'replace_with_32byte_secret_key').slice(0, 32);
const encrypt = (text = '') => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(AES_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

router.post('/', async (req, res) => {
  try {
    const { stripeSecret, ebayClientId, ebaySecret } = req.body || {};
    await prisma.paymentSettings.upsert({
      where: { id: 1 },
      update: {
        stripeSecret: encrypt(stripeSecret),
        ebayClientId,
        ebaySecret: encrypt(ebaySecret)
      },
      create: {
        stripeSecret: encrypt(stripeSecret),
        ebayClientId,
        ebaySecret: encrypt(ebaySecret)
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
