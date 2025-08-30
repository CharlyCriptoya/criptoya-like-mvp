// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Servir archivos estáticos desde la carpeta raíz del repo
app.use(express.static(__dirname));

// Ruta raíz -> envía index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// (opcional) chequeo simple
app.get('/health', (_req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
