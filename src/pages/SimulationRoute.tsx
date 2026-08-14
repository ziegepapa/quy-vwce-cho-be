import PageFailureBoundary from "../components/PageFailureBoundary";
import Simulation from "./Simulation";

export default function SimulationRoute() {
  return (
    <PageFailureBoundary
      title="Không tải được Mô phỏng"
      message="Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại trang Mô phỏng."
    >
      <Simulation />
    </PageFailureBoundary>
  );
}
