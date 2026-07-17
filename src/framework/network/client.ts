// Purpose: Implements framework HTTP response safety utilities.
// Scope: Centralizes bounded response reads and status errors.

import { HTTP } from "./constants.js";

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

function errorBodyPreview(body: string): string {
  if (body.length <= HTTP.MAX_ERROR_BODY_MESSAGE_LENGTH) {
    return body;
  }

  return `${body.slice(0, HTTP.MAX_ERROR_BODY_MESSAGE_LENGTH)}...`;
}

export function summarizeHttpErrorBody(body: string): string {
  const normalizedBody = body.toLowerCase();
  if (
    normalizedBody.includes("cloudflare") ||
    normalizedBody.includes("challenge-platform") ||
    normalizedBody.includes("just a moment") ||
    normalizedBody.includes("enable js") ||
    normalizedBody.includes("enable javascript") ||
    normalizedBody.includes("disable any ad blocker")
  ) {
    return "blocked by bot protection or a JavaScript challenge";
  }

  return errorBodyPreview(body);
}

export async function buildHttpStatusError(
  prefix: string,
  response: Response,
): Promise<HttpStatusError> {
  const body = await readErrorBody(response);

  return new HttpStatusError(
    `${prefix} ${response.status} ${response.statusText}: ${summarizeHttpErrorBody(body)}`,
    response.status,
    response.statusText,
    body,
  );
}
