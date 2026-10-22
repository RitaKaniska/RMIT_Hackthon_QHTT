import { register } from "node:module";

// @tideorg/js 0.14.29 ships ESM with extensionless relative imports, which Node
// cannot resolve. Register a narrow extension fallback before loading it so the
// server parses policy bytes with the pinned SDK instead of reimplementing the
// wire format.
register(new URL("./tide-resolver.mjs", import.meta.url), import.meta.url);

const sdk = await import("@tideorg/js");
export const Models = sdk.Models;
