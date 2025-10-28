// RCMP123 / 123Sell — Render-ready backend (SQLite/Prisma + static frontend)
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const PORT = process.env.PORT || 3000;

// --- Serve frontend (static) ---
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    siteName: 'RCMP123',
    owners: [
      { name: 'Trevor Halverson', email: 'trevorhal88@gmail.com' },
      { name: 'ChatGPT (Sparq)', email: '' }
    ]
  });
});

// ---- Auth ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email+password required' });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'already exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, name, passwordHash: hash } });
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (e) {
    res.status(500).json({ error: 'register failed', details: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'invalid' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'no auth' });
  const token = h.split(' ')[1];
  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.userId = p.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// ---- Items CRUD ----
app.post('/api/items', auth, async (req, res) => {
  const { title, description, brand, model, category, price, imageUrl, shippingCost, shippingMethod } = req.body;
  if (!title || !price || !category) return res.status(400).json({ error: 'missing fields' });
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const item = await prisma.item.create({
    data: { title, description, brand, model, category, price, imageUrl, shippingCost, shippingMethod, sellerId: req.userId, expiresAt: expires }
  });
  res.json(item);
});

app.get('/api/items', async (req, res) => {
  const { status } = req.query;
  const where = status ? { status } : {};
  const items = await prisma.item.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(items);
});

app.post('/api/items/:id/renew', auth, async (req, res) => {
  const { price, imageUrl, shippingCost } = req.body;
  const id = Number(req.params.id);
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.sellerId !== req.userId) return res.status(403).json({ error: 'not owner' });
  const changed = (price && price !== item.price) || (imageUrl && imageUrl !== item.imageUrl) || (typeof shippingCost !== 'undefined' && shippingCost !== item.shippingCost);
  if (!changed) return res.status(400).json({ error: 'must change price, photo, or shippingCost' });
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const updated = await prisma.item.update({
    where: { id: item.id },
    data: {
      price: price ?? item.price,
      imageUrl: imageUrl ?? item.imageUrl,
      shippingCost: typeof shippingCost === 'undefined' ? item.shippingCost : shippingCost,
      status: 'listed',
      createdAt: new Date(),
      expiresAt: expires
    }
  });
  res.json(updated);
});

app.post('/api/expire-check', async (req, res) => {
  const now = new Date();
  const expired = await prisma.item.updateMany({ where: { status: 'listed', expiresAt: { lte: now } }, data: { status: 'expired' } });
  res.json({ updated: expired.count });
});

// ---- BlueBook ----
app.get('/api/bluebook', async (req, res) => {
  const { brand, model, qualityTier, category } = req.query;
  const where = {};
  if (brand) where.brand = { contains: brand, mode: 'insensitive' };
  if (model) where.model = { contains: model, mode: 'insensitive' };
  if (qualityTier) where.qualityTier = qualityTier;
  if (category) where.category = category;
  const entries = await prisma.blueBookEntry.findMany({ where, orderBy: { popularityScore: 'desc' } });
  res.json(entries);
});

app.get('/api/bluebook/suggested-price/:itemId', async (req, res) => {
  const id = Number(req.params.itemId);
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'not found' });
  const entries = await prisma.blueBookEntry.findMany({ where: { brand: item.brand || undefined, model: item.model || undefined, category: item.category } });
  if (entries.length === 0) return res.json({ suggestedPrice: item.price });
  const avg = Math.round(entries.reduce((s, e) => s + e.basePriceCents, 0) / entries.length);
  res.json({ suggestedPrice: avg });
});

// ---- Routes: settings & ebay OAuth (placeholders) ----
app.use('/api/save-settings', require('./routes/settings'));
app.use('/auth/ebay', require('./routes/ebay-auth'));

// Fallback to SPA (200.html) if exists, else index.html
app.get('*', (req, res) => {
  const fallback = path.join(FRONTEND_DIR, '200.html');
  const index = path.join(FRONTEND_DIR, 'index.html');
  res.sendFile(require('fs').existsSync(fallback) ? fallback : index);
});

app.listen(PORT, () => console.log(`🚀 RCMP123 server running on port ${PORT}`));
