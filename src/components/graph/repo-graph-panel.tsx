"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";

import { Button, Card, CardDescription, CardHeader, CardTitle, ErrorState, Input } from "@/components/ui";
import type { ApiResponse } from "@/lib/api-response";
import { cn } from "@/lib/styles";

import { GraphLegend } from "./graph-legend";
import type { GraphNodeType, RepoGraphApiData, RepoGraphEdge } from "./graph-types";
import { NodeDetailDrawer } from "./node-detail-drawer";
import { graphNodeType, RepoGraphNodeComponent } from "./repo-graph-node";

const graphNodeTypes: NodeTypes = {
  api_route: RepoGraphNodeComponent,
  component: RepoGraphNodeComponent,
  config_file: RepoGraphNodeComponent,
  directory: RepoGraphNodeComponent,
  external_dependency: RepoGraphNodeComponent,
  schema_file: RepoGraphNodeComponent,
  source_file: RepoGraphNodeComponent,
};

const filterNodeTypes: GraphNodeType[] = [
  "directory",
  "source_file",
  "component",
  "api_route",
  "config_file",
  "schema_file",
  "external_dependency",
];

export function RepoGraphPanel({ repoId }: { repoId: string }) {
  return (
    <ReactFlowProvider>
      <RepoGraphPanelInner repoId={repoId} />
    </ReactFlowProvider>
  );
}

