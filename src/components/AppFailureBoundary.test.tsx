// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppFailureBoundary from "./AppFailureBoundary";

function dispatchUnhandledRejection(reason: unknown): PromiseRejectionEvent {
  const event = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => cleanup());

describe("AppFailureBoundary", () => {
  it("fails closed on an unhandled promise rejection and can remount the app", () => {
    render(
      createElement(
        AppFailureBoundary,
        null,
        createElement("div", null, "Nội dung ứng dụng"),
      ),
    );

    let event!: PromiseRejectionEvent;
    act(() => {
      event = dispatchUnhandledRejection(new Error("IndexedDB unavailable"));
    });

    expect(event.defaultPrevented).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Không tải được dữ liệu ứng dụng" }),
    ).toBeTruthy();
    expect(screen.queryByText("Nội dung ứng dụng")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(screen.getByText("Nội dung ứng dụng")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores expected AbortError cancellations", () => {
    render(
      createElement(
        AppFailureBoundary,
        null,
        createElement("div", null, "Nội dung ứng dụng"),
      ),
    );

    let event!: PromiseRejectionEvent;
    act(() => {
      event = dispatchUnhandledRejection({ name: "AbortError" });
    });

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByText("Nội dung ứng dụng")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
