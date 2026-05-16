import { z } from "zod";

import type { ToolDefinition } from "./types.js";

const GetTimeArgsSchema = z.strictObject({});

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

export const getTimeTool: ToolDefinition<typeof GetTimeArgsSchema> = {
  name: "get_time",
  description: "Get the current local time as an ISO string.",
  argsSchema: GetTimeArgsSchema,
  async run() {
    return {
      now: formatLocalIsoString(new Date()),
    };
  },
};
