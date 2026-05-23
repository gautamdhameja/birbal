import pRetry from "p-retry";

import { HTTP } from "../../constants/runtime.js";

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

export class RetryableFetchStatusError extends FetchStructuredError {
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

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
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
  const retries = options.retries ?? HTTP.DEFAULT_RETRIES;
  const statuses = retryableStatuses(options.retryStatusCodes);

  return pRetry(
    async (attemptNumber) => {
      await options.beforeAttempt?.(attemptNumber);
      const response = await fetchWithTimeout(input, init, options);
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