function RepoGraphPanelInner({ repoId }: { repoId: string }) {
  const { fitView } = useReactFlow();
  const [data, setData] = useState<RepoGraphApiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isIncomplete, setIsIncomplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<GraphNodeType>>(
    () => new Set(filterNodeTypes),
  );

  useEffect(() => {
    let isMounted = true;

    async function loadGraph() {
      setIsLoading(true);
      setError(null);
      setIsIncomplete(false);

      try {
        const response = await fetch(`/api/repos/${repoId}/graph`);
        const payload = (await response.json()) as ApiResponse<RepoGraphApiData>;

        if (!isMounted) {
          return;
        }

        if (payload.ok) {
          setData(payload.data);
          return;
        }

        if (payload.error.code === "analysis_incomplete") {
          setIsIncomplete(true);
          setData(null);
          return;
        }

        setError(payload.error.message);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Graph data could not be loaded.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadGraph();

    return () => {
      isMounted = false;
    };
  }, [repoId]);

  const selectedNode = useMemo(
    () => data?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [data?.nodes, selectedNodeId],
  );
  const connectedNodeIds = useMemo(
    () => (selectedNodeId && data ? connectedNodes(selectedNodeId, data.edges) : new Set<string>()),
    [data, selectedNodeId],
  );
  const visibleGraph = useMemo(
    () => filterGraph(data, query, visibleTypes, selectedNodeId, connectedNodeIds),
    [connectedNodeIds, data, query, selectedNodeId, visibleTypes],
  );

  function resetGraph() {
    setQuery("");
    setSelectedNodeId(null);
    setVisibleTypes(new Set(filterNodeTypes));
    window.requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }

  function toggleNodeType(type: GraphNodeType) {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  return (
    <section className="space-y-4" aria-labelledby="knowledge-graph-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Knowledge graph</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="knowledge-graph-heading">
            Repository dependency map
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Explore important files, directories, routes, schemas, and external dependencies.
          </p>
        </div>
        <Button onClick={resetGraph} variant="secondary">
          Reset graph view
        </Button>
      </div>

      <Card className="space-y-5">
        <CardHeader className="mb-0">
          <CardTitle>Interactive graph</CardTitle>
          <CardDescription>
            Search and filter the graph, then select a node to inspect its context.
          </CardDescription>
        </CardHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Search graph
              <Input
                aria-label="Search graph"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find file or module"
                value={query}
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-950">Filter by type</legend>
              <div className="grid gap-2">
                {filterNodeTypes.map((type) => (
                  <label className="flex items-center gap-2 text-sm text-slate-700" key={type}>
                    <input
                      checked={visibleTypes.has(type)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-950"
                      onChange={() => toggleNodeType(type)}
                      type="checkbox"
                    />
                    <span>Show {labelForFilter(type)} nodes</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-md bg-white p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-950">{nodeCountLabel(visibleGraph.nodes.length, data?.nodes.length ?? 0)}</p>
              <p>{edgeCountLabel(visibleGraph.edges.length)}</p>
            </div>
          </aside>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="min-h-[520px] overflow-hidden rounded-md border border-slate-200 bg-white">
              {isLoading ? (
                <GraphMessage title="Loading graph..." message="Fetching stored graph nodes and edges." />
              ) : isIncomplete ? (
                <GraphMessage
                  title="Knowledge graph is still being built."
                  message="The analysis has not stored graph rows for this repository yet."
                />
              ) : error ? (
                <div className="p-4">
                  <ErrorState title="Graph unavailable" message={error} />
                </div>
              ) : visibleGraph.nodes.length === 0 ? (
                <GraphMessage
                  title="No graph nodes match the current filters."
                  message="Try clearing the search or enabling more node types."
                />
              ) : (
                <ReactFlow
                  edges={visibleGraph.edges}
                  fitView
                  minZoom={0.15}
                  nodeTypes={graphNodeTypes}
                  nodes={visibleGraph.nodes}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                >
                  <Background />
                  <Controls />
                  <MiniMap pannable zoomable />
                </ReactFlow>
              )}
            </div>

            {selectedNode ? (
              <NodeDetailDrawer
                connectedCount={connectedNodeIds.size}
                node={selectedNode}
                onClose={() => setSelectedNodeId(null)}
              />
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                Select a graph node to inspect its path, summary, imports, and related files.
              </div>
            )}
          </div>
        </div>

        <GraphLegend />
      </Card>
    </section>
  );
}

function filterGraph(
  data: RepoGraphApiData | null,
  query: string,
  visibleTypes: Set<GraphNodeType>,
  selectedNodeId: string | null,
  connectedNodeIds: Set<string>,
): RepoGraphApiData {
  if (!data) {
    return { edges: [], nodes: [] };
  }

  const normalizedQuery = query.trim().toLowerCase();
  const nodes = data.nodes
    .filter((node) => visibleTypes.has(graphNodeType(node.data.nodeType ?? node.type)))
    .filter((node) => {
      if (!normalizedQuery) {
        return true;
      }

      const label = stringValue(node.data.label).toLowerCase();
      const path = stringValue(node.data.path).toLowerCase();
      return label.includes(normalizedQuery) || path.includes(normalizedQuery);
    });
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = data.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));

  return {
    edges: edges.map((edge) => {
      const isConnected = Boolean(selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId));
      return {
        ...edge,
        animated: isConnected,
        className: cn(edge.className, selectedNodeId && !isConnected && "opacity-20"),
        data: {
          ...edge.data,
          highlightState: isConnected ? "connected" : selectedNodeId ? "dimmed" : "default",
        },
        label: edge.label,
        style: {
          ...edge.style,
          stroke: isConnected ? "#0f172a" : "#94a3b8",
          strokeWidth: isConnected ? 2 : 1.5,
        },
      };
    }),
    nodes: nodes.map((node) => {
      const highlightState =
        !selectedNodeId || node.id === selectedNodeId
          ? "default"
          : connectedNodeIds.has(node.id)
            ? "connected"
            : "dimmed";

      return {
        ...node,
        data: {
          ...node.data,
          highlightState,
        },
        selected: node.id === selectedNodeId,
      };
    }),
  };
}

function connectedNodes(nodeId: string, edges: RepoGraphEdge[]): Set<string> {
  const nodeIds = new Set<string>();

  for (const edge of edges) {
    if (edge.source === nodeId) {
      nodeIds.add(edge.target);
    }
    if (edge.target === nodeId) {
      nodeIds.add(edge.source);
    }
  }

  return nodeIds;
}

function GraphMessage({ message, title }: { message: string; title: string }) {
  return (
    <div className="flex min-h-[520px] items-center justify-center p-6 text-center">
      <div>
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      </div>
    </div>
  );
}

function labelForFilter(type: GraphNodeType): string {
  const labels: Record<GraphNodeType, string> = {
    api_route: "API route",
    component: "component",
    config_file: "config file",
    directory: "directory",
    external_dependency: "external dependency",
    schema_file: "schema file",
    source_file: "source file",
  };

  return labels[type];
}

function nodeCountLabel(visibleCount: number, totalCount: number): string {
  if (visibleCount === totalCount) {
    return `${totalCount} ${totalCount === 1 ? "node" : "nodes"}`;
  }

  return `${visibleCount} of ${totalCount} nodes`;
}

function edgeCountLabel(count: number): string {
  return `${count} ${count === 1 ? "edge" : "edges"}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
