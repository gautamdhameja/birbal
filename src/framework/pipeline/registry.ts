import type {
  ArtifactWriter,
  Classifier,
  ContentExtractor,
  ContentFetcher,
  PipelineConfig,
  Renderer,
  Scorer,
  Selector,
  SourceCollector,
  StructuredExtractor,
} from "./types.js";
import type { Rubric } from "../scoring/rubric.js";

type ComponentKind =
  | "collectors"
  | "contentFetchers"
  | "contentExtractors"
  | "scorers"
  | "classifiers"
  | "structuredExtractors"
  | "selectors"
  | "renderers"
  | "artifactWriters"
  | "rubrics";

type ComponentKindMap = {
  collectors: SourceCollector;
  contentFetchers: ContentFetcher;
  contentExtractors: ContentExtractor;
  scorers: Scorer;
  classifiers: Classifier;
  structuredExtractors: StructuredExtractor;
  selectors: Selector;
  renderers: Renderer;
  artifactWriters: ArtifactWriter;
  rubrics: Rubric;
};

type ComponentBucket<TComponent> = Map<string, TComponent>;

export type PipelineComponentRegistryOptions = {
  allowOverwrite?: boolean;
};

export type PipelineComponentRegistration = {
  collectors?: Record<string, SourceCollector>;
  contentFetchers?: Record<string, ContentFetcher>;
  contentExtractors?: Record<string, ContentExtractor>;
  scorers?: Record<string, Scorer>;
  classifiers?: Record<string, Classifier>;
  structuredExtractors?: Record<string, StructuredExtractor>;
  selectors?: Record<string, Selector>;
  renderers?: Record<string, Renderer>;
  artifactWriters?: Record<string, ArtifactWriter>;
  rubrics?: Record<string, Rubric>;
};

export type ResolvedPipelineComponents = {
  collectors: SourceCollector[];
  contentFetchers: ContentFetcher[];
  contentExtractors: ContentExtractor[];
  scorers: Scorer[];
  classifiers: Classifier[];
  structuredExtractors: StructuredExtractor[];
  selectors: Selector[];
  renderers: Renderer[];
  artifactWriters: ArtifactWriter[];
  rubrics: Rubric[];
};

function assertComponentId(id: string): void {
  if (id.trim().length === 0) {
    throw new Error("Pipeline component ID must not be empty.");
  }
}

function emptyResolvedComponents(): ResolvedPipelineComponents {
  return {
    collectors: [],
    contentFetchers: [],
    contentExtractors: [],
    scorers: [],
    classifiers: [],
    structuredExtractors: [],
    selectors: [],
    renderers: [],
    artifactWriters: [],
    rubrics: [],
  };
}

function resolveSingle<TComponent>(
  id: string | undefined,
  resolve: (id: string) => TComponent,
): TComponent[] {
  return id ? [resolve(id)] : [];
}

function resolveMany<TComponent>(
  ids: readonly string[] | undefined,
  resolve: (id: string) => TComponent,
): TComponent[] {
  return (ids ?? []).map(resolve);
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => id !== undefined))];
}

function enabledCollectorIds(config: PipelineConfig): string[] {
  return config.collectionMethods
    .filter((method) => method.enabled !== false)
    .map((method) => method.collectorId);
}

function enabledContentFetcherIds(config: PipelineConfig): Array<string | undefined> {
  return config.contentFetchPolicy.enabled ? [config.contentFetchPolicy.fetcherId] : [];
}

function enabledContentExtractorIds(config: PipelineConfig): string[] {
  return config.contentFetchPolicy.enabled ? (config.contentFetchPolicy.extractorIds ?? []) : [];
}

export class PipelineComponentRegistry {
  private readonly collectors: ComponentBucket<SourceCollector> = new Map();
  private readonly contentFetchers: ComponentBucket<ContentFetcher> = new Map();
  private readonly contentExtractors: ComponentBucket<ContentExtractor> = new Map();
  private readonly scorers: ComponentBucket<Scorer> = new Map();
  private readonly classifiers: ComponentBucket<Classifier> = new Map();
  private readonly structuredExtractors: ComponentBucket<StructuredExtractor> = new Map();
  private readonly selectors: ComponentBucket<Selector> = new Map();
  private readonly renderers: ComponentBucket<Renderer> = new Map();
  private readonly artifactWriters: ComponentBucket<ArtifactWriter> = new Map();
  private readonly rubrics: ComponentBucket<Rubric> = new Map();

