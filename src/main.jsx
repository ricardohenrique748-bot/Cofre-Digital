import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// window.storage não existe nativamente no navegador — este app espera essa API
// (get/set assíncronos), então a implementamos aqui por cima do localStorage.
window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value == null ? null : { value };
  },
  async set(key, value) {
    if (value === "" || value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
    return true;
  },
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
