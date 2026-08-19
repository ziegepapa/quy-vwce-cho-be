import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { LocaleProvider } from "./lib/locale";
import App from "./App";
import AppFailureBoundary from "./components/AppFailureBoundary";
import ModalAccessibilityManager from "./components/ModalAccessibilityManager";
import "./index.css";
import "./styles/goals.css";
import "./styles/settings-v9.css";
import "./styles/ai-trace.css";
import "./styles/accessibility-foundations.css";
import "./styles/overview-v10.css";
import "./styles/visual-abc-shell.css";
import "./styles/visual-abc-screens.css";
import "./styles/demo-v10-primitives.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppFailureBoundary>
      <HashRouter>
        <AuthProvider>
          <LocaleProvider>
            <ModalAccessibilityManager />
            <App />
          </LocaleProvider>
        </AuthProvider>
      </HashRouter>
    </AppFailureBoundary>
  </StrictMode>,
);
