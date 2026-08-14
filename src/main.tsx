import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import App from "./App";
import AppFailureBoundary from "./components/AppFailureBoundary";
import ModalAccessibilityManager from "./components/ModalAccessibilityManager";
import "./index.css";
import "./styles/dock.css";
import "./styles/nav.css";
import "./styles/bento.css";
import "./styles/goals.css";
import "./styles/overview-v8.css";
import "./styles/settings-v9.css";
import "./styles/pulse-locked-v2.css";
import "./styles/ai-trace.css";
import "./styles/premium-dark-full.css";
import "./styles/aurora-theme.css";
import "./styles/overview-focal-merge.css";
import "./styles/night-ledger.css";
import "./styles/dark-screen-finish.css";
import "./styles/accessibility-foundations.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppFailureBoundary>
      <HashRouter>
        <AuthProvider>
          <ModalAccessibilityManager />
          <App />
        </AuthProvider>
      </HashRouter>
    </AppFailureBoundary>
  </StrictMode>,
);
