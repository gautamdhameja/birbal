// Purpose: Implements use-case web-search and snapshot collectors.
// Scope: Owns candidate acquisition for the use-case pipeline.

import { searchWeb } from "../../../brave-search/client.js";
import {
  getLatestSearchSnapshot,
  getSearchSnapshot,
  listSearchSnapshotItems,
} from "../../../db/searchSnapshots.js";
import type {
  PipelineCollectionMethod,
  SourceCollector,
} from "../../../framework/pipeline/types.js";
import {
  collectUseCaseSearchCandidates,
  isRecentUseCaseSearchCandidate,
  searchSnapshotItemToCandidate,
} from "../search.js";
import { snapshotIdFromMethod, useCaseQueries, useCaseScoutConfigFromContext } from "./support.js";

export const braveWebSearchCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    const config = useCaseScoutConfigFromContext(context, collectionMethod);
    const queries = useCaseQueries(collectionMethod);
    const result = await collectUseCaseSearchCandidates(
      config,
      (query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }),
      queries,
    );

    context.logger.info(
      {
        event: "pipeline.use_cases.search_queries",
        collectorId: collectionMethod.collectorId,
        methodId: collectionMethod.id,
        configuredQueryCount: queries.length,
        searchedQueryCount: result.searchedQueries,
      },
      "use-case search queries selected",
    );

    if (result.searchErrors.length > 0) {
      context.logger.warn(
        {
          event: "pipeline.search_errors",
          errors: result.searchErrors,
        },
        "web search completed with errors",
      );
    }

    return {
      items: result.candidates,
      errors: result.searchErrors.map((error) => ({
        message: error.error,
        stepId: collectionMethod.id,
        code: "source_collection_failed",
        metadata: {
          query: error.query,
          collectorId: collectionMethod.collectorId,
        },
      })),
    };
  },
};

export const searchSnapshotCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    const requestedSnapshotId = snapshotIdFromMethod(collectionMethod);
    const snapshot =
      requestedSnapshotId === "latest"
        ? getLatestSearchSnapshot(context.pipelineId)
        : getSearchSnapshot(requestedSnapshotId);

    if (!snapshot) {
      throw new Error(`Search snapshot not found: ${requestedSnapshotId}`);
    }

    if (snapshot.pipelineId !== context.pipelineId) {
      throw new Error(
        `Search snapshot ${snapshot.id} belongs to ${snapshot.pipelineId}, not ${context.pipelineId}.`,
      );
    }

    const candidates = listSearchSnapshotItems(snapshot.id)
      .map(searchSnapshotItemToCandidate)
      .filter((candidate) =>
        isRecentUseCaseSearchCandidate(candidate, {
          maxCandidateAgeDays: context.config.limits.maxItemAgeDays,
          referenceDate: context.startedAt,
        }),
      );
    context.logger.info(
      {
        event: "pipeline.use_cases.search_snapshot_loaded",
        snapshotId: snapshot.id,
        candidateCount: candidates.length,
      },
      "use-case search snapshot loaded",
    );

    return candidates;
  },
};
