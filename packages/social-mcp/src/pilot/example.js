/** Insurance-broker open enrollment example. No rates, savings, or subsidy claims. */

export const COMPLIANCE_BANNER =
  "Verify every claim before posting. This draft does not promise rates, savings, subsidies, or plan outcomes.";

export const PILOT_PROFILE = { id: "broker", name: "Insurance broker" };

export const DEFAULT_PILOT_PLATFORMS = ["facebook", "instagram", "linkedin", "youtube"];

export function insuranceOpenEnrollmentPilot() {
  return {
    pilot_mode: true,
    mcp_access: "draft-only",
    niche:
      "Independent insurance brokerage. Educational posts for health-plan open enrollment. The posts explain what a conversation covers. They do not quote premiums, promise savings, or mention subsidies.",
    campaign: {
      name: "Health plan open enrollment",
      start: "2026-11-01",
      end: "2026-11-15",
    },
    compliance_notes:
      "The broker verifies every sentence before it is posted. Do not add rates, savings, subsidies, or plan-outcome promises. The campaign window in this file is November 1 through November 15, 2026.",
    compliance_banner: COMPLIANCE_BANNER,
    profile: { ...PILOT_PROFILE },
    default_platforms: [...DEFAULT_PILOT_PLATFORMS],
    goals: [
      {
        id: "quote_requests",
        label: "Quote requests",
        call_to_action:
          "Message the office to request a health-plan conversation. This post does not quote a rate.",
        topics: [
          {
            id: "gather-documents",
            title: "What to gather before a health plan conversation",
            angle: "A short list of documents that make an open-enrollment conversation easier to start.",
            points: [
              "The current plan summary, if you have one",
              "Who in the household needs coverage",
              "Doctors or prescriptions you want to ask about",
            ],
            shorts_hook: "Three things to find before you talk through a health plan.",
          },
          {
            id: "questions-to-ask",
            title: "Questions to ask during open enrollment",
            angle: "Bring questions to the conversation instead of guessing from a brochure.",
            points: [
              "Which doctors and pharmacies you want to keep available",
              "How prescriptions are handled on the plan you are comparing",
              "What you should bring to the next conversation",
            ],
            shorts_hook: "Write the questions down before open enrollment week.",
          },
          {
            id: "who-to-include",
            title: "Who to include in a family coverage conversation",
            angle: "A family conversation goes smoother when you know who the plan needs to cover.",
            points: [
              "Everyone who needs coverage this year",
              "Anyone aging off a parent plan",
              "Dependents you want named in the conversation",
            ],
            shorts_hook: "List the people first. The plan conversation comes second.",
          },
        ],
      },
      {
        id: "policy_reviews",
        label: "Policy reviews",
        call_to_action: "Ask the office for a review of your current plan documents.",
        topics: [
          {
            id: "how-a-review-works",
            title: "How a policy review conversation works",
            angle: "A review is a walkthrough of the documents you already have. It is not a promise about next year's price.",
            points: [
              "Bring the plan summary and your ID card",
              "We read the sections you care about together",
              "You leave with questions to take back to the carrier if needed",
            ],
            shorts_hook: "A policy review starts with the papers you already have.",
          },
          {
            id: "what-a-summary-shows",
            title: "What a plan summary is for",
            angle: "The summary is the page that names the plan. Read it with someone before you decide you understand it.",
            points: [
              "The plan name and who it covers",
              "The services you want to ask about",
              "Any page you do not understand yet",
            ],
            shorts_hook: "Find the plan summary before you assume you know the coverage.",
          },
          {
            id: "when-to-schedule",
            title: "When to schedule a coverage conversation",
            angle: "Open enrollment is a short window. Schedule the conversation while the window is open.",
            points: [
              "This campaign runs November 1 through November 15, 2026",
              "Bring documents a day or two before the meeting",
              "Write down what you want the conversation to cover",
            ],
            shorts_hook: "Put the conversation on the calendar during the enrollment window.",
          },
        ],
      },
      {
        id: "referrals",
        label: "Referrals",
        call_to_action:
          "If someone you know is comparing health plans, invite them to contact the office for a conversation.",
        topics: [
          {
            id: "introduce-a-neighbor",
            title: "How to introduce someone who needs a coverage conversation",
            angle: "A referral is an introduction. You do not need to explain their plan for them.",
            points: [
              "Ask if they want an introduction",
              "Share the office contact",
              "Let them bring their own documents",
            ],
            shorts_hook: "An introduction is enough. They can bring their own plan papers.",
          },
          {
            id: "what-to-bring",
            title: "What a referred client should bring",
            angle: "The first conversation is easier when the documents are in the room.",
            points: [
              "A plan summary, if they have one",
              "A list of doctors they want to ask about",
              "The enrollment deadline they are working toward",
            ],
            shorts_hook: "Tell them to bring the plan summary, not a guess.",
          },
          {
            id: "share-the-office",
            title: "A simple way to share the office contact",
            angle: "Pass the contact and let the office take the conversation from there.",
            points: [
              "Share the phone number or the office page",
              "Mention that the conversation is about their documents",
              "Do not promise what the plan will cost",
            ],
            shorts_hook: "Share the contact. Leave the plan conversation to the meeting.",
          },
        ],
      },
    ],
  };
}
