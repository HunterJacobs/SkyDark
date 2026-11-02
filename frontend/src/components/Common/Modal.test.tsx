import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Modal from "./Modal";

afterEach(cleanup);
describe("Modal", () => {
  it("names the dialog, contains keyboard focus, and closes on Escape", async () => {
    const close = vi.fn();
    render(<Modal open onClose={close} title="Edit event"><input aria-label="Title" /><button>Save</button></Modal>);
    const dialog = screen.getByRole("dialog", { name: "Edit event" });
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    screen.getByRole("button", { name: "Save" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
});
