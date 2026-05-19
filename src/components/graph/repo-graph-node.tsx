"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/styles";

import type { GraphNodeType, RepoGraphNode } from "./graph-types";

const nodeTypeStyles: Record<GraphNodeType, string> = {
  api_route: "border-cyan-300 bg-cyan-50 text-cyan-950",
  component: "border-emerald-300 bg-emerald-50 text-emerald-950",
  config_file: "border-amber-300 bg-amber-50 text-amber-950",
  directory: "border-slate-300 bg-slate-50 text-slate-950",
  external_dependency: "border-violet-300 bg-violet-50 text-violet-950",
  schema_file: "border-rose-300 bg-rose-50 text-rose-950",
  source_file: "border-blue-300 bg-blue-50 text-blue-950",
};

export function RepoGraphNodeComponent({ data, selected }: NodeProps<RepoGraphNode>) {
  const nodeType = graphNodeType(data.nodeType);
  const highlightState = data.highlightState ?? "default";

  return (
    <div
      className={cn(
        "min-w-36 max-w-52 rounded-md border px-3 py-2 shadow-sm transition-opacity",
        nodeTypeStyles[nodeType],
        selected && "ring-2 ring-slate-950 ring-offset-2",
        highlightState === "connected" && "ring-2 ring-slate-400 ring-offset-2",
        highlightState === "dimmed" && "opacity-35",
      )}
      title={typeof data.path === "string" ? data.path : undefined}
    >
      <Handle className="opacity-0" position={Position.Top} type="target" />
      <p className="truncate text-sm font-semibold">{stringValue(data.label, "Unknown")}</p>
      <p className="mt-1 truncate font-mono text-xs opacity-75">
        {labelForNodeType(nodeType)}
      </p>
      <Handle className="opacity-0" position={Position.Bottom} type="source" />
    </div>
  );
}

export function graphNodeType(value: unknown): GraphNodeType {
  switch (value) {
    case "api_route":
    case "component":
    case "config_file":
    case "directory":
    case "external_dependency":
    case "schema_file":
    case "source_file":
      return value;
    default:
      return "source_file";
  }
}

export function labelForNodeType(type: GraphNodeType): string {
  const labels: Record<GraphNodeType, string> = {
    api_route: "API route",
    component: "Component",
    config_file: "Config file",
    directory: "Directory",
    external_dependency: "External dependency",
    schema_file: "Schema file",
    source_file: "Source file",
  };

  return labels[type];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
