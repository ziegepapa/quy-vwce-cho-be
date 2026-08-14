import { Component, Fragment, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  title: string;
  message: string;
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

export default class PageFailureBoundary extends Component<Props, State> {
  state: State = {
    failed: false,
    resetKey: 0,
  };

  static getDerivedStateFromError(): Pick<State, "failed"> {
    return { failed: true };
  }

  componentDidMount() {
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection, true);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection, true);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isExpectedAbort(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
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
        <section className="empty card" role="alert">
          <h1 className="page-title">{this.props.title}</h1>
          <p>{this.props.message}</p>
          <button type="button" onClick={this.retry}>Thử lại</button>
        </section>
      );
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
