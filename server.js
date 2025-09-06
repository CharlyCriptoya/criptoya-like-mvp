// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

// ——— Setup de paths y app ———
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
// Servir archivos estáticos desde /public
app.use(express.static(path.join(__dirname, "public")));

// Pequeño helper para no cachear las respuestas de API
app.use("/api", (_req, res, next) =>
