export const INTERVIEW_NOTE =
  "PostPath does not transcribe audio. Type the answer. A recording stays on this computer for your own assistant. Nothing here is published.";

export const INTERVIEW_PROMPTS = [
  { id: "week", prompt: "What did you do this week?" },
  { id: "question", prompt: "What customer question did you answer?" },
  { id: "mistake", prompt: "What mistake should someone avoid?" },
  { id: "tip", prompt: "What tip would you share?" },
  { id: "opinion", prompt: "What opinion do you want to say out loud?" },
  { id: "next", prompt: "What should happen next for this work?" },
];

export function interviewPrompt(id) {
  return INTERVIEW_PROMPTS.find((row) => row.id === id) || null;
}
