import path from "node:path";

import { parseImports, type ParsedImport } from "./import-parser";
import type { FileRole } from "./file-selection";

export type GraphNodeType =
  | "directory"
  | "source_file"
  | "component"
  | "api_route"
  | "config_file"
  | "schema_file"
  | "external_dependency";

export type GraphEdgeType = "imports" | "depends_on" | "contains" | "configured_by";

export type GraphEngineFile = {
  id?: string;
  path: string;
  role: FileRole;
  language: string | null;
  content: string;
  summary?: string | null;
};

export type ReactFlowGraphNode = {
  id: string;
  type: GraphNodeType;
  data: {
    label: string;
    path: string;
    summary: string | null;
    nodeType: GraphNodeType;
    fileId?: string;
    role?: FileRole;
    language?: string | null;
    imports?: string[];
    unresolvedImports?: string[];
    routeKind?: "nextjs" | "express" | "fastapi";
  };
  position: {
    x: number;
    y: number;
  };
};

export type ReactFlowGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: GraphEdgeType;
  data: {
    edgeType: GraphEdgeType;
    specifier?: string;
    importedName?: string;
    confidence: number;
  };
};

export type RepositoryGraph = {
  nodes: ReactFlowGraphNode[];
  edges: ReactFlowGraphEdge[];
};

export type BuildRepositoryGraphInput = {
  files: GraphEngineFile[];
};

const JS_RESOLUTION_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const PYTHON_RESOLUTION_EXTENSIONS = [".py"];

