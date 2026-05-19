import type { Edge, Node } from "@xyflow/react";

export type GraphNodeType =
  | "directory"
  | "source_file"
  | "component"
  | "api_route"
  | "config_file"
  | "schema_file"
  | "external_dependency";

export type GraphEdgeType = "imports" | "depends_on" | "contains" | "configured_by";

export type RepoGraphNodeData = Record<string, unknown> & {
  label?: string;
  path?: string;
  summary?: string | null;
  nodeType?: GraphNodeType | string;
  fileId?: string;
  role?: string;
  language?: string | null;
  imports?: string[];
  unresolvedImports?: string[];
  routeKind?: string;
  highlightState?: "selected" | "connected" | "dimmed" | "default";
};

export type RepoGraphNode = Node<RepoGraphNodeData, string>;

export type RepoGraphEdgeData = Record<string, unknown> & {
  edgeType?: GraphEdgeType | string;
  confidence?: number;
  specifier?: string;
  importedName?: string;
  highlightState?: "connected" | "dimmed" | "default";
};

export type RepoGraphEdge = Edge<RepoGraphEdgeData>;

export type RepoGraphApiData = {
  nodes: RepoGraphNode[];
  edges: RepoGraphEdge[];
};
