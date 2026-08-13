import { Component, Fragment, type ReactNode } from "react";

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
    if (this.state.failed) {
      return (
        <main style={{ padding: 16 }}>
          <section
            className="empty card"
            role="alert"
            style={{ margin: "clamp(24px, 8vh, 72px) auto", maxWidth: 560 }}
          >
            <h1 className="page-title">Không tải được dữ liệu ứng dụng</h1>
            <p>Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại trang hiện tại.</p>
            <button type="button" onClick={this.retry}>Thử lại</button>
          </section>
        </main>
      );
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
