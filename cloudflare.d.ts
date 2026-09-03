// Ambient declarations for the Cloudflare Workers runtime and the D1 binding.
// The worker and db code run on Cloudflare; these types let `tsc --noEmit` check
// them without pulling the full @cloudflare/workers-types package.

declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & { DB?: D1Database };
}

interface D1PreparedStatement {
  run(): Promise<unknown>;
  all(): Promise<unknown>;
  first(): Promise<unknown>;
  bind(...values: unknown[]): D1PreparedStatement;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch?(statements: D1PreparedStatement[]): Promise<unknown>;
  exec?(query: string): Promise<unknown>;
}

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
