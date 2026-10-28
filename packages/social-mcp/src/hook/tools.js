import { z } from "zod";

function resultSchema(extra) {
  return z.object({ ok: z.boolean().describe("True when the tool finished."), ...extra }).passthrough();
}

const observation = z
  .object({
    opening_type: z.string().max(40).optional().describe("question, bold_claim, contrarian, result_first, pattern_interrupt, pov, or another short label."),
    pattern: z.string().max(240).optional().describe("Abstract fill-in pattern, with placeholders, not a copied sentence."),
    visual_surprise: z.string().max(160).optional().describe("What changes visually, without describing footage to copy."),
    pacing: z
      .object({
        cuts_or_beats: z.number().nullable().optional(),
        seconds_to_first_payoff: z.number().nullable().optional(),
      })
      .optional(),
    delivery: z
      .object({
        on_camera: z.boolean().nullable().optional(),
        energy: z.string().max(40).optional(),
        eye_contact: z.boolean().nullable().optional(),
        text_on_screen: z.boolean().nullable().optional(),
      })
      .optional(),
    promise: z.string().max(200).optional().describe("The curiosity gap, as a description of the gap."),
    fragment: z.string().max(80).optional().describe("Optional quote of at most 6 words. Longer text is dropped."),
  })
  .describe("A structure observation. Do not include a transcript.");

export function registerHookTools(server, { engine, gated }) {
  function add(name, title, description, scope, hints, inputSchema, outputSchema, handler) {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema,
        outputSchema,
        annotations: {
          title,
          readOnlyHint: Boolean(hints.read),
          destructiveHint: Boolean(hints.destructive),
          idempotentHint: Boolean(hints.idempotent),
          openWorldHint: Boolean(hints.open),
        },
      },
      gated(scope, handler),
    );
  }

  const hooks = () => engine.hooks;

  add(
    "find_hook_examples",
    "Find hook examples",
    "Search public YouTube videos for a topic from about the last 90 days, then rank them by views divided by subscribers, or by the median views in the set when subscriber counts are missing. The math is included. This does not download video or use vidIQ.",
    "posts:read",
    { read: true, idempotent: true, open: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Brand whose saved terms narrow the search."),
      topic: z.string().min(2).max(120).describe("Topic to search."),
      format: z.enum(["any", "shorts", "long"]).optional().describe("Shorts are 60 seconds or less. Long is everything else. Default is any."),
      days: z.number().int().min(1).max(365).optional().describe("How far back to search. Default is 90."),
    },
    resultSchema({
      available: z.boolean().optional(),
      examples: z.array(z.object({ video_id: z.string(), url: z.string(), title: z.string(), metrics: z.object({ math: z.string() }).passthrough() }).passthrough()).optional(),
    }),
    async (args) => hooks().find(args),
  );

  add(
    "capture_hook_structure",
    "Capture hook structure",
    "Store the shape of a public video's first 10 seconds: opening type, pattern, visual surprise, pacing, delivery, and promise. Uses a Gemini key when one is saved, or an observation you send. The file is not downloaded. A transcript is not stored. A quote longer than 6 words is dropped.",
    "drafts:write",
    { idempotent: true, open: true },
    {
      video_id: z.string().max(80).optional().describe("YouTube video id."),
      url: z.string().max(200).optional().describe("Public YouTube URL."),
      title: z.string().max(140).optional().describe("Title to keep as the reference link label."),
      metrics: z.object({ views: z.number().optional(), subscribers: z.number().optional(), outlier: z.number().optional(), math: z.string().optional() }).passthrough().optional().describe("Counts already fetched. Not a request to download the video."),
      observation: observation.optional().describe("Structure you observed. Omit to ask Gemini when a key is saved."),
    },
    resultSchema({
      available: z.boolean().optional(),
      structure: z.object({ video_id: z.string(), url: z.string() }).passthrough().optional(),
      stored_transcript: z.boolean().optional(),
    }),
    async (args) => hooks().capture(args),
  );

  add(
    "generate_hook",
    "Generate original hooks",
    "Write three original 10-second openings from a saved structure and the brand's voice fields. Blank voice fields stay blank. A line that repeats more than four source words in a row is dropped. Pass draft_id and pick to attach one opening to a draft. This does not approve or publish.",
    "drafts:write",
    { open: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Brand voice and avoid list."),
      topic: z.string().min(2).max(120).describe("Topic the opening is about."),
      video_id: z.string().max(80).optional().describe("Reference video whose structure was captured."),
      title: z.string().max(140).optional().describe("Reference title, used only for the copy check."),
      source_description: z.string().max(2000).optional().describe("Public description, used only for the copy check and not saved."),
      draft_id: z.string().min(8).optional().describe("Draft or bundle to attach the chosen opening to."),
      pick: z.number().int().min(1).max(3).optional().describe("Which of the three openings to attach. 1 is the first."),
      hooks: z.array(z.object({ spoken: z.string().max(400), on_screen_text: z.string().max(80).optional(), shot: z.string().max(400).optional(), why: z.string().max(400).optional(), beats: z.array(z.object({ t: z.string().optional(), text: z.string().optional() })).optional() }).passthrough()).max(3).optional().describe("Openings already written by the connected assistant, still checked for copied wording."),
    },
    resultSchema({
      mode: z.string().optional(),
      hooks: z.array(z.object({ spoken: z.string().optional(), rejected: z.boolean().optional() }).passthrough()).optional(),
      rejected: z.number().optional(),
      auto_approve: z.boolean().optional(),
    }),
    async (args) => hooks().generate(args),
  );
}
