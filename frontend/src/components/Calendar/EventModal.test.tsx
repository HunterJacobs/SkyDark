import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("../../contexts/AppContext", () => ({ useAppContext: () => ({ addFamilyMember: vi.fn() }) }));
vi.mock("../../contexts/SkydarkDataContext", () => ({ useSkydarkDataContext: () => null }));
import EventModal from "./EventModal";
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);
describe("Event form", () => {
  it("preserves the form until the caller confirms a save", () => {
    const save = vi.fn(), close = vi.fn();
    render(<EventModal open onClose={close} onSave={save} familyMembers={[]} error="Could not save" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Event title" }), { target: { value: "Dentist" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(save).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Could not save");
  });
  it("rejects an end before the start", () => {
    const save = vi.fn();
    render(<EventModal open onClose={() => {}} onSave={save} familyMembers={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Event title" }), { target: { value: "Dentist" } });
    fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "2026-11-01T12:00" } });
    fireEvent.change(screen.getByLabelText("Event ends"), { target: { value: "2026-11-01T11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("end time after");
  });
});
