import { HTTP } from "../constants/runtime.js";

type FetchOptions = {
  timeoutMs?: number;
};

export class HttpTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`${HTTP.ERRORS.TIMEOUT_PREFIX} ${timeoutMs}ms.`);
    this.name = "HttpTimeoutError";
  }
}

export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

export function isHttpStatusError(error: unknown): error is HttpStatusError {
  return error instanceof HttpStatusError;
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? HTTP.DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpTimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readResponseText(
  response: Response,
  maxBytes: number = HTTP.MAX_RESPONSE_BYTES,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(HTTP.ERRORS.RESPONSE_TOO_LARGE);
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error(HTTP.ERRORS.RESPONSE_TOO_LARGE);
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function readResponseJson(response: Response): Promise<unknown> {
  return JSON.parse(await readResponseText(response));
}

export async function readErrorBody(response: Response): Promise<string> {
  return readResponseText(response, HTTP.MAX_ERROR_RESPONSE_BYTES).catch(
    () => HTTP.FAILED_RESPONSE_BODY,
  );
}

export async function buildHttpStatusError(
  prefix: string,
  response: Response,
): Promise<HttpStatusError> {
  const body = await readErrorBody(response);

  return new HttpStatusError(
    `${prefix} ${response.status} ${response.statusText}: ${body}`,
    response.status,
    response.statusText,
    body,
  );
}
