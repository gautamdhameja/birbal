import { ARCHITECTURE_LAB } from "./constants.js";
import type {
  ArchitectureEvidence,
  ArchitectureReviewDraft,
  CaseBrief,
  CaseBriefSource,
  CaseSelection,
  EvidenceSource,
  SourceDossier,
} from "./types.js";

export type EvidenceAssessment =
  | { ok: true; quality: "sufficient" | "limited" }
  | { ok: false; message: string };

function httpHostname(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function publicationDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function recentCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ARCHITECTURE_LAB.RECENT_SOURCE_MONTHS);
  return cutoff;
}

function basicSourceError(sources: readonly EvidenceSource[]): string | undefined {
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) {
      return `Evidence source ID is duplicated: ${source.id}.`;
    }
    ids.add(source.id);
    if (!httpHostname(source.url)) {
      return `Evidence source ${source.id} must use an absolute HTTP(S) URL.`;
    }
    if (!publicationDate(source.publishedAt)) {
      return `Evidence source ${source.id} must have a valid YYYY-MM-DD publication date.`;
    }
  }
  return undefined;
}

function missingReferences(sourceIds: readonly string[], knownIds: ReadonlySet<string>): string[] {
  return sourceIds.filter((sourceId) => !knownIds.has(sourceId));
}

function hasAutomaticEvidence(sources: readonly EvidenceSource[], now: Date): boolean {
  const cutoff = recentCutoff(now);
  const hostnames = new Set(sources.map((source) => httpHostname(source.url)));
  const hasRecentSource = sources.some((source) => {
    const publishedAt = publicationDate(source.publishedAt);
    return publishedAt !== undefined && publishedAt >= cutoff && publishedAt <= now;
  });
  return sources.length >= 2 && hostnames.size >= 2 && hasRecentSource;
}

export function assessSourceDossier(
  dossier: SourceDossier,
  selection: CaseSelection,
  now: Date,
): EvidenceAssessment {
  const sourceError = basicSourceError(dossier.sources);
  if (sourceError) {
    return { ok: false, message: sourceError };
  }
  const sourceIds = new Set(dossier.sources.map((source) => source.id));
  const missingOutcomeSources = missingReferences(dossier.desiredOutcome.sourceIds, sourceIds);
  if (missingOutcomeSources.length > 0) {
    return {
      ok: false,
      message: `Desired outcome references sources absent from the dossier: ${missingOutcomeSources.join(
        ", ",
      )}.`,
    };
  }

  const automaticEvidence = hasAutomaticEvidence(dossier.sources, now);
  if (selection === "automatic" && !automaticEvidence) {
    return {
      ok: false,
      message:
        "Automatic case selection requires two HTTP(S) sources on distinct hostnames and at least one recent source.",
    };
  }

  return { ok: true, quality: automaticEvidence ? "sufficient" : "limited" };
}

export function validateCaseBriefEvidence(
  brief: CaseBrief,
  dossier: SourceDossier,
  selection: CaseSelection,
  now: Date,
): EvidenceAssessment {
  const dossierSources = new Map(dossier.sources.map((source) => [source.id, source]));
  const hydratedBriefSources: EvidenceSource[] = [];
  for (const source of brief.sources) {
    const dossierSource = dossierSources.get(source.id);
    if (
      !dossierSource ||
      dossierSource.url !== source.url ||
      dossierSource.publishedAt !== source.publishedAt
    ) {
      return {
        ok: false,
        message: `Case brief source ${source.id} is absent from or inconsistent with the research dossier.`,
      };
    }
    hydratedBriefSources.push({ ...source, excerpt: dossierSource.excerpt });
  }

  const briefSourceIds = new Set(brief.sources.map((source) => source.id));
  const missingOutcomeSources = missingReferences(brief.desiredOutcome.sourceIds, briefSourceIds);
  if (missingOutcomeSources.length > 0) {
    return {
      ok: false,
      message: `Case brief outcome references absent sources: ${missingOutcomeSources.join(", ")}.`,
    };
  }

  const sourceError = basicSourceError(hydratedBriefSources);
  if (sourceError) {
    return { ok: false, message: sourceError };
  }
  const automaticEvidence = hasAutomaticEvidence(hydratedBriefSources, now);
  if (selection === "automatic" && !automaticEvidence) {
    return {
      ok: false,
      message: "The extracted automatic case brief did not retain sufficient source evidence.",
    };
  }
  return { ok: true, quality: automaticEvidence ? "sufficient" : "limited" };
}

export function validateArchitectureEvidence(evidence: ArchitectureEvidence): EvidenceAssessment {
  const sourceError = basicSourceError(evidence.sources);
  if (sourceError) {
    return { ok: false, message: sourceError };
  }
  const sourceIds = new Set(evidence.sources.map((source) => source.id));
  for (const claim of evidence.claims) {
    const missing = missingReferences(claim.sourceIds, sourceIds);
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Architecture evidence claim ${claim.id} references absent sources: ${missing.join(
          ", ",
        )}.`,
      };
    }
  }
  return { ok: true, quality: evidence.evidenceQuality };
}

export function validateReviewEvidence(
  review: ArchitectureReviewDraft,
  brief: CaseBrief,
  evidence: ArchitectureEvidence,
): EvidenceAssessment {
  const briefSources = new Map(brief.sources.map((source) => [source.id, source]));
  for (const source of evidence.sources) {
    const existingSource = briefSources.get(source.id);
    if (existingSource && existingSource.url !== source.url) {
      return {
        ok: false,
        message: `Source ID ${source.id} resolves to inconsistent URLs across review evidence.`,
      };
    }
  }
  const knownSourceIds = new Set([
    ...brief.sources.map((source) => source.id),
    ...evidence.sources.map((source) => source.id),
  ]);
  for (const fact of review.supportedFacts) {
    const missing = missingReferences(fact.sourceIds, knownSourceIds);
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Review fact references absent sources: ${missing.join(", ")}.`,
      };
    }
  }
  return {
    ok: true,
    quality:
      brief.evidenceQuality === "limited" || evidence.evidenceQuality === "limited"
        ? "limited"
        : "sufficient",
  };
}

export function resolveReviewSources(
  review: ArchitectureReviewDraft,
  brief: CaseBrief,
  evidence: ArchitectureEvidence,
): CaseBriefSource[] {
  const sourcesById = new Map<string, CaseBriefSource>();
  for (const source of brief.sources) {
    sourcesById.set(source.id, source);
  }
  for (const { excerpt: _excerpt, ...source } of evidence.sources) {
    if (!sourcesById.has(source.id)) {
      sourcesById.set(source.id, source);
    }
  }

  const citedSourceIds = new Set(review.supportedFacts.flatMap((fact) => fact.sourceIds));
  return [...citedSourceIds].flatMap((sourceId) => {
    const source = sourcesById.get(sourceId);
    return source ? [source] : [];
  });
}
