import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import type { ToolDefinition } from "../../framework/tools/types.js";

const GetTimeArgsSchema = z.strictObject({});
const GetTimeResultSchema = z.strictObject({
  now: z.string(),
});

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatLocalIsoString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.trunc(absoluteOffsetMinutes / 60);
  const remainingOffsetMinutes = absoluteOffsetMinutes % 60;

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `.${pad(date.getMilliseconds(), 3)}`,
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
