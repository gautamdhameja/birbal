import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";

import ipaddr from "ipaddr.js";

import { HTTP } from "../constants/runtime.js";

export type HostAddress = Pick<LookupAddress, "address" | "family">;
export type HostResolver = (hostname: string) => Promise<readonly HostAddress[]>;

const UNSAFE_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

async function resolveHostname(hostname: string): Promise<readonly HostAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

function normalizeHostname(hostname: string): string {
  const normalizedHostname = hostname.toLowerCase();

  if (normalizedHostname.startsWith("[") && normalizedHostname.endsWith("]")) {
    return normalizedHostname.slice(1, -1);
  }

  return normalizedHostname.endsWith(".") ? normalizedHostname.slice(0, -1) : normalizedHostname;
}

function parseIpAddress(hostname: string): ipaddr.IPv4 | ipaddr.IPv6 | undefined {
  try {
    return ipaddr.process(hostname);
  } catch {
    return undefined;
  }
}

function isPublicIpAddress(address: string): boolean {
  return parseIpAddress(address)?.range() === "unicast";
}

function isUnsafeHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  return (
    UNSAFE_HOSTNAMES.has(normalizedHostname) ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    (parseIpAddress(normalizedHostname) !== undefined && !isPublicIpAddress(normalizedHostname))
  );
}

async function resolvesOnlyToPublicAddresses(
  hostname: string,
  resolver: HostResolver,
): Promise<boolean> {
  const normalizedHostname = normalizeHostname(hostname);
  if (parseIpAddress(normalizedHostname) !== undefined) {
    return isPublicIpAddress(normalizedHostname);
  }

  try {
    const addresses = await resolver(normalizedHostname);
    return addresses.length > 0 && addresses.every((address) => isPublicIpAddress(address.address));
  } catch {
    return false;
  }
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

export async function assertSafePublicHttpUrl(
  value: string,
  resolver: HostResolver = resolveHostname,
): Promise<void> {
  if (!isSafePublicHttpUrl(value)) {
    throw new Error(unsafeHttpUrlErrorMessage());
  }

  if (!(await resolvesOnlyToPublicAddresses(new URL(value).hostname, resolver))) {
    throw new Error(unsafeHttpUrlErrorMessage());
  }
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
