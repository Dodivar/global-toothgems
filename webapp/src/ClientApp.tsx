import { StrictMode } from "react";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import App from "./App";

/** The client entry point formerly mounted by `main.tsx` under Vite. */
export default function ClientApp() {
  return (
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}
