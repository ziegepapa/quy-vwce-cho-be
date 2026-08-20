import { Component, Fragment, type ReactNode } from "react";
import { useLocale } from "../lib/locale";

type Props = {
  children: ReactNode;
};

type State = {
  failed: boolean;
  resetKey: number;
};

function isExpectedAbort(reason: unknown): boolean {
  return Boolean(
    reason
      && typeof reason === "object"
      && "name" in reason
      && reason.name === "AbortError",
  );
}

function AppFailureFallback({ onRetry }: { onRetry: () => void }) {
  const { locale } = useLocale();
  const text = locale === "de" ? {
    title: "Anwendungsdaten konnten nicht geladen werden",
    message: "Die Daten auf diesem Gerät bleiben unverändert. Bitte laden Sie die aktuelle Seite erneut.",
    retry: "Erneut versuchen",
  } : {
    title: "Không tải được dữ liệu ứng dụng",
    message: "Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại trang hiện tại.",
    retry: "Thử lại",
  };
  return (
    <main style={{ padding: 16 }}>
      <section
        className="empty card"
        role="alert"
        style={{ margin: "clamp(24px, 8vh, 72px) auto", maxWidth: 560 }}
      >
        <h1 className="page-title">{text.title}</h1>
        <p>{text.message}</p>
        <button type="button" onClick={onRetry}>{text.retry}</button>
      </section>
    </main>
  );
}

export default class AppFailureBoundary extends Component<Props, State> {
  state: State = {
    failed: false,
    resetKey: 0,
  };

  static getDerivedStateFromError(): Pick<State, "failed"> {
    return { failed: true };
  }

  componentDidMount() {
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isExpectedAbort(event.reason)) return;
    event.preventDefault();
    this.setState({ failed: true });
  };

  private retry = () => {
    this.setState((state) => ({
      failed: false,
      resetKey: state.resetKey + 1,
    }));
  };

  render() {
    if (this.state.failed) return <AppFailureFallback onRetry={this.retry} />;

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
