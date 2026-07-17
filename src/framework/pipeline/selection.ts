import { positiveInteger } from "./concurrency.js";

export type BackfillSelectionResult<TCandidate, TAccepted = TCandidate> = {
  candidatePool: TCandidate[];
  acceptedPool: TAccepted[];
  processedCandidateCount: number;
  selected: TAccepted[];
};

export type SelectWithAcceptanceBackfillOptions<TCandidate, TAccepted = TCandidate> = {
  candidates: readonly TCandidate[];
  candidatePoolSize: number;
  targetCount: number;
  selectCandidates(candidates: readonly TCandidate[], limit: number): TCandidate[];
  acceptCandidates(candidates: readonly TCandidate[]): Promise<TAccepted[]> | TAccepted[];
  selectAccepted(candidates: readonly TAccepted[], limit: number): TAccepted[];
};

export type SelectWithIncrementalAcceptanceOptions<
  TCandidate,
  TAccepted = TCandidate,
> = SelectWithAcceptanceBackfillOptions<TCandidate, TAccepted> & {
  batchSize: number;
};

export async function selectWithAcceptanceBackfill<TCandidate, TAccepted = TCandidate>({
  candidates,
  candidatePoolSize,
  targetCount,
  selectCandidates,
  acceptCandidates,
  selectAccepted,
}: SelectWithAcceptanceBackfillOptions<TCandidate, TAccepted>): Promise<
  BackfillSelectionResult<TCandidate, TAccepted>
> {
  const resolvedTargetCount = positiveInteger(targetCount, "targetCount");
  const resolvedCandidatePoolSize = Math.max(
    resolvedTargetCount,
    positiveInteger(candidatePoolSize, "candidatePoolSize"),
  );
  const candidatePool = selectCandidates(candidates, resolvedCandidatePoolSize);
  const acceptedPool = await acceptCandidates(candidatePool);
  const selected = selectAccepted(acceptedPool, resolvedTargetCount);

  return {
    candidatePool,
    acceptedPool,
    processedCandidateCount: candidatePool.length,
    selected,
  };
}

export async function selectWithIncrementalAcceptance<TCandidate, TAccepted = TCandidate>({
  acceptCandidates,
  batchSize,
  candidates,
  candidatePoolSize,
  selectAccepted,
  selectCandidates,
  targetCount,
}: SelectWithIncrementalAcceptanceOptions<TCandidate, TAccepted>): Promise<
  BackfillSelectionResult<TCandidate, TAccepted>
> {
  const resolvedTargetCount = positiveInteger(targetCount, "targetCount");
  const resolvedBatchSize = positiveInteger(batchSize, "batchSize");
  const resolvedCandidatePoolSize = Math.max(
    resolvedTargetCount,
    positiveInteger(candidatePoolSize, "candidatePoolSize"),
  );
  const candidatePool = selectCandidates(candidates, resolvedCandidatePoolSize);
  const acceptedPool: TAccepted[] = [];
  let selected: TAccepted[] = [];
  let processedCandidateCount = 0;

  while (processedCandidateCount < candidatePool.length && selected.length < resolvedTargetCount) {
    const batch = candidatePool.slice(
      processedCandidateCount,
      processedCandidateCount + resolvedBatchSize,
    );
    acceptedPool.push(...(await acceptCandidates(batch)));
    processedCandidateCount += batch.length;
    selected = selectAccepted(acceptedPool, resolvedTargetCount);
  }

  return {
    candidatePool,
    acceptedPool,
    processedCandidateCount,
    selected,
  };
}
