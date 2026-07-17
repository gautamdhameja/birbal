import { upsertItem } from "../../../db/items.js";
import { selectDigestItemsWithTrace } from "../../../daily/digestSelection.js";
import type { Selector } from "../../../../framework/pipeline/types.js";
import type { PipelineRunItem } from "../../../../framework/pipeline/orchestrator.js";
import { outputLimit, preferencesFromContext } from "../../componentHelpers.js";
import { dailyScoredItemFromRunItem } from "./support.js";

export const dailyEnterpriseMixSelector: Selector = {
  async select(items, context) {
    const scoredItems = (items as PipelineRunItem[]).map(dailyScoredItemFromRunItem);
    for (const item of scoredItems) {
      upsertItem(item);
    }

    const { selectedItems, trace } = selectDigestItemsWithTrace(
      scoredItems,
      preferencesFromContext(context),
    );
    const limit = outputLimit(context);

    context.logger.info(
      {
        event: "pipeline.daily.selection",
        counts: trace.counts,
        selected: trace.selected,
      },
      "daily digest selection complete",
    );

    return typeof limit === "number" ? selectedItems.slice(0, limit) : selectedItems;
  },
};
