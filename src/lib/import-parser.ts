export type ImportKind = "javascript" | "commonjs" | "python";

export type ParsedImport = {
  sourcePath: string;
  specifier: string;
  kind: ImportKind;
  isRelative: boolean;
  importedName?: string;
};

export type ImportParserFile = {
  path: string;
  language: string | null;
  content: string;
};

const ES_IMPORT_PATTERN =
  /\bimport\s+(?:type\s+)?(?:(.*?)\s+from\s+)?["']([^"']+)["']/g;
const COMMONJS_REQUIRE_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(["']([^"']+)["']\)/g;
const PYTHON_IMPORT_PATTERN = /^\s*import\s+([A-Za-z_][\w.]*(?:\s+as\s+\w+)?(?:\s*,\s*[A-Za-z_][\w.]*(?:\s+as\s+\w+)?)*)\s*$/;
const PYTHON_FROM_IMPORT_PATTERN =
  /^\s*from\s+(\.*[A-Za-z_][\w.]*|\.+)\s+import\s+([A-Za-z_*][\w*]*(?:\s+as\s+\w+)?(?:\s*,\s*[A-Za-z_*][\w*]*(?:\s+as\s+\w+)?)*)\s*$/;

export function parseImports(file: ImportParserFile): ParsedImport[] {
  const normalizedPath = normalizePath(file.path);
  const content = stripComments(file.content);

  if (isPythonFile(file)) {
    return parsePythonImports(normalizedPath, content);
  }

  if (isJavaScriptFile(file)) {
    return [
      ...parseEsImports(normalizedPath, content),
      ...parseCommonJsImports(normalizedPath, content),
    ];
  }

  return [];
}

function parseEsImports(sourcePath: string, content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const match of content.matchAll(ES_IMPORT_PATTERN)) {
    const specifier = match[2]?.trim();
    if (!specifier) {
      continue;
    }

    const bindings = match[1]?.trim();
    const importedNames = importedNamesFromEsBindings(bindings);

    if (importedNames.length === 0) {
      imports.push(createImport(sourcePath, specifier, "javascript"));
      continue;
    }

    for (const importedName of importedNames) {
      imports.push(createImport(sourcePath, specifier, "javascript", importedName));
    }
  }

  return imports;
}

function parseCommonJsImports(sourcePath: string, content: string): ParsedImport[] {
  return [...content.matchAll(COMMONJS_REQUIRE_PATTERN)]
    .map((match) => {
      const specifier = match[2]?.trim();
      if (!specifier) {
        return null;
      }

      return createImport(sourcePath, specifier, "commonjs", match[1]);
    })
    .filter((value): value is ParsedImport => value !== null);
}

function parsePythonImports(sourcePath: string, content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const line of content.split("\n")) {
    const importMatch = line.match(PYTHON_IMPORT_PATTERN);
    if (importMatch?.[1]) {
      for (const item of splitImportList(importMatch[1])) {
        const parsed = parseAliasedImport(item);
        if (!parsed) {
          continue;
        }

        imports.push(createImport(sourcePath, parsed.specifier, "python", parsed.importedName));
      }
      continue;
    }

    const fromImportMatch = line.match(PYTHON_FROM_IMPORT_PATTERN);
    const specifier = fromImportMatch?.[1]?.trim();
    const importList = fromImportMatch?.[2];
    if (specifier && importList) {
      for (const item of splitImportList(importList)) {
        const parsed = parseAliasedImport(item);
        if (!parsed) {
          continue;
        }

        imports.push(createImport(sourcePath, specifier, "python", parsed.importedName));
      }
    }
  }

  return imports;
}

function importedNamesFromEsBindings(bindings?: string): string[] {
  if (!bindings) {
    return [];
  }

  const names: string[] = [];
  const namedBindings = bindings.match(/\{([^}]+)\}/)?.[1];

  if (namedBindings) {
    names.push(
      ...splitImportList(namedBindings)
        .map((binding) => binding.replace(/^type\s+/, ""))
        .map((binding) => parseAliasedImport(binding)?.importedName)
        .filter((name): name is string => Boolean(name)),
    );
  }

  const defaultBinding = bindings.replace(/\{[^}]+\}/, "").replace(/,\s*$/, "").trim();
  if (defaultBinding && /^[A-Za-z_$][\w$]*$/.test(defaultBinding)) {
    names.unshift("default");
  }

  return names;
}

function parseAliasedImport(item: string): { specifier: string; importedName: string } | null {
  const normalized = item.trim();
  if (!normalized || normalized === "*") {
    return null;
  }

  const aliasMatch = normalized.match(/^([A-Za-z_$][\w$.:/-]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
  if (aliasMatch) {
    return {
      specifier: aliasMatch[1],
      importedName: aliasMatch[2],
    };
  }

  const simpleMatch = normalized.match(/^([A-Za-z_$][\w$.:/-]*)$/);
  if (!simpleMatch) {
    return null;
  }

  return {
    specifier: simpleMatch[1],
    importedName: simpleMatch[1],
  };
}

function splitImportList(importList: string): string[] {
  return importList
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createImport(
  sourcePath: string,
  specifier: string,
  kind: ImportKind,
  importedName?: string,
): ParsedImport {
  return {
    sourcePath,
    specifier,
    kind,
    isRelative: isRelativeSpecifier(specifier),
    ...(importedName ? { importedName } : {}),
  };
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

function isJavaScriptFile(file: ImportParserFile): boolean {
  return (
    /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(file.path) ||
    Boolean(file.language?.includes("JavaScript")) ||
    Boolean(file.language?.includes("TypeScript"))
  );
}

function isPythonFile(file: ImportParserFile): boolean {
  return file.path.endsWith(".py") || file.language === "Python";
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (/^\s*(\/\/|#)/.test(line) ? "" : line))
    .join("\n");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
