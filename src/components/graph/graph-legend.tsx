import type { GraphEdgeType, GraphNodeType } from "./graph-types";
import { labelForNodeType } from "./repo-graph-node";

const nodeTypes: GraphNodeType[] = [
  "directory",
  "source_file",
  "component",
  "api_route",
  "config_file",
  "schema_file",
  "external_dependency",
];

const edgeTypes: GraphEdgeType[] = ["imports", "depends_on", "contains", "configured_by"];

const swatchClasses: Record<GraphNodeType, string> = {
  api_route: "bg-cyan-400",
  component: "bg-emerald-400",
  config_file: "bg-amber-400",
  directory: "bg-slate-400",
  external_dependency: "bg-violet-400",
  schema_file: "bg-rose-400",
  source_file: "bg-blue-400",
};

export function GraphLegend() {
  return (
    <div className="grid gap-4 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
      <section aria-labelledby="node-type-legend">
        <h3 className="font-semibold text-slate-950" id="node-type-legend">
          Node types
        </h3>
        <ul className="mt-3 grid gap-2">
          {nodeTypes.map((type) => (
            <li className="flex items-center gap-2 text-slate-600" key={type}>
              <span className={`h-2.5 w-2.5 rounded-sm ${swatchClasses[type]}`} />
              <span>{labelForNodeType(type)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="edge-type-legend">
        <h3 className="font-semibold text-slate-950" id="edge-type-legend">
          Edge types
        </h3>
        <ul className="mt-3 grid gap-2">
          {edgeTypes.map((type) => (
            <li className="flex items-center gap-2 text-slate-600" key={type}>
              <span className="h-px w-6 bg-slate-500" />
              <span>{type}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
