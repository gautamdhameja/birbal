// Purpose: Preserves the application import path for framework URL safety helpers.
// Scope: Compatibility exports only.

export {
  allowedHostErrorMessage,
  assertSafePublicHttpUrl,
  httpUrlErrorMessage,
  isAllowedHttpUrl,
  isHttpUrlWithoutCredentials,
  isPublicIpAddress,
  isSafePublicHttpUrl,
  resolvePublicHostAddresses,
  unsafeHttpUrlErrorMessage,
} from "../../framework/network/url.js";
export type { HostAddress, HostResolver } from "../../framework/network/url.js";
