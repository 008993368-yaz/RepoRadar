import { createHash } from "node:crypto";

import type { GitHubFileTreeEntry } from "./github-client";

export type FileRole =
  | "readme"
  | "component"
  | "api"
  | "config"
  | "schema"
  | "test"
  | "entrypoint"
  | "source";

export type SelectedFile = {
  path: string;
  sha: string;
  size: number | null;
  language: string | null;
  role: FileRole;
  score: number;
};

export type FileSelectionOptions = {
  maxFiles?: number;
  maxFileSizeBytes?: number;
};

const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_FILE_SIZE_BYTES = 100_000;

const IGNORED_DIRECTORIES = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
];

const BINARY_EXTENSIONS = new Set([
  ".ai",
  ".avif",
  ".bmp",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  [".css", "CSS"],
  [".cjs", "JavaScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript React"],
  [".json", "JSON"],
  [".md", "Markdown"],
  [".mdx", "MDX"],
  [".mjs", "JavaScript"],
  [".py", "Python"],
  [".sql", "SQL"],
  [".tsx", "TypeScript React"],
  [".ts", "TypeScript"],
  [".yml", "YAML"],
  [".yaml", "YAML"],
]);

const CONFIG_FILE_NAMES = new Set([
  ".env.example",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  ".gitignore",
  "components.json",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "package.json",
  "postcss.config.js",
  "postcss.config.mjs",
  "tailwind.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "vercel.json",
  "vitest.config.ts",
]);

export function selectImportantFiles(
  tree: GitHubFileTreeEntry[],
  options: FileSelectionOptions = {},
): SelectedFile[] {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  return tree
    .filter((entry) => shouldIncludeFile(entry, maxFileSizeBytes))
    .map((entry) => {
      const role = classifyFileRole(entry.path);

      return {
        path: normalizePath(entry.path),
        sha: entry.sha,
        size: entry.size,
        language: detectLanguage(entry.path),
        role,
        score: scoreForFile(entry.path, role),
      };
    })
    .sort(compareSelectedFiles)
    .slice(0, maxFiles);
}

export function detectLanguage(path: string): string | null {
  const fileName = getFileName(path);

  if (fileName === "Dockerfile") {
    return "Dockerfile";
  }

  return LANGUAGE_BY_EXTENSION.get(getExtension(path)) ?? null;
}

export function classifyFileRole(path: string): FileRole {
  const normalizedPath = normalizePath(path);
  const fileName = getFileName(normalizedPath);

  if (/^readme(\.[a-z0-9]+)?$/i.test(fileName)) {
    return "readme";
  }

  if (isTestPath(normalizedPath)) {
    return "test";
  }

  if (isApiPath(normalizedPath)) {
    return "api";
  }

  if (isConfigPath(normalizedPath)) {
    return "config";
  }

  if (isSchemaPath(normalizedPath)) {
    return "schema";
  }

  if (isEntryPointPath(normalizedPath)) {
    return "entrypoint";
  }

  if (isComponentPath(normalizedPath)) {
    return "component";
  }

  return "source";
}

export function createContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function shouldIncludeFile(entry: GitHubFileTreeEntry, maxFileSizeBytes: number): boolean {
  const normalizedPath = normalizePath(entry.path);

  if (hasIgnoredDirectory(normalizedPath)) {
    return false;
  }

  if (entry.size !== null && entry.size > maxFileSizeBytes) {
    return false;
  }

  if (isGeneratedPath(normalizedPath)) {
    return false;
  }

  if (BINARY_EXTENSIONS.has(getExtension(normalizedPath))) {
    return false;
  }

  return entry.size !== null || detectLanguage(normalizedPath) !== null;
}

function compareSelectedFiles(left: SelectedFile, right: SelectedFile): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.path.length !== right.path.length) {
    return left.path.length - right.path.length;
  }

  return left.path.localeCompare(right.path);
}

function scoreForFile(path: string, role: FileRole): number {
  if (role === "source" && detectLanguage(path) === "Markdown") {
    return 20;
  }

  return scoreForRole(role);
}

function scoreForRole(role: FileRole): number {
  switch (role) {
    case "readme":
      return 100;
    case "config":
      return 90;
    case "entrypoint":
      return 80;
    case "api":
      return 70;
    case "schema":
      return 60;
    case "component":
      return 50;
    case "source":
      return 40;
    case "test":
      return 30;
  }
}

function hasIgnoredDirectory(path: string): boolean {
  const segments = path.split("/");
  return segments.some((segment) => IGNORED_DIRECTORIES.includes(segment));
}

function isGeneratedPath(path: string): boolean {
  return path.endsWith(".map") || /\.min\.[cm]?[jt]sx?$/.test(path);
}

function isApiPath(path: string): boolean {
  return /(^|\/)app\/api\/.+\/route\.[cm]?[jt]s$/.test(path) || /(^|\/)pages\/api\//.test(path);
}

function isConfigPath(path: string): boolean {
  const fileName = getFileName(path);
  return CONFIG_FILE_NAMES.has(fileName) || fileName.endsWith(".config.js") || fileName.endsWith(".config.ts");
}

function isSchemaPath(path: string): boolean {
  const fileName = getFileName(path);
  return (
    fileName === "schema.prisma" ||
    fileName === "schema.sql" ||
    fileName === "models.py" ||
    path.includes("/migrations/") ||
    path.startsWith("migrations/") ||
    path.startsWith("supabase/")
  );
}

function isEntryPointPath(path: string): boolean {
  const fileName = getFileName(path);
  return (
    fileName === "page.tsx" ||
    fileName === "layout.tsx" ||
    fileName === "main.tsx" ||
    fileName === "index.tsx" ||
    fileName === "main.ts" ||
    fileName === "index.ts"
  );
}

function isComponentPath(path: string): boolean {
  const fileName = getFileName(path);
  return (
    path.includes("/components/") ||
    path.startsWith("components/") ||
    /^[A-Z][A-Za-z0-9-]*\.(tsx|jsx)$/.test(fileName)
  );
}

function isTestPath(path: string): boolean {
  return (
    path.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    path.endsWith("_test.py") ||
    path.startsWith("test/") ||
    path.startsWith("tests/")
  );
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function getFileName(path: string): string {
  const normalizedPath = normalizePath(path);
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
}

function getExtension(path: string): string {
  const fileName = getFileName(path).toLowerCase();
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot);
}
