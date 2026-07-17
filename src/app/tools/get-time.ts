// Purpose: Implements the Birbal tool module: get time.
// Scope: Defines concrete tools and wires them into the generic tool framework.

import { z } from "zod";

import { TIME } from "../constants/time.js";
import { TOOLS } from "../constants/tools.js";
import type { ToolDefinition } from "./types.js";

const GetTimeArgsSchema = z.strictObject({});
const GetTimeResultSchema = z.strictObject({
  now: z.string(),
});

function pad(value: number, length: number = TIME.DEFAULT_PAD_LENGTH): string {
  return String(value).padStart(length, "0");
}

export function formatLocalIsoString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? TIME.POSITIVE_OFFSET_SIGN : TIME.NEGATIVE_OFFSET_SIGN;
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.trunc(absoluteOffsetMinutes / TIME.MINUTES_PER_HOUR);
  const remainingOffsetMinutes = absoluteOffsetMinutes % TIME.MINUTES_PER_HOUR;

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${TIME.DATE_TIME_SEPARATOR}${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `.${pad(date.getMilliseconds(), TIME.MILLISECOND_PAD_LENGTH)}`,
    `${offsetSign}${pad(offsetHours)}:${pad(remainingOffsetMinutes)}`,
  ].join("");
}

export const getTimeTool: ToolDefinition<typeof GetTimeArgsSchema, typeof GetTimeResultSchema> = {
  name: TOOLS.GET_TIME.NAME,
  description: TOOLS.GET_TIME.DESCRIPTION,
  argsSchema: GetTimeArgsSchema,
  resultSchema: GetTimeResultSchema,
  async run() {
    return {
      now: formatLocalIsoString(new Date()),
    };
  },
};
