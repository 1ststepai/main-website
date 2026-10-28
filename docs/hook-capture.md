# An opening shape, not a copied video

Finding a recent video, working out why its opening outperformed the channel, and writing an original 10-second opening is **20 actions** by hand. With a Gemini key on this computer it is **7 actions**. If the brand and the topic are already filled in, it is **5 actions**.

This is a count of actions, not a promise about minutes saved.

Without that key, you paste what you saw in the first 10 seconds. That path is **8 actions**, or **6** when the brand and topic are already filled in.

## Concept-level only

This is concept-level only. A pattern is not something we copy as footage or as a script. The video and its wording stay theirs. PostPath keeps the shape, the link, and the public counts. It does not keep the video, the audio, or a transcript. Patterns are not treated as something we can lift. Footage and wording are, so neither is copied.

## What you get

You keep the same topic from the keyword step. PostPath looks for recent public videos, shows the views divided by the channel's subscriber count, and keeps the opening shape: the kind of first line, the fill-in pattern, the visual change, the pacing, how it is delivered, and the curiosity gap. You then get three openings written for your topic. Each one has the spoken line, the on-screen text, a shot you can film yourself, the beats from 0 to 10 seconds, and why that shape fits.

You pick one. It becomes the on-camera script on the draft, the first line of each channel's caption, and the prompt for generated media if you use that. The approval queue still shows the SEO notes. One Approve is still the only way it posts. Nothing posts by itself.

Tone, words to avoid, on-camera style, energy, and whether you appear on camera start blank for 1stStep.ai, SkillSprout, Swing Trade Pros, and DaySetGo. Blank means we do not know yet. Fill them when you want the line to sound like you.

## By hand

1. Search YouTube for the topic.
2. Keep videos from about the last 90 days.
3. Separate Shorts from longer videos.
4. Read the view count.
5. Read the channel's subscriber count.
6. Divide views by subscribers and keep the ratio.
7. Watch the first 10 seconds without downloading the video.
8. Name the opening type.
9. Write the question or claim as a fill-in pattern.
10. Note the visual surprise.
11. Count the cuts or beats and the seconds until the first payoff.
12. Note on camera or voiceover, energy, eye contact, and on-screen text.
13. Write the promise or the curiosity gap.
14. Write a new spoken line for this brand and topic.
15. Write the on-screen text.
16. Write the shot you will film yourself.
17. Mark what happens from 0 to 10 seconds.
18. Write why that shape fits this topic.
19. Compare your line with the source title and description and remove any copied run of words.
20. Put the spoken line on the draft and the shot on the media prompt.

## In this step

1. Choose the brand. Skip this when that brand is already selected.
2. Type the topic once. Skip this when the keyword step already has it.
3. Click Find examples.
4. Click the example you want.
5. Click Read the opening.
6. Click Write 3 hooks.
7. Click Use this hook.

## Setup

Find examples uses the YouTube account already connected for posting, or a YouTube API key saved on this computer (`YOUTUBE_API_KEY` or `GOOGLE_API_KEY`). The search is YouTube Data API `search.list` plus `videos.list` and channel subscriber counts. It asks for videos published in about the last 90 days. Shorts are treated as 60 seconds or less. The rank is views divided by subscribers. If the subscriber count is missing, the rank is views divided by the median views in that result set, and the panel shows the division. A search costs about 100 quota units on the Google project that owns the key. vidIQ is not used for this search.

Read the opening uses `GEMINI_API_KEY`. The request sends the public watch link and `videoMetadata` `startOffset` `0s` and `endOffset` `10s`. It does not download, store, or re-host the file or the audio. If there is no key, paste an observation instead. A quote longer than six words is dropped. A transcript is not stored.

Write 3 hooks uses `ANTHROPIC_API_KEY` and Claude. Tests use a stand-in writer. If the key is missing, the connected assistant can send three openings and PostPath still rejects any line that repeats more than four words in a row from the reference title, description, or saved fragment. The panel shows the reference as “structure borrowed from” with the public link.

The voice fields stay empty until you type them. PostPath does not invent a personality to fill the gap.
