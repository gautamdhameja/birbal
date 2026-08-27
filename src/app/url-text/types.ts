import type { z } from "zod";

import type { UrlContentFetchPolicy } from "../../framework/content/fetchUrl.js";
import type { HostResolver } from "../../framework/network/url.js";
import type { FetchUrlTextResultSchema } from "./schema.js";

export type UrlTextRequest = {
  url: string;
  maxChars: number;
  signal?: AbortSignal;
};

export type FetchUrlTextOptions = Omit<UrlTextRequest, "maxChars"> & {
  maxChars?: number;
  hostResolver?: HostResolver;
  transport?: UrlContentFetchPolicy["transport"];
};

export type FetchUrlTextResult = z.output<typeof FetchUrlTextResultSchema>;
