import { createRoot } from "react-dom/client";
import LocalMemberManagement from "../../src/components/LocalMemberManagement";
import type { AppLocale } from "../../src/lib/locale";
const root = createRoot(document.getElementById("root")!);
Object.assign(window, { mountMu3: (ownerId: string, token: string, locale: AppLocale) => root.render(<LocalMemberManagement key={ownerId} ownerId={ownerId} token={token} locale={locale}/>) });
