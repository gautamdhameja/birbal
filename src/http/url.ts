import { HTTP } from "../constants/runtime.js";

export function isHttpUrlWithoutCredentials(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

export function isAllowedHttpUrl(value: string, allowedHosts: readonly string[]): boolean {
  if (!isHttpUrlWithoutCredentials(value)) {
    return false;
  }

  return allowedHosts.includes(new URL(value).host);
}

export function httpUrlErrorMessage(): string {
  return HTTP.ERRORS.INVALID_HTTP_URL;
}

export function allowedHostErrorMessage(): string {
  return HTTP.ERRORS.HOST_NOT_ALLOWED;
}
