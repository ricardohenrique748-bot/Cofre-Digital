import { config } from "dotenv";
config({ path: ".env.local" });

import express from "express";
import storageHandler from "../api/storage.js";

const app = express();
app.use(express.json());
app.all("/api/storage", storageHandler);

const port = process.env.DEV_API_PORT || 3001;
app.listen(port, () => console.log(`Dev API listening on http://localhost:${port}`));
