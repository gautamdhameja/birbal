import { braveWebSearchCollector, searchSnapshotCollector } from "./components/collectors.js";
import { enterpriseUseCaseExtractor } from "./components/extractor.js";
import {
  enterpriseUseCaseFinalizer,
  enterpriseUseCaseMarkdownRenderer,
} from "./components/output.js";
import { enterpriseUseCaseSelector } from "./components/selector.js";

export const useCasePipelineComponents = {
  collectors: {
    brave_web_search_collector: braveWebSearchCollector,
    search_snapshot_collector: searchSnapshotCollector,
  },
  structuredExtractors: {
    enterprise_use_case_extractor: enterpriseUseCaseExtractor,
  },
  selectors: {
    enterprise_use_case_selector: enterpriseUseCaseSelector,
  },
  renderers: {
    enterprise_use_case_markdown_renderer: enterpriseUseCaseMarkdownRenderer,
  },
  finalizers: {
    enterprise_use_case_finalizer: enterpriseUseCaseFinalizer,
  },
} as const;
