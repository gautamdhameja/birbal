// Purpose: Exposes the public LLM framework API.
// Scope: Keeps imports stable while implementation modules stay focused.

export type {
  ChatMessage,
  ChatRole,
  ModelClient,
  ModelCompleteOptions,
  ModelResponseFormat,
} from "./types.js";
export {
  completeStructuredWithRepair,
  describeJsonSchema,
  ModelParseError,
  summarizeModelParseError,
} from "./repair.js";
export type {
  CompleteStructuredWithRepairOptions,
  ModelParseErrorDetails,
  StructuredModelOutputResult,
} from "./repair.js";
