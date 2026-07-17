// Purpose: Defines SQLite statements for the useCaseModelCache database domain.
// Scope: Owns use-case extraction and verification cache statements.

export const USE_CASE_MODEL_CACHE_SQL = {
  GET_USE_CASE_EXTRACTION_CACHE: `
      SELECT use_cases_json
      FROM use_case_extraction_cache
      WHERE source_url = ?
        AND content_hash = ?
        AND extractor_version = ?
      LIMIT 1
    `,
  UPSERT_USE_CASE_EXTRACTION_CACHE: `
      INSERT INTO use_case_extraction_cache (
        cache_key,
        source_url,
        content_hash,
        extractor_version,
        use_cases_json
      )
      VALUES (
        @cacheKey,
        @sourceUrl,
        @contentHash,
        @extractorVersion,
        @useCasesJson
      )
      ON CONFLICT(source_url, content_hash, extractor_version) DO UPDATE SET
        use_cases_json = excluded.use_cases_json,
        updated_at = CURRENT_TIMESTAMP
    `,
  GET_USE_CASE_VERIFICATION_CACHE: `
      SELECT verification_json
      FROM use_case_verification_cache
      WHERE use_case_hash = ?
        AND evidence_hash = ?
        AND verifier_version = ?
      LIMIT 1
    `,
  UPSERT_USE_CASE_VERIFICATION_CACHE: `
      INSERT INTO use_case_verification_cache (
        cache_key,
        use_case_hash,
        evidence_hash,
        verifier_version,
        verification_json
      )
      VALUES (
        @cacheKey,
        @useCaseHash,
        @evidenceHash,
        @verifierVersion,
        @verificationJson
      )
      ON CONFLICT(use_case_hash, evidence_hash, verifier_version) DO UPDATE SET
        verification_json = excluded.verification_json,
        updated_at = CURRENT_TIMESTAMP
    `,
} as const;
