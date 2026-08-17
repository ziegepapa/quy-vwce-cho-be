// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ModalAccessibilityManager from "./ModalAccessibilityManager";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Mở hộp thoại</button>
      <button type="button">Ngoài hộp thoại</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận">
          <button type="button">Tiếp tục</button>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>Hủy</button>
        </div>
      ) : null}
      <ModalAccessibilityManager />
    </>
  );
}

afterEach(() => cleanup());

describe("ModalAccessibilityManager", () => {
  it("focuses the safe action, traps Tab, closes with Escape and restores focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Mở hộp thoại" });
    // jsdom không di chuyển focus khi fireEvent.click → previousFocus sẽ là
    // document.body thay vì trigger. Gọi trigger.focus() trước để component
    // activate() ghi đúng previousFocus, đảm bảo Escape restore về trigger.
    trigger.focus();
    fireEvent.click(trigger);
    const cancel = await screen.findByRole("button", { name: "Hủy" });
    const proceed = screen.getByRole("button", { name: "Tiếp tục" });

    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(proceed);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns stray focus to the open modal", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Mở hộp thoại" }));
    const cancel = await screen.findByRole("button", { name: "Hủy" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    screen.getByRole("button", { name: "Ngoài hộp thoại" }).focus();

    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });
});
