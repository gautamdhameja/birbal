// Purpose: Implements daily digest Markdown rendering.
// Scope: Converts selected daily items into the final digest artifact.

import { writeDigest } from "../../../daily/digest.js";
import type { ScoredCandidateItem } from "../../../daily/types.js";
import type { Renderer } from "../../../framework/pipeline/types.js";
import { runDateString } from "../../componentHelpers.js";

export const dailyMarkdownRenderer: Renderer = {
  async render(items, context) {
    return writeDigest(items as ScoredCandidateItem[], runDateString(context));
  },
};
