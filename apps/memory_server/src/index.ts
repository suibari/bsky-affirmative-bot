import express from 'express';
import dotenv from 'dotenv';
import { initializeDatabases } from './db/index.js';
import { router } from './routes.js';

dotenv.config();

const app = express();
const PORT = process.env.MEMORY_SERVER_PORT || 3000;

app.use(express.json());

app.use('/', router);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  await initializeDatabases();
  app.listen(PORT, () => {
    console.log(`Memory Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
