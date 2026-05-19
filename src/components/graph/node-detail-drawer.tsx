import { Button, Drawer } from "@/components/ui";

import type { RepoGraphNode } from "./graph-types";
import { graphNodeType, labelForNodeType } from "./repo-graph-node";

type NodeDetailDrawerProps = {
  connectedCount: number;
  node: RepoGraphNode;
  onClose: () => void;
};

export function NodeDetailDrawer({ connectedCount, node, onClose }: NodeDetailDrawerProps) {
  const nodeType = graphNodeType(node.data.nodeType ?? node.type);
  const imports = arrayValue(node.data.imports);
  const unresolvedImports = arrayValue(node.data.unresolvedImports);

  return (
    <Drawer aria-label="Node details" className="space-y-4" role="complementary">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {labelForNodeType(nodeType)}
          </p>
          <h3 className="mt-1 break-words text-lg font-semibold text-slate-950">
            {stringValue(node.data.label, "Unknown node")}
          </h3>
        </div>
        <Button className="h-9 shrink-0 px-3" onClick={onClose} variant="secondary">
          Close node details
        </Button>
      </div>

      <dl className="grid gap-3 text-sm">
        <DetailItem label="Path" value={stringValue(node.data.path, node.id)} mono />
        <DetailItem label="Type" value={labelForNodeType(nodeType)} />
        {typeof node.data.language === "string" ? (
          <DetailItem label="Language" value={node.data.language} />
        ) : null}
        {typeof node.data.role === "string" ? <DetailItem label="Role" value={node.data.role} /> : null}
        {typeof node.data.routeKind === "string" ? (
          <DetailItem label="Route kind" value={node.data.routeKind} />
        ) : null}
      </dl>

      <section>
        <h4 className="text-sm font-semibold text-slate-950">Summary</h4>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {stringValue(node.data.summary, "No summary was generated for this node.")}
        </p>
      </section>

      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Connected to {connectedCount} {connectedCount === 1 ? "node" : "nodes"}
      </p>

      {imports.length > 0 ? <StringList title="Imports" values={imports} /> : null}
      {unresolvedImports.length > 0 ? (
        <StringList title="Unresolved imports" values={unresolvedImports} />
      ) : null}
    </Drawer>
  );
}

function DetailItem({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function StringList({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      <ul className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <li className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700" key={value}>
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
