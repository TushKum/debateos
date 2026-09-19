import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import sheetRoutes from './routes/sheet.js';
import networkRoutes from './routes/network.js';
import aiRoutes from './routes/ai.js';
import tabRoutes from './routes/tab.js';
import { HttpError } from './lib/http.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ['https://docs.google.com', 'https://www.youtube-nocookie.com', 'https://www.youtube.com'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  // Camera + mic are needed by the AI arena.
  permissionsPolicy: false
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
  next();
});
if (process.env.CORS_ORIGIN) app.use('/api', cors({ origin: process.env.CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '600kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'DebateOS API' }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sheet', sheetRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/tab', tabRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(here, '..', 'public'), { extensions: ['html'] }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.code === '23505') return res.status(409).json({ error: 'That already exists' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;
