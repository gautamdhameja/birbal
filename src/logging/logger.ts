import pino from "pino";
import pretty from "pino-pretty";

const DEFAULT_LOG_LEVEL = "debug";
const PRETTY_LOGGING_ENABLED = process.env.LOG_PRETTY === "true";

const destination = PRETTY_LOGGING_ENABLED
  ? pretty({
      colorize: true,
      destination: 2,
      ignore: "pid,hostname",
      sync: true,
      translateTime: "SYS:standard",
    })
  : pino.destination({ fd: 2, sync: true });

export const logger = pino(
  {
    base: undefined,
    level: process.env.LOG_LEVEL?.trim() || DEFAULT_LOG_LEVEL,
    name: "birbal",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination,
);
