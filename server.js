import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import chatRoutes from "./server/routes/chat.js";
import workstationRoutes from "./server/routes/workstation.js";
import governmentRoutes from "./server/routes/government.js";
import economyRoutes from "./server/routes/economy.js";
import landsRoutes from "./server/routes/lands.js";
import casinoRoutes from "./server/routes/casino.js";
import minesRoutes from "./server/routes/mines.js";
import mailRoutes from "./server/routes/mail.js";
import dungeonRoutes from "./server/routes/dungeon.js";
import ptcRoutes from "./server/routes/ptc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Modular API routers (backed by persistent server DB)
app.use("/api/chat", chatRoutes);
app.use("/api/workstation", workstationRoutes);
app.use("/api/government", governmentRoutes);
app.use("/api/economy", economyRoutes);
app.use("/api/lands", landsRoutes);
app.use("/api/casino", casinoRoutes);
app.use("/api/mines", minesRoutes);
app.use("/api/mail", mailRoutes);
app.use("/api/dungeon", dungeonRoutes);
app.use("/api/ptc", ptcRoutes);

// Expose runtime Firebase configuration dynamically
app.get("/api/config.js", (req, res) => {
  res.type("application/javascript");
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBcjcNzMLCv-jSCpy9N29GmEESVqRn_xRU",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "kwanzaclick.firebaseapp.com",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://kwanzaclick-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: process.env.FIREBASE_PROJECT_ID || "kwanzaclick",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "kwanzaclick.appspot.com",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "140060118241",
    appId: process.env.FIREBASE_APP_ID || "1:140060118241:web:3fdf84bb8654844a74bba0",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-QC255LPQWN"
  };
  res.send(`window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};`);
});

// Serve static assets from project root
app.use(express.static(__dirname, {
  extensions: ["html", "htm"]
}));

// Fallback to index.html for client-side navigation
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kwanza Live dev server running at http://0.0.0.0:${PORT}`);
  });
}

export default app;
