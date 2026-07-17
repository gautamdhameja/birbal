import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";

import pRetry from "p-retry";

import { HTTP } from "./constants.js";
import { resolvePublicHostAddresses, type HostResolver } from "./url.js";

export type FetchTimeoutOptions = {
  timeoutMs?: number;
};

export type FetchRetryOptions = FetchTimeoutOptions & {
  retries?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  factor?: number;
  jitter?: boolean;
  retryStatusCodes?: readonly number[];
  beforeAttempt?(attemptNumber: number): Promise<void> | void;
};

export type PublicHttpFetchOptions = FetchRetryOptions & {
  hostResolver?: HostResolver;
};

export type FetchErrorDetails =
  | {
      kind: "timeout";
      timeoutMs: number;
    }
  | {
      kind: "aborted";
    }
  | {
      kind: "retryable_status";
      status: number;
      statusText: string;
      attemptNumber: number;
    };

export abstract class FetchStructuredError extends Error {
  abstract readonly details: FetchErrorDetails;

  toJSON(): FetchErrorDetails & { error: string } {
    return {
      error: this.message,
      ...this.details,
    };
  }
}

export class FetchTimeoutError extends FetchStructuredError {
  readonly details: FetchErrorDetails;

  constructor(readonly timeoutMs: number) {
    super(`${HTTP.ERRORS.TIMEOUT_PREFIX} ${timeoutMs}ms.`);
    this.name = "FetchTimeoutError";
    this.details = {
      kind: "timeout",
      timeoutMs,
    };
  }
}

export class FetchAbortError extends FetchStructuredError {
  readonly details = {
    kind: "aborted",
  } as const;

  constructor() {
    super(HTTP.ERRORS.ABORTED);
    this.name = "FetchAbortError";
  }
}

class RetryableFetchStatusError extends FetchStructuredError {
  readonly details: FetchErrorDetails;

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly attemptNumber: number,
  ) {
    super(`Fetch attempt ${attemptNumber} returned retryable HTTP ${status} ${statusText}.`);
    this.name = "RetryableFetchStatusError";
    this.details = {
      kind: "retryable_status",
      status,
      statusText,
      attemptNumber,
    };
  }
}

function retryableStatuses(statusCodes: readonly number[] | undefined): Set<number> {
  return new Set(statusCodes ?? HTTP.RETRYABLE_STATUS_CODES);
}

async function fetchWithRetryPolicy(
  init: RequestInit,
  options: FetchRetryOptions,
  runAttempt: () => Promise<Response>,
): Promise<Response> {
  const retries = options.retries ?? HTTP.DEFAULT_RETRIES;
  const statuses = retryableStatuses(options.retryStatusCodes);

  return pRetry(
    async (attemptNumber) => {
      await options.beforeAttempt?.(attemptNumber);
      const response = await runAttempt();
      if (statuses.has(response.status) && attemptNumber <= retries) {
        await cancelResponseBody(response);
        throw new RetryableFetchStatusError(response.status, response.statusText, attemptNumber);
      }

      return response;
    },
    {
      retries,
      factor: options.factor ?? HTTP.RETRY_FACTOR,
      minTimeout: options.minTimeoutMs ?? HTTP.RETRY_MIN_TIMEOUT_MS,
      maxTimeout: options.maxTimeoutMs ?? HTTP.RETRY_MAX_TIMEOUT_MS,
      randomize: options.jitter ?? true,
      signal: init.signal ?? undefined,
      shouldRetry: ({ error }) => error instanceof RetryableFetchStatusError,
    },
  );
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function requestHeaders(headers: RequestInit["headers"] | undefined): Record<string, string> {
  const normalizedHeaders: Record<string, string> = {};
  const sourceHeaders = new Headers(headers);
  for (const [key, value] of sourceHeaders.entries()) {
    normalizedHeaders[key] = value;
  }

  return normalizedHeaders;
}

function responseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const normalizedHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        normalizedHeaders.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      normalizedHeaders.set(key, value);
    }
  }

  return normalizedHeaders;
}

function safeLookup(hostResolver: HostResolver | undefined): LookupFunction {
  return (hostname, options, callback) => {
    const lookupOptions = typeof options === "function" ? {} : options;
    const done = typeof options === "function" ? options : callback;

    resolvePublicHostAddresses(hostname, hostResolver)
      .then((addresses) => {
        if (lookupOptions.all) {
          done(null, [...addresses]);
          return;
        }

        const address = addresses[0];
        if (!address) {
          done(new Error(HTTP.ERRORS.UNSAFE_HTTP_URL), "", 0);
          return;
        }

        done(null, address.address, address.family);
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error(String(error)), "", 0);
      });
  };
}

export async function fetchPublicHttpWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  options: PublicHttpFetchOptions = {},
): Promise<Response> {
  const url = new URL(input.toString());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(HTTP.ERRORS.INVALID_HTTP_URL);
  }

  const timeoutMs = options.timeoutMs ?? HTTP.DEFAULT_TIMEOUT_MS;
  const requestFn = url.protocol === "https:" ? requestHttps : requestHttp;
  let timedOut = false;
  let callerAborted = init.signal?.aborted ?? false;

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abort);
      callback();
    };
    const fail = (error: unknown): void => {
      finish(() => {
        reject(error);
      });
    };
    const abort = (): void => {
      callerAborted = true;
      request.destroy();
      fail(new FetchAbortError());
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      request.destroy();
      fail(new FetchTimeoutError(timeoutMs));
    }, timeoutMs);
    const request = requestFn(
      url,
      {
        method: init.method ?? "GET",
        headers: requestHeaders(init.headers),
        lookup: safeLookup(options.hostResolver),
      },
      (response) => {
        finish(() => {
          resolve(
            new Response(Readable.toWeb(response) as ReadableStream, {
              status: response.statusCode,
              statusText: response.statusMessage,
              headers: responseHeaders(response.headers),
            }),
          );
        });
      },
    );

    request.on("error", (error) => {
      if (settled) {
        return;
      }

      if (timedOut) {
        fail(new FetchTimeoutError(timeoutMs));
        return;
      }

      if (callerAborted) {
        fail(new FetchAbortError());
        return;
      }

      fail(error);
    });

    if (init.signal?.aborted) {
      abort();
      return;
    }

    init.signal?.addEventListener("abort", abort, { once: true });
    request.end();
  });
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? HTTP.DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = init.signal?.aborted ?? false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => {
    callerAborted = true;
    controller.abort();
  };

  init.signal?.addEventListener("abort", abort, { once: true });

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (callerAborted && !timedOut) {
        throw new FetchAbortError();
      }

      throw new FetchTimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  return fetchWithRetryPolicy(init, options, () => fetchWithTimeout(input, init, options));
}

export async function fetchPublicHttpWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: PublicHttpFetchOptions = {},
): Promise<Response> {
  return fetchWithRetryPolicy(init, options, () =>
    fetchPublicHttpWithTimeout(input, init, options),
  );
}
