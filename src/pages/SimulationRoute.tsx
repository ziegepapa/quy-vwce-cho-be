import { useLayoutEffect, useState } from "react";
import PageFailureBoundary from "../components/PageFailureBoundary";
import { isRecoverableOperationError } from "../lib/operationErrors";
import { useLocale } from "../lib/locale";
import Simulation from "./Simulation";
import "../styles/simulation-operation-errors.css";

function SimulationOperationGuard() {
  const { locale } = useLocale();
  const [operationError, setOperationError] = useState(false);

  useLayoutEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isRecoverableOperationError(event.reason, "settings-save")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOperationError(true);
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection, true);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection, true);
  }, []);

  return (
    <>
      {operationError ? (
        <div className="simulation-operation-error banner error" role="alert">
          <span>
            {locale === "de" ? "Simulationseinstellungen konnten nicht gespeichert werden. Der aktuelle Plan wurde nicht verändert. Versuchen Sie es erneut über Speichern oder Rückgängig." : "Không lưu được thay đổi của Mô phỏng. Kế hoạch hiện tại chưa bị thay đổi. Hãy thử lại bằng nút Lưu hoặc Hoàn tác."}
          </span>
          <button type="button" className="secondary" onClick={() => setOperationError(false)}>
            {locale === "de" ? "Hinweis schließen" : "Đóng thông báo"}
          </button>
        </div>
      ) : null}
      <Simulation />
    </>
  );
}

export default function SimulationRoute() {
  const { locale } = useLocale();
  const text = locale === "de" ? {
    title: "Simulation konnte nicht geladen werden",
    message: "Die Daten auf diesem Gerät bleiben unverändert. Bitte laden Sie die Simulation erneut.",
    retry: "Erneut versuchen",
  } : {
    title: "Không tải được Mô phỏng",
    message: "Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại trang Mô phỏng.",
    retry: "Thử lại",
  };
  return (
    <PageFailureBoundary
      title={text.title}
      message={text.message}
      retryLabel={text.retry}
    >
      <SimulationOperationGuard />
    </PageFailureBoundary>
  );
}
