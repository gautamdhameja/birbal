import { HTTP } from "../constants/runtime.js";

const IPV4_PARTS = 4;
const IPV4_MAX_OCTET = 255;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== IPV4_PARTS) {
    return false;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > IPV4_MAX_OCTET)) {
    return false;
  }

  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function normalizeHostname(hostname: string): string {
  const normalizedHostname = hostname.toLocaleLowerCase();

  if (normalizedHostname.startsWith("[") && normalizedHostname.endsWith("]")) {
    return normalizedHostname.slice(1, -1);
  }

  return normalizedHostname;
}

function isUnsafeHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  const isIpv6Hostname = normalizedHostname.includes(":");

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname === "metadata.google.internal" ||
    normalizedHostname === "169.254.169.254" ||
    (isIpv6Hostname &&
      (normalizedHostname === "::" ||
        normalizedHostname === "::1" ||
        normalizedHostname.startsWith("::ffff:") ||
        normalizedHostname.startsWith("fc") ||
        normalizedHostname.startsWith("fd") ||
        normalizedHostname.startsWith("fe80:"))) ||
    isPrivateIpv4(normalizedHostname)
  );
}

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

export function isSafePublicHttpUrl(value: string): boolean {
  if (!isHttpUrlWithoutCredentials(value)) {
    return false;
  }

  return !isUnsafeHostname(new URL(value).hostname);
}

export function httpUrlErrorMessage(): string {
  return HTTP.ERRORS.INVALID_HTTP_URL;
}

export function unsafeHttpUrlErrorMessage(): string {
  return HTTP.ERRORS.UNSAFE_HTTP_URL;
}

export function allowedHostErrorMessage(): string {
  return HTTP.ERRORS.HOST_NOT_ALLOWED;
}
