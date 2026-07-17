import { enterpriseDigestClassifier } from "./components/classifier.js";
import { sourceDomainCollector } from "./components/collector.js";
import { dailyMarkdownRenderer } from "./components/renderer.js";
import { enterpriseDeploymentScorer } from "./components/scorer.js";
import { dailyEnterpriseMixSelector } from "./components/selector.js";
import { enterpriseDailyReadingRubric } from "./rubric.js";

export const dailyPipelineComponents = {
  collectors: {
    source_domain_collector: sourceDomainCollector,
  },
  scorers: {
    enterprise_deployment_scorer: enterpriseDeploymentScorer,
  },
  classifiers: {
    enterprise_digest_classifier: enterpriseDigestClassifier,
  },
  selectors: {
    daily_enterprise_mix_selector: dailyEnterpriseMixSelector,
  },
  renderers: {
    daily_markdown_renderer: dailyMarkdownRenderer,
  },
  rubrics: {
    [enterpriseDailyReadingRubric.id]: enterpriseDailyReadingRubric,
  },
} as const;
