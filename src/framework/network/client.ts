import { HTTP } from "./constants.js";
import { FetchAbortError, FetchTimeoutError } from "./fetch.js";

export type ResponseReadOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

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

export async function discardResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

export async function readResponseText(
  response: Response,
  maxBytes: number = HTTP.MAX_RESPONSE_BYTES,
  options: ResponseReadOptions = {},
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
  const timeoutMs = options.timeoutMs ?? HTTP.DEFAULT_TIMEOUT_MS;

  if (options.signal?.aborted) {
    await reader.cancel().catch(() => undefined);
    throw new FetchAbortError();
  }

  let rejectBoundary: ((error: Error) => void) | undefined;
  let boundarySettled = false;
  const rejectRead = (error: Error): void => {
    if (boundarySettled) {
      return;
    }

    boundarySettled = true;
    void reader.cancel(error).catch(() => undefined);
    rejectBoundary?.(error);
  };
  const timeout = setTimeout(() => {
    rejectRead(new FetchTimeoutError(timeoutMs));
  }, timeoutMs);
  const abort = (): void => {
    rejectRead(new FetchAbortError());
  };
  options.signal?.addEventListener("abort", abort, { once: true });

  const boundary = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject;
  });

  const consume = async (): Promise<string> => {
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
  };

  try {
    return await Promise.race([consume(), boundary]);
  } finally {
    boundarySettled = true;
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function readResponseJson(
  response: Response,
  options: ResponseReadOptions = {},
): Promise<unknown> {
  return JSON.parse(await readResponseText(response, HTTP.MAX_RESPONSE_BYTES, options));
}

async function readErrorBody(response: Response, options: ResponseReadOptions): Promise<string> {
  return readResponseText(response, HTTP.MAX_ERROR_RESPONSE_BYTES, options).catch(
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
  options: ResponseReadOptions = {},
): Promise<HttpStatusError> {
  const body = await readErrorBody(response, options);

  return new HttpStatusError(
    `${prefix} ${response.status} ${response.statusText}: ${summarizeHttpErrorBody(body)}`,
    response.status,
    response.statusText,
    body,
  );
}
