import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import { URL_TEXT } from "../../framework/content/constants.js";
import { FetchUrlTextResultSchema } from "../url-text/schema.js";
import type { ToolDefinition } from "../../framework/tools/types.js";
import type { FetchUrlTextOperation } from "./types.js";

const FetchUrlTextArgsSchema = z.strictObject({
  url: z.url(),
  max_chars: z
    .number()
    .int()
    .min(1)
    .max(URL_TEXT.MAX_CHARS_LIMIT)
    .default(URL_TEXT.DEFAULT_MAX_CHARS),
});

export function createFetchUrlTextTool(
  runFetch: FetchUrlTextOperation,
): ToolDefinition<typeof FetchUrlTextArgsSchema, typeof FetchUrlTextResultSchema> {
  return {
    name: TOOLS.FETCH_URL_TEXT.NAME,
    description: TOOLS.FETCH_URL_TEXT.DESCRIPTION,
    argsSchema: FetchUrlTextArgsSchema,
    resultSchema: FetchUrlTextResultSchema,
    async run(args, context) {
      return runFetch({
        url: args.url,
        maxChars: args.max_chars,
        signal: context.signal,
      });
    },
  };
}