  constructor(private readonly options: PipelineComponentRegistryOptions = {}) {}

  registerCollector(id: string, component: SourceCollector): void {
    this.register("collectors", id, component);
  }

  registerContentFetcher(id: string, component: ContentFetcher): void {
    this.register("contentFetchers", id, component);
  }

  registerContentExtractor(id: string, component: ContentExtractor): void {
    this.register("contentExtractors", id, component);
  }

  registerScorer(id: string, component: Scorer): void {
    this.register("scorers", id, component);
  }

  registerClassifier(id: string, component: Classifier): void {
    this.register("classifiers", id, component);
  }

  registerStructuredExtractor(id: string, component: StructuredExtractor): void {
    this.register("structuredExtractors", id, component);
  }

  registerSelector(id: string, component: Selector): void {
    this.register("selectors", id, component);
  }

  registerRenderer(id: string, component: Renderer): void {
    this.register("renderers", id, component);
  }

  registerArtifactWriter(id: string, component: ArtifactWriter): void {
    this.register("artifactWriters", id, component);
  }

  registerRubric(id: string, component: Rubric): void {
    this.register("rubrics", id, component);
  }

  registerMany(components: PipelineComponentRegistration): void {
    this.registerEntries("collectors", components.collectors);
    this.registerEntries("contentFetchers", components.contentFetchers);
    this.registerEntries("contentExtractors", components.contentExtractors);
    this.registerEntries("scorers", components.scorers);
    this.registerEntries("classifiers", components.classifiers);
    this.registerEntries("structuredExtractors", components.structuredExtractors);
    this.registerEntries("selectors", components.selectors);
    this.registerEntries("renderers", components.renderers);
    this.registerEntries("artifactWriters", components.artifactWriters);
    this.registerEntries("rubrics", components.rubrics);
  }

  getCollector(id: string): SourceCollector {
    return this.get("collectors", id);
  }

  getContentFetcher(id: string): ContentFetcher {
    return this.get("contentFetchers", id);
  }

  getContentExtractor(id: string): ContentExtractor {
    return this.get("contentExtractors", id);
  }

  getScorer(id: string): Scorer {
    return this.get("scorers", id);
  }

  getClassifier(id: string): Classifier {
    return this.get("classifiers", id);
  }

  getStructuredExtractor(id: string): StructuredExtractor {
    return this.get("structuredExtractors", id);
  }

  getSelector(id: string): Selector {
    return this.get("selectors", id);
  }

  getRenderer(id: string): Renderer {
    return this.get("renderers", id);
  }

  getArtifactWriter(id: string): ArtifactWriter {
    return this.get("artifactWriters", id);
  }

  getRubric(id: string): Rubric {
    return this.get("rubrics", id);
  }

