import { createRequire } from "node:module";

import pino from "pino";

import { LOGGING } from "../constants/runtime.js";

const require = createRequire(import.meta.url);

function createPrettyDestination(): pino.DestinationStream {
  const pretty = require("pino-pretty") as (options: {
    colorize: boolean;
    destination: number;
    ignore: string;
    sync: boolean;
    translateTime: string;
  }) => pino.DestinationStream;

  return pretty({
    colorize: true,
    destination: LOGGING.PRETTY_DESTINATION_FD,
    ignore: LOGGING.PRETTY_IGNORED_FIELDS,
    sync: true,
    translateTime: LOGGING.PRETTY_TRANSLATE_TIME,
  });
}

export function createAppLogger(): pino.Logger {
  const destination =
    process.env.LOG_PRETTY === LOGGING.PRETTY_ENABLED_VALUE
      ? createPrettyDestination()
      : pino.destination({ fd: LOGGING.PRETTY_DESTINATION_FD, sync: true });

  return pino(
    {
      base: undefined,
      level: process.env.LOG_LEVEL?.trim() || LOGGING.DEFAULT_LEVEL,
      name: LOGGING.LOGGER_NAME,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

let defaultLogger: pino.Logger | undefined;

function getDefaultLogger(): pino.Logger {
  defaultLogger ??= createAppLogger();
  return defaultLogger;
}

export const logger = {
  debug(payload: Record<string, unknown>, message?: string): void {
    getDefaultLogger().debug(payload, message);
  },
  warn(payload: Record<string, unknown>, message?: string): void {
    getDefaultLogger().warn(payload, message);
  },
  get level(): string {
    return getDefaultLogger().level;
  },
};
