import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoGraphEdge, RepoGraphNode } from "./graph-types";
import { RepoGraphPanel } from "./repo-graph-panel";

vi.mock("@xyflow/react", () => ({
  Background: () => <div data-testid="graph-background" />,
  Controls: () => <div aria-label="Pan and zoom controls" />,
  Handle: () => null,
  MiniMap: () => <div aria-label="Graph minimap" />,
  Position: {
    Bottom: "bottom",
    Top: "top",
  },
  ReactFlow: ({
    edges,
    nodes,
    onNodeClick,
    onPaneClick,
  }: {
    edges: RepoGraphEdge[];
    nodes: RepoGraphNode[];
    onNodeClick?: (event: unknown, node: RepoGraphNode) => void;
    onPaneClick?: () => void;
  }) => (
    <div aria-label="Repository dependency graph" role="img">
      <button onClick={onPaneClick} type="button">
        Clear graph selection
      </button>
      <div data-testid="rendered-nodes">
        {nodes.map((node) => (
          <button key={node.id} onClick={() => onNodeClick?.({}, node)} type="button">
            {String(node.data.label)}
          </button>
        ))}
      </div>
      <div data-testid="rendered-edges">
        {edges.map((edge) => (
          <span key={edge.id}>{edge.label}</span>
        ))}
      </div>
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({
    fitView: vi.fn(),
  }),
}));

const graphData = {
  nodes: [
    {
      id: "file:src/app/page.tsx",
      type: "component",
      data: {
        label: "page.tsx",
        path: "src/app/page.tsx",
        summary: "Main dashboard page.",
        nodeType: "component",
        role: "component",
        language: "TypeScript",
        imports: ["./layout"],
      },
      position: { x: 0, y: 0 },
    },
    {
      id: "file:src/app/layout.tsx",
      type: "source_file",
      data: {
        label: "layout.tsx",
        path: "src/app/layout.tsx",
        summary: "Root layout.",
        nodeType: "source_file",
        role: "source",
        language: "TypeScript",
      },
      position: { x: 220, y: 0 },
    },
    {
      id: "external:@xyflow/react",
      type: "external_dependency",
      data: {
        label: "@xyflow/react",
        path: "@xyflow/react",
        summary: null,
        nodeType: "external_dependency",
      },
      position: { x: 440, y: 0 },
    },
  ],
  edges: [
    {
      id: "imports:file:src/app/page.tsx->file:src/app/layout.tsx",
      source: "file:src/app/page.tsx",
      target: "file:src/app/layout.tsx",
      label: "imports",
      data: { edgeType: "imports", confidence: 0.95 },
    },
    {
      id: "depends_on:file:src/app/page.tsx->external:@xyflow/react",
      source: "file:src/app/page.tsx",
      target: "external:@xyflow/react",
      label: "depends_on",
      data: { edgeType: "depends_on", confidence: 0.8 },
    },
  ],
};

describe("RepoGraphPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true, data: graphData }),
      ok: true,
    }) as unknown as typeof fetch;
  });

  it("renders graph data with search, filters, controls, and legend", async () => {
    render(<RepoGraphPanel repoId="repo-uuid" />);

    expect(screen.getByText("Loading graph...")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Repository dependency graph" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search graph")).toBeInTheDocument();
    expect(screen.getByLabelText("Show component nodes")).toBeChecked();
    expect(screen.getByLabelText("Show source file nodes")).toBeChecked();
    expect(screen.getByLabelText("Show external dependency nodes")).toBeChecked();
    expect(screen.getByText("3 nodes")).toBeInTheDocument();
    expect(screen.getByText("2 edges")).toBeInTheDocument();
    expect(screen.getByText("Node types")).toBeInTheDocument();
    expect(screen.getByText("Edge types")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "page.tsx" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "layout.tsx" })).toBeInTheDocument();
  });

  it("opens node details and highlights the selected node neighborhood", async () => {
    render(<RepoGraphPanel repoId="repo-uuid" />);

    fireEvent.click(await screen.findByRole("button", { name: "page.tsx" }));

    const drawer = screen.getByRole("complementary", { name: "Node details" });
    expect(within(drawer).getByRole("heading", { name: "page.tsx" })).toBeInTheDocument();
    expect(within(drawer).getByText("src/app/page.tsx")).toBeInTheDocument();
    expect(within(drawer).getByText("Main dashboard page.")).toBeInTheDocument();
    expect(within(drawer).getByText("TypeScript")).toBeInTheDocument();
    expect(within(drawer).getByText("./layout")).toBeInTheDocument();
    expect(screen.getByText("Connected to 2 nodes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close node details" }));
    expect(screen.queryByRole("complementary", { name: "Node details" })).not.toBeInTheDocument();
  });

  it("filters nodes by search text", async () => {
    render(<RepoGraphPanel repoId="repo-uuid" />);

    await screen.findByRole("button", { name: "page.tsx" });
    fireEvent.change(screen.getByLabelText("Search graph"), { target: { value: "layout" } });

    expect(screen.queryByRole("button", { name: "page.tsx" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "layout.tsx" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3 nodes")).toBeInTheDocument();
  });

  it("filters nodes by node type", async () => {
    render(<RepoGraphPanel repoId="repo-uuid" />);

    await screen.findByRole("button", { name: "page.tsx" });
    fireEvent.click(screen.getByLabelText("Show component nodes"));

    expect(screen.queryByRole("button", { name: "page.tsx" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "layout.tsx" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "@xyflow/react" })).toBeInTheDocument();
  });

  it("shows an incomplete-analysis state when graph rows are not ready", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "analysis_incomplete", message: "Repository analysis is not ready yet." },
      }),
      ok: false,
    }) as unknown as typeof fetch;

    render(<RepoGraphPanel repoId="repo-uuid" />);

    expect(await screen.findByText("Knowledge graph is still being built.")).toBeInTheDocument();
  });

  it("shows an error state when graph loading fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure")) as unknown as typeof fetch;

    render(<RepoGraphPanel repoId="repo-uuid" />);

    expect(await screen.findByText("Graph unavailable")).toBeInTheDocument();
    expect(screen.getByText("Network failure")).toBeInTheDocument();
  });

  it("clears search, filters, and selection when reset is clicked", async () => {
    render(<RepoGraphPanel repoId="repo-uuid" />);

    fireEvent.click(await screen.findByRole("button", { name: "page.tsx" }));
    fireEvent.change(screen.getByLabelText("Search graph"), { target: { value: "layout" } });
    fireEvent.click(screen.getByLabelText("Show external dependency nodes"));
    fireEvent.click(screen.getByRole("button", { name: "Reset graph view" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Search graph")).toHaveValue("");
    });
    expect(screen.getByLabelText("Show external dependency nodes")).toBeChecked();
    expect(screen.queryByRole("complementary", { name: "Node details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "page.tsx" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "@xyflow/react" })).toBeInTheDocument();
  });
});