  resolveFromConfig(config: PipelineConfig): ResolvedPipelineComponents {
    const resolved = emptyResolvedComponents();
    const componentConfig = config.components;
    if (!componentConfig) {
      resolved.collectors.push(
        ...resolveMany(uniqueIds(enabledCollectorIds(config)), (id) => this.getCollector(id)),
      );
      resolved.contentFetchers.push(
        ...resolveMany(uniqueIds(enabledContentFetcherIds(config)), (id) =>
          this.getContentFetcher(id),
        ),
      );
      resolved.contentExtractors.push(
        ...resolveMany(enabledContentExtractorIds(config), (id) => this.getContentExtractor(id)),
      );
      resolved.scorers.push(...resolveSingle(config.scorerId, (id) => this.getScorer(id)));
      resolved.classifiers.push(
        ...resolveSingle(config.classifierId, (id) => this.getClassifier(id)),
      );
      resolved.structuredExtractors.push(
        ...resolveSingle(config.structuredExtractorId, (id) => this.getStructuredExtractor(id)),
      );
      resolved.selectors.push(...resolveSingle(config.selectorId, (id) => this.getSelector(id)));
      resolved.renderers.push(...resolveSingle(config.rendererId, (id) => this.getRenderer(id)));
      resolved.artifactWriters.push(
        ...resolveSingle(config.output.artifactWriterId, (id) => this.getArtifactWriter(id)),
      );
      resolved.rubrics.push(...resolveSingle(config.rubricId, (id) => this.getRubric(id)));

      return resolved;
    }

    resolved.collectors.push(
      ...resolveMany(
        uniqueIds([
          ...enabledCollectorIds(config),
          componentConfig.collector,
          ...(componentConfig.collectors ?? []),
        ]),
        (id) => this.getCollector(id),
      ),
    );
    resolved.contentFetchers.push(
      ...resolveMany(
        uniqueIds([
          ...enabledContentFetcherIds(config),
          ...(config.contentFetchPolicy.enabled
            ? [componentConfig.contentFetcher, ...(componentConfig.contentFetchers ?? [])]
            : []),
        ]),
        (id) => this.getContentFetcher(id),
      ),
    );
    resolved.contentExtractors.push(
      ...resolveMany(
        uniqueIds([
          ...enabledContentExtractorIds(config),
          ...(config.contentFetchPolicy.enabled
            ? [componentConfig.contentExtractor, ...(componentConfig.contentExtractors ?? [])]
            : []),
        ]),
        (id) => this.getContentExtractor(id),
      ),
    );
    resolved.scorers.push(
      ...resolveMany(
        uniqueIds([config.scorerId, componentConfig.scorer, ...(componentConfig.scorers ?? [])]),
        (id) => this.getScorer(id),
      ),
    );
    resolved.classifiers.push(
      ...resolveMany(
        uniqueIds([
          config.classifierId,
          componentConfig.classifier,
          ...(componentConfig.classifiers ?? []),
        ]),
        (id) => this.getClassifier(id),
      ),
    );
    resolved.structuredExtractors.push(
      ...resolveMany(
        uniqueIds([
          config.structuredExtractorId,
          componentConfig.structuredExtractor,
          ...(componentConfig.structuredExtractors ?? []),
        ]),
        (id) => this.getStructuredExtractor(id),
      ),
    );
    resolved.selectors.push(
      ...resolveMany(
        uniqueIds([
          config.selectorId,
          componentConfig.selector,
          ...(componentConfig.selectors ?? []),
        ]),
        (id) => this.getSelector(id),
      ),
    );
    resolved.renderers.push(
      ...resolveMany(
        uniqueIds([
          config.rendererId,
          componentConfig.renderer,
          ...(componentConfig.renderers ?? []),
        ]),
        (id) => this.getRenderer(id),
      ),
    );
    resolved.artifactWriters.push(
      ...resolveMany(
        uniqueIds([
          config.output.artifactWriterId,
          componentConfig.artifactWriter,
          ...(componentConfig.artifactWriters ?? []),
        ]),
        (id) => this.getArtifactWriter(id),
      ),
    );
    resolved.rubrics.push(
      ...resolveMany(
        uniqueIds([config.rubricId, componentConfig.rubric, ...(componentConfig.rubrics ?? [])]),
        (id) => this.getRubric(id),
      ),
    );

    return resolved;
  }

  private register<K extends ComponentKind>(
    kind: K,
    id: string,
    component: ComponentKindMap[K],
  ): void {
    assertComponentId(id);

    const bucket = this.bucket(kind);
    if (!this.options.allowOverwrite && bucket.has(id)) {
      throw new Error(`Pipeline component already registered: ${kind}.${id}`);
    }

    bucket.set(id, component);
  }

  private registerEntries<K extends ComponentKind>(
    kind: K,
    entries: Record<string, ComponentKindMap[K]> | undefined,
  ): void {
    for (const [id, component] of Object.entries(entries ?? {})) {
      this.register(kind, id, component);
    }
  }

  private get<K extends ComponentKind>(kind: K, id: string): ComponentKindMap[K] {
    assertComponentId(id);

    const component = this.bucket(kind).get(id);
    if (!component) {
      throw new Error(`Unknown pipeline component: ${kind}.${id}`);
    }

    return component;
  }

  private bucket<K extends ComponentKind>(kind: K): ComponentBucket<ComponentKindMap[K]> {
    return this[kind] as ComponentBucket<ComponentKindMap[K]>;
  }
}

export const pipelineComponentRegistry = new PipelineComponentRegistry();
