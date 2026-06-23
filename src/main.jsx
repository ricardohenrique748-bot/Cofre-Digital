import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Dentro do app nativo (Capacitor) a página é servida de capacitor://localhost,
// então caminhos relativos não chegam ao backend — usamos a URL pública do
// deploy na Vercel. No navegador comum, caminho relativo funciona (mesma origem).
const API_BASE = window.Capacitor?.isNativePlatform()
  ? "https://cofre-digital-liart.vercel.app"
  : "";

// window.storage não existe nativamente no navegador — este app espera essa API
// (get/set assíncronos). Aqui ela fala com /api/storage, que persiste no Neon.
window.storage = {
  async get(key) {
    const res = await fetch(`${API_BASE}/api/storage?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error("storage.get failed");
    const data = await res.json();
    return data.value == null ? null : { value: data.value };
  },
  async set(key, value) {
    const res = await fetch(`${API_BASE}/api/storage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error("storage.set failed");
    return true;
  },
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
