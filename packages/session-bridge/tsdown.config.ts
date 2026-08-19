import { defineConfig } from "tsdown";

/**
 * Browser platform modules shared by the shell (mirrors the loader module
 * table): client code resolves these at runtime, so the client bundle keeps
 * them external. Everything else in the client entry is inlined.
 */
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-web-react",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-schema-form",
];

export default defineConfig([
  {
    name: "@dsh-external/dsh-session-bridge",
    entry: ["src/index.ts", "src/store.ts"],
    format: ["esm"],
    target: "node20",
    outDir: "lib",
    clean: false,
    sourcemap: false,
  },
  {
    name: "@dsh-external/dsh-session-bridge/client",
    entry: { client: "src/client/index.ts" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2022",
    dts: false,
    sourcemap: false,
    clean: false,
    external: PLATFORM_MODULES,
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify("@dsh-external/dsh-session-bridge")}, factory: (require) => {`,
      footer: "return module.exports; } });",
      intro: "var module = { exports: {} }; var exports = module.exports;",
    },
  },
]);
