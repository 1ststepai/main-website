import { helpCopy } from "./steps.js";
import { listKeywordProfiles, saveKeywordProfile } from "./keywords.js";
import { suggestKeywords } from "./suggest.js";
import { attachKeywordResearch } from "./research.js";
import { draftCopy } from "./draft.js";
import { annotateQueueItem, scoreSupplied } from "./score.js";
import { connectSearchData, syncSearchTerms, searchDataStatus } from "./searchData.js";
import { keywordPlannerStub, trendsStub } from "./stubs.js";
import { weeklyReport } from "./report.js";
import { queueDrafts } from "./queue.js";

export function createSeo({
  store,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  captionProvider = null,
  connectSearch = null,
  createDraft = null,
} = {}) {
  if (!store) throw new Error("createSeo requires a store.");
  const ctx = { store, env, fetchImpl, now, captionProvider, connectSearch, createDraft };
  return {
    listKeywordProfiles: () => listKeywordProfiles(ctx),
    saveKeywordProfile: (input, options) => saveKeywordProfile(ctx, input, options),
    suggestKeywords: (input) => suggestKeywords(ctx, input),
    attachKeywordResearch: (input) => attachKeywordResearch(ctx, input),
    draft: (input) => draftCopy(ctx, input),
    score: (input) => scoreSupplied(ctx, input),
    annotateQueueItem: (item) => annotateQueueItem(ctx, item),
    connectSearchData: (input) => connectSearchData(ctx, input),
    syncSearchTerms: (input) => syncSearchTerms(ctx, input),
    searchDataStatus: (profileId) => searchDataStatus(store, profileId),
    weeklyReport: (input) => weeklyReport(ctx, input),
    keywordPlanner: () => keywordPlannerStub(env),
    trends: () => trendsStub(env),
    help: () => helpCopy(),
    queueDrafts: (input) => queueDrafts(ctx, input),
  };
}
