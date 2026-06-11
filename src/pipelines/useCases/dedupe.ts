// Purpose: Builds source-independent dedupe keys for enterprise use-case selection.
// Scope: Keeps newsletter repetition rules separate from persistence IDs and URLs.

import { createHash } from "node:crypto";

import { hasNamedEnterpriseCompany, type EnterpriseUseCase } from "./schema.js";

function normalizeDedupeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function enterpriseUseCaseCompanyKey(useCase: EnterpriseUseCase): string | null {
  if (!hasNamedEnterpriseCompany(useCase)) {
    return null;
  }

  const normalizedCompany = normalizeDedupeText(useCase.companyName);

  return normalizedCompany ? stableHash(normalizedCompany) : null;
}

export function enterpriseUseCaseFingerprint(useCase: EnterpriseUseCase): string | null {
  const companyKey = enterpriseUseCaseCompanyKey(useCase);
  if (!companyKey) {
    return null;
  }

  const businessFunction = normalizeDedupeText(useCase.businessFunction);
  const aiCapability = normalizeDedupeText(useCase.aiSystemOrCapability);
  const fingerprint = [companyKey, businessFunction, aiCapability].join("|");

  return stableHash(fingerprint);
}
