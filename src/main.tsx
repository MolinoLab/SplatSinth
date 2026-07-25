import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./ui/App";
import { applyUiSettings, loadUiSettings } from "./ui/settings";

// Antes del primer pintado, para que un acento guardado no llegue tarde.
applyUiSettings(loadUiSettings());

// Sin StrictMode a propósito: el doble montaje de desarrollo crearía dos
// contextos WebGL y dos AudioContext por cada arranque.
createRoot(document.getElementById("root")!).render(<App />);
