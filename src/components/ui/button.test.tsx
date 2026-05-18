import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders as an accessible button with variant styling", () => {
    render(<Button variant="secondary">Start analysis</Button>);

    const button = screen.getByRole("button", { name: "Start analysis" });

    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("border");
  });
});
