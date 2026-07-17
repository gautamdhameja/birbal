// Purpose: Preserves the application import path for framework HTTP client helpers.
// Scope: Compatibility exports only.

export {
  HttpStatusError,
  buildHttpStatusError,
  isHttpStatusError,
  readErrorBody,
  readResponseJson,
  readResponseText,
  summarizeHttpErrorBody,
} from "../../framework/network/client.js";
