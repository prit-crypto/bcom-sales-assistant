import { defineConfig } from "@hey-api/openapi-ts";

// Input is the committed snapshot written by `make openapi` in backend/, so generation works offline and
// the backend's test suite proves the snapshot matches the API. Types only: the small fetch client in
// src/lib/client/api.ts stays.
export default defineConfig({
  input: { path: "./openapi/openapi.json" },
  output: { path: "src/lib/api/generated", postProcess: [] },
  plugins: [{ name: "@hey-api/typescript", enums: false }],
});
