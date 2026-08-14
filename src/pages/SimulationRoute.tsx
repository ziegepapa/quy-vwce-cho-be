import { useLayoutEffect, useState } from "react";
import PageFailureBoundary from "../components/PageFailureBoundary";
import { isRecoverableOperationError } from "../lib/operationErrors";
import Simulation from "./Simulation";
import "../styles/simulation-operation-errors.css";

function SimulationOperationGuard() {
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
            Không lưu được thay đổi của Mô phỏng. Kế hoạch hiện tại chưa bị thay đổi.
            Hãy thử lại bằng nút Lưu hoặc Hoàn tác.
          </span>
          <button type="button" className="secondary" onClick={() => setOperationError(false)}>
            Đóng thông báo
          </button>
        </div>
      ) : null}
      <Simulation />
    </>
  );
}

export default function SimulationRoute() {
  return (
    <PageFailureBoundary
      title="Không tải được Mô phỏng"
      message="Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại trang Mô phỏng."
    >
      <SimulationOperationGuard />
    </PageFailureBoundary>
  );
}
