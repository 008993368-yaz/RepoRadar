import { describe, expect, it } from "vitest";

import { parseImports } from "./import-parser";

describe("parseImports", () => {
  it("parses JavaScript and TypeScript ES imports", () => {
    const imports = parseImports({
      path: "src/app/page.tsx",
      language: "TypeScript React",
      content: `
        import React from "react";
        import { Button, Card as Panel } from "../components/ui";
        import type { PageProps } from "./types";
        import "./globals.css";
      `,
    });

    expect(imports).toEqual([
      {
        sourcePath: "src/app/page.tsx",
        specifier: "react",
        kind: "javascript",
        isRelative: false,
        importedName: "default",
      },
      {
        sourcePath: "src/app/page.tsx",
        specifier: "../components/ui",
        kind: "javascript",
        isRelative: true,
        importedName: "Button",
      },
      {
        sourcePath: "src/app/page.tsx",
        specifier: "../components/ui",
        kind: "javascript",
        isRelative: true,
        importedName: "Panel",
      },
      {
        sourcePath: "src/app/page.tsx",
        specifier: "./types",
        kind: "javascript",
        isRelative: true,
        importedName: "PageProps",
      },
      {
        sourcePath: "src/app/page.tsx",
        specifier: "./globals.css",
        kind: "javascript",
        isRelative: true,
      },
    ]);
  });

  it("parses CommonJS require calls", () => {
    const imports = parseImports({
      path: "server/index.js",
      language: "JavaScript",
      content: `
        const express = require("express");
        const routes = require("./routes");
      `,
    });

    expect(imports).toEqual([
      {
        sourcePath: "server/index.js",
        specifier: "express",
        kind: "commonjs",
        isRelative: false,
        importedName: "express",
      },
      {
        sourcePath: "server/index.js",
        specifier: "./routes",
        kind: "commonjs",
        isRelative: true,
        importedName: "routes",
      },
    ]);
  });

  it("parses Python absolute imports", () => {
    const imports = parseImports({
      path: "app/main.py",
      language: "Python",
      content: `
        import os
        import fastapi, pydantic as pd
      `,
    });

    expect(imports).toEqual([
      {
        sourcePath: "app/main.py",
        specifier: "os",
        kind: "python",
        isRelative: false,
        importedName: "os",
      },
      {
        sourcePath: "app/main.py",
        specifier: "fastapi",
        kind: "python",
        isRelative: false,
        importedName: "fastapi",
      },
      {
        sourcePath: "app/main.py",
        specifier: "pydantic",
        kind: "python",
        isRelative: false,
        importedName: "pd",
      },
    ]);
  });

  it("parses Python from imports", () => {
    const imports = parseImports({
      path: "app/main.py",
      language: "Python",
      content: `
        from fastapi import FastAPI, APIRouter as Router
        from package.submodule import thing
      `,
    });

    expect(imports).toEqual([
      {
        sourcePath: "app/main.py",
        specifier: "fastapi",
        kind: "python",
        isRelative: false,
        importedName: "FastAPI",
      },
      {
        sourcePath: "app/main.py",
        specifier: "fastapi",
        kind: "python",
        isRelative: false,
        importedName: "Router",
      },
      {
        sourcePath: "app/main.py",
        specifier: "package.submodule",
        kind: "python",
        isRelative: false,
        importedName: "thing",
      },
    ]);
  });

  it("parses Python relative imports", () => {
    const imports = parseImports({
      path: "app/api/routes.py",
      language: "Python",
      content: `
        from .local_module import helper
        from ..database.models import User
      `,
    });

    expect(imports).toEqual([
      {
        sourcePath: "app/api/routes.py",
        specifier: ".local_module",
        kind: "python",
        isRelative: true,
        importedName: "helper",
      },
      {
        sourcePath: "app/api/routes.py",
        specifier: "..database.models",
        kind: "python",
        isRelative: true,
        importedName: "User",
      },
    ]);
  });

  it("ignores commented import examples", () => {
    const imports = parseImports({
      path: "src/example.ts",
      language: "TypeScript",
      content: `
        // import fake from "fake";
        /* const nope = require("nope"); */
        const actual = require("./actual");
        # import ignored_python
      `,
    });

    expect(imports).toEqual([
      {
        sourcePath: "src/example.ts",
        specifier: "./actual",
        kind: "commonjs",
        isRelative: true,
        importedName: "actual",
      },
    ]);
  });
});
