export class ApiError extends Error {
  constructor({ status = 0, code = "request_failed", message = "The request failed.", cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function readJson(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return { payload: null, isJson: false };
  try {
    return { payload: await response.json(), isJson: true };
  } catch {
    return { payload: null, isJson: true, parseFailed: true };
  }
}

export async function apiRequest(getToken, path, { method = "GET", body, signal } = {}) {
  let token;
  try {
    token = await getToken();
  } catch (cause) {
    throw new ApiError({
      code: "token_unavailable",
      message: "The TideCloak SDK could not provide an access token. Sign in again.",
      cause,
    });
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new ApiError({
      code: "not_authenticated",
      message: "No TideCloak access token is available. Sign in again.",
    });
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  let requestBody;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const timeout =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(30000)
      : null;
  const combinedSignal =
    signal && timeout && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : signal || timeout;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: requestBody,
      cache: "no-store",
      credentials: "omit",
      signal: combinedSignal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({
      code: "network_unreachable",
      message:
        "The API could not be reached. Check that the backend is running on 127.0.0.1:3001 and that the Vite /api proxy is active.",
      cause,
    });
  }

  const { payload, isJson, parseFailed } = await readJson(response);

  if (!response.ok) {
    const code = payload?.error?.code || `http_${response.status}`;
    const message =
      payload?.error?.message ||
      (isJson
        ? "The API rejected the request without a readable reason."
        : `The API returned a non-JSON response (HTTP ${response.status}). The client refuses to parse HTML as an API result.`);
    throw new ApiError({ status: response.status, code, message });
  }

  if (!isJson || parseFailed || payload === null) {
    throw new ApiError({
      status: response.status,
      code: "invalid_api_response",
      message: `The API did not return a valid JSON success body (HTTP ${response.status}).`,
    });
  }

  return payload;
}

export async function fetchSetup(signal) {
  const timeout =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(12000)
      : null;
  const combinedSignal =
    signal && timeout && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : signal || timeout;

  let response;
  try {
    response = await fetch("/api/setup", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal: combinedSignal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({
      code: "setup_unreachable",
      message:
        "Could not reach GET /api/setup. Start the API (npm run dev:api) and refresh; no local login or encryption fallback is available.",
      cause,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: "setup_http_error",
      message: `GET /api/setup returned HTTP ${response.status}.`,
    });
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError({
      status: response.status,
      code: "setup_not_json",
      message:
        "GET /api/setup returned a non-JSON body. The server must not answer API routes with the SPA index.html.",
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError({
      status: response.status,
      code: "setup_invalid_json",
      message: "GET /api/setup returned unreadable JSON.",
      cause,
    });
  }
  if (!payload || typeof payload !== "object" || typeof payload.configured !== "boolean") {
    throw new ApiError({
      status: response.status,
      code: "setup_invalid_shape",
      message: "GET /api/setup did not match the setup contract.",
    });
  }
  return payload;
}

export function apiErrorInfo(error) {
  if (error instanceof ApiError) {
    return {
      title: "Request rejected",
      status: error.status || null,
      code: error.code,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      title: "Unexpected failure",
      status: null,
      code: error.name || "error",
      message: error.message || "The operation failed.",
    };
  }
  return {
    title: "Unexpected failure",
    status: null,
    code: "unknown",
    message: typeof error === "string" && error ? error : "The operation failed.",
  };
}
