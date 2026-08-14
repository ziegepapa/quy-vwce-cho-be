// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppFailureBoundary from "../components/AppFailureBoundary";
import { RecoverableOperationError } from "../lib/operationErrors";

vi.mock("./Simulation", () => ({
  default: () => createElement("div", null, "Nội dung Mô phỏng v2"),
}));

import SimulationRoute from "./SimulationRoute";

function dispatchUnhandledRejection(reason: unknown): PromiseRejectionEvent {
  const event = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
  return event;
}

function renderRoute() {
  return render(
    createElement(
      AppFailureBoundary,
      null,
      createElement(SimulationRoute),
    ),
  );
}

afterEach(() => cleanup());

describe("Simulation route failure boundary", () => {
  it("keeps a Simulation rejection inside the page and retries by remounting it", () => {
    renderRoute();

    let event!: PromiseRejectionEvent;
    act(() => {
      event = dispatchUnhandledRejection(new Error("SIMULATION_SECRET_CANARY"));
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("heading", { name: "Không tải được Mô phỏng" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Không tải được dữ liệu ứng dụng" })).toBeNull();
    expect(screen.queryByText("SIMULATION_SECRET_CANARY")).toBeNull();
    expect(screen.queryByText("Nội dung Mô phỏng v2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(screen.getByText("Nội dung Mô phỏng v2")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps recoverable save failures inside the loaded Simulation page", () => {
    renderRoute();

    let event!: PromiseRejectionEvent;
    act(() => {
      event = dispatchUnhandledRejection(
        new RecoverableOperationError("settings-save", new Error("SAVE_SECRET_CANARY")),
      );
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText("Nội dung Mô phỏng v2")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Không tải được Mô phỏng" })).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Kế hoạch hiện tại chưa bị thay đổi");
    expect(document.body.innerHTML).not.toContain("SAVE_SECRET_CANARY");

    fireEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores expected AbortError cancellations", () => {
    renderRoute();

    let event!: PromiseRejectionEvent;
    act(() => {
      event = dispatchUnhandledRejection({ name: "AbortError" });
    });

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByText("Nội dung Mô phỏng v2")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