export function buildRepositoryGraph(input: BuildRepositoryGraphInput): RepositoryGraph {
  const normalizedFiles = input.files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
  }));
  const filePathSet = new Set(normalizedFiles.map((file) => file.path));
  const nodes = new Map<string, ReactFlowGraphNode>();
  const edges = new Map<string, ReactFlowGraphEdge>();

  for (const file of normalizedFiles) {
    addDirectoryNodesAndEdges(file.path, nodes, edges);
    setNode(nodes, createFileNode(file));
  }

  for (const file of normalizedFiles) {
    const sourceNode = nodes.get(fileNodeId(file.path));
    if (!sourceNode) {
      continue;
    }

    const parsedImports = parseImports(file);
    const unresolvedImports: string[] = [];
    const importedSpecifiers = new Set<string>();

    for (const parsedImport of parsedImports) {
      importedSpecifiers.add(parsedImport.specifier);
      const targetPath = parsedImport.isRelative
        ? resolveRelativeImport(file.path, parsedImport, filePathSet)
        : null;

      if (targetPath) {
        addEdge(
          edges,
          "imports",
          fileNodeId(file.path),
          fileNodeId(targetPath),
          0.95,
          parsedImport,
        );
        continue;
      }

      if (parsedImport.isRelative) {
        unresolvedImports.push(parsedImport.specifier);
        continue;
      }

      const dependencyName = externalDependencyName(parsedImport.specifier, parsedImport.kind);
      const dependencyId = externalNodeId(dependencyName);
      setNode(nodes, createExternalNode(dependencyName));
      addEdge(edges, "depends_on", fileNodeId(file.path), dependencyId, 0.8, parsedImport);
    }

    sourceNode.data.imports = [...importedSpecifiers].sort();
    if (unresolvedImports.length > 0) {
      sourceNode.data.unresolvedImports = [...new Set(unresolvedImports)].sort();
    }
  }

  addConfiguredByEdges(normalizedFiles, edges);

  const orderedNodes = [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  orderedNodes.forEach((node, index) => {
    node.position = {
      x: (index % 12) * 220,
      y: Math.floor(index / 12) * 140,
    };
  });

  return {
    nodes: orderedNodes,
    edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function createFileNode(file: GraphEngineFile): ReactFlowGraphNode {
  const nodeType = fileNodeType(file);
  const routeKind = routeKindForFile(file);

  return {
    id: fileNodeId(file.path),
    type: nodeType,
    data: {
      label: labelFromPath(file.path),
      path: file.path,
      summary: file.summary ?? null,
      nodeType,
      ...(file.id ? { fileId: file.id } : {}),
      role: file.role,
      language: file.language,
      ...(routeKind ? { routeKind } : {}),
    },
    position: { x: 0, y: 0 },
  };
}

function createDirectoryNode(directoryPath: string): ReactFlowGraphNode {
  return {
    id: directoryNodeId(directoryPath),
    type: "directory",
    data: {
      label: labelFromPath(directoryPath),
      path: directoryPath,
      summary: null,
      nodeType: "directory",
    },
    position: { x: 0, y: 0 },
  };
}

function createExternalNode(dependencyName: string): ReactFlowGraphNode {
  return {
    id: externalNodeId(dependencyName),
    type: "external_dependency",
    data: {
      label: dependencyName,
      path: dependencyName,
      summary: null,
      nodeType: "external_dependency",
    },
    position: { x: 0, y: 0 },
  };
}

function addDirectoryNodesAndEdges(
  filePath: string,
  nodes: Map<string, ReactFlowGraphNode>,
  edges: Map<string, ReactFlowGraphEdge>,
) {
  const directories = parentDirectories(filePath);

  for (const directory of directories) {
    setNode(nodes, createDirectoryNode(directory));
  }

  for (let index = 1; index < directories.length; index += 1) {
    addEdge(
      edges,
      "contains",
      directoryNodeId(directories[index - 1]),
      directoryNodeId(directories[index]),
      1,
    );
  }

  const parentDirectory = directories.at(-1);
  if (parentDirectory) {
    addEdge(edges, "contains", directoryNodeId(parentDirectory), fileNodeId(filePath), 1);
  }
}

function addConfiguredByEdges(files: GraphEngineFile[], edges: Map<string, ReactFlowGraphEdge>) {
  const configFiles = files.filter((file) => fileNodeType(file) === "config_file");
  const schemaFiles = files.filter((file) => fileNodeType(file) === "schema_file");

  for (const schemaFile of schemaFiles) {
    for (const configFile of configFiles) {
      addEdge(
        edges,
        "configured_by",
        fileNodeId(schemaFile.path),
        fileNodeId(configFile.path),
        0.7,
      );
    }
  }
}

function addEdge(
  edges: Map<string, ReactFlowGraphEdge>,
  label: GraphEdgeType,
  source: string,
  target: string,
  confidence: number,
  parsedImport?: ParsedImport,
) {
  const edgeId = `${label}:${source}->${target}`;
  if (edges.has(edgeId)) {
    return;
  }

  edges.set(edgeId, {
    id: edgeId,
    source,
    target,
    label,
    data: {
      edgeType: label,
      confidence,
      ...(parsedImport?.specifier ? { specifier: parsedImport.specifier } : {}),
      ...(parsedImport?.importedName ? { importedName: parsedImport.importedName } : {}),
    },
  });
}

function setNode(nodes: Map<string, ReactFlowGraphNode>, node: ReactFlowGraphNode) {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function resolveRelativeImport(
  sourcePath: string,
  parsedImport: ParsedImport,
  filePathSet: Set<string>,
): string | null {
  const sourceDirectory = path.posix.dirname(sourcePath);
  const basePath =
    parsedImport.kind === "python"
      ? resolvePythonBasePath(sourceDirectory, parsedImport.specifier)
      : path.posix.normalize(path.posix.join(sourceDirectory, parsedImport.specifier));
  const candidates =
    parsedImport.kind === "python"
      ? pythonResolutionCandidates(basePath)
      : jsResolutionCandidates(basePath);

  return candidates.find((candidate) => filePathSet.has(candidate)) ?? null;
}

function resolvePythonBasePath(sourceDirectory: string, specifier: string): string {
  const leadingDots = specifier.match(/^\.+/)?.[0] ?? "";
  const modulePath = specifier.slice(leadingDots.length).replaceAll(".", "/");
  const upLevels = Math.max(leadingDots.length - 1, 0);
  let baseDirectory = sourceDirectory;

  for (let index = 0; index < upLevels; index += 1) {
    baseDirectory = path.posix.dirname(baseDirectory);
  }

  return path.posix.normalize(path.posix.join(baseDirectory, modulePath));
}

function jsResolutionCandidates(basePath: string): string[] {
  if (hasKnownExtension(basePath, JS_RESOLUTION_EXTENSIONS)) {
    return [basePath];
  }

  return [
    ...JS_RESOLUTION_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...JS_RESOLUTION_EXTENSIONS.map((extension) => `${basePath}/index${extension}`),
  ];
}

function pythonResolutionCandidates(basePath: string): string[] {
  if (hasKnownExtension(basePath, PYTHON_RESOLUTION_EXTENSIONS)) {
    return [basePath];
  }

  return [`${basePath}.py`, `${basePath}/__init__.py`];
}

function fileNodeType(file: GraphEngineFile): GraphNodeType {
  if (isRouteFile(file)) {
    return "api_route";
  }

  if (isSchemaFile(file)) {
    return "schema_file";
  }

  if (file.role === "component") {
    return "component";
  }

  if (file.role === "api") {
    return "api_route";
  }

  if (file.role === "config") {
    return "config_file";
  }

  if (file.role === "schema") {
    return "schema_file";
  }

  return "source_file";
}

function routeKindForFile(file: GraphEngineFile): ReactFlowGraphNode["data"]["routeKind"] {
  if (isNextRoutePath(file.path)) {
    return "nextjs";
  }

  if (hasExpressRoute(file.content)) {
    return "express";
  }

  if (hasFastApiRoute(file.content)) {
    return "fastapi";
  }

  return undefined;
}

function isRouteFile(file: GraphEngineFile): boolean {
  return isNextRoutePath(file.path) || hasExpressRoute(file.content) || hasFastApiRoute(file.content);
}

function isNextRoutePath(filePath: string): boolean {
  return /(^|\/)app\/api\/.+\/route\.[cm]?[jt]s$/.test(filePath);
}

function hasExpressRoute(content: string): boolean {
  return /\b(?:app|router)\.(?:get|post)\s*\(/.test(content);
}

function hasFastApiRoute(content: string): boolean {
  return /@\s*(?:app|router)\.(?:get|post)\s*\(/.test(content);
}

function isSchemaFile(file: GraphEngineFile): boolean {
  const fileName = labelFromPath(file.path);
  return (
    file.role === "schema" ||
    fileName === "schema.prisma" ||
    fileName === "models.py" ||
    fileName === "schema.sql" ||
    file.path.includes("/migrations/") ||
    file.path.startsWith("migrations/") ||
    file.path.startsWith("supabase/")
  );
}

function externalDependencyName(specifier: string, kind: ParsedImport["kind"]): string {
  if (kind === "python") {
    return specifier.replace(/^\.+/, "").split(".")[0] || specifier;
  }

  const segments = specifier.split("/");
  if (specifier.startsWith("@") && segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0];
}

function parentDirectories(filePath: string): string[] {
  const segments = filePath.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function hasKnownExtension(filePath: string, extensions: string[]): boolean {
  return extensions.some((extension) => filePath.endsWith(extension));
}

function fileNodeId(filePath: string): string {
  return `file:${filePath}`;
}

function directoryNodeId(directoryPath: string): string {
  return `dir:${directoryPath}`;
}

function externalNodeId(specifier: string): string {
  return `external:${specifier}`;
}

function labelFromPath(filePath: string): string {
  const normalizedPath = normalizePath(filePath);
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}
