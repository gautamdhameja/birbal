import pino from "pino";
import pretty from "pino-pretty";

import { LOGGING } from "../constants.js";

const PRETTY_LOGGING_ENABLED = process.env.LOG_PRETTY === LOGGING.PRETTY_ENABLED_VALUE;

const destination = PRETTY_LOGGING_ENABLED
  ? pretty({
      colorize: true,
      destination: LOGGING.PRETTY_DESTINATION_FD,
      ignore: LOGGING.PRETTY_IGNORED_FIELDS,
      sync: true,
      translateTime: LOGGING.PRETTY_TRANSLATE_TIME,
    })
  : pino.destination({ fd: LOGGING.PRETTY_DESTINATION_FD, sync: true });

export const logger = pino(
  {
    base: undefined,
    level: process.env.LOG_LEVEL?.trim() || LOGGING.DEFAULT_LEVEL,
    name: LOGGING.LOGGER_NAME,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination,
);
