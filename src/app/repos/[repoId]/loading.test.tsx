import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("RepoDashboard loading", () => {
  it("renders a dashboard loading state", () => {
    render(<Loading />);

    expect(screen.getByText("Loading repository dashboard...")).toBeInTheDocument();
  });
});
