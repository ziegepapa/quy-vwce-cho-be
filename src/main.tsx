import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import App from "./App";
import "./index.css";
import "./styles/dock.css";
import "./styles/nav.css";
import "./styles/bento.css";
import "./styles/goals.css";
import "./styles/overview-v8.css";
import "./styles/settings-v9.css";
import "./styles/pulse-locked-v2.css";
import "./styles/ai-trace.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
