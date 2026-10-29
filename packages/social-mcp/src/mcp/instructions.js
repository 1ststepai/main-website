export const POSTPATH_INSTRUCTIONS = `PostPath keeps social account logins on this computer and stores drafts until they are approved.

What you can and cannot do: you can read and you can draft. Every draft goes to the approval queue. Approving, publishing, scheduling, disconnecting accounts, deleting, and changing auto-post settings need the human owner on the PostPath desk with their owner PIN. The only exception is publishing on a brand and network where the owner turned auto-post on. You cannot turn auto-post on, you cannot approve for the owner, and there is no workaround: do not suggest one. If a publish call is refused, tell the user the post is waiting in the approval queue on the desk. Call get_posting_permissions to see each brand and network's mode and the real approval counts; the desk may suggest auto-post once the owner has approved enough drafts unchanged, and only the owner decides.

Call get_brand_context first. Use what it returns and do not guess blank fields. If missing lists fields, ask the user about them once, save the answers with save_brand_context, then draft. save_brand_context can record an auto-post request, but only as pending: auto-post is off unless the owner turns it on in the PostPath desk or on the connect screen, and you cannot turn it on.

status reports the local setup. list_accounts lists connected networks. upsert_profile creates or updates a brand and its presets (default platforms, privacy, hashtags, caption footer).

connect_accounts starts browser sign-in for a network. connect_bluesky stores a Bluesky app password. Neither call publishes.

stage_media saves a file into the local media folder and returns media_path. create_draft and create_post save a draft for one network (platform) or several (platforms), with optional per-network overrides for title, caption, tags, and privacy. Optional media.generate creates an image or a silent video from a prompt and a bring-your-own-key provider. The claude provider designs an SVG or HTML card and PostPath renders a PNG. Claude does not generate photos or video. caption_provider claude drafts per-network titles, captions, and tags. review true asks Claude for advisory notes after the asset is ready. Those notes never approve or publish the draft. Generated video has no music and no voice. A file from the client can be attached with attach_media. A draft is not published. YouTube privacy defaults to private. Facebook stays a Page draft unless facebook_public is true. Instagram has no private publish.

generate_media starts or repeats generation for an existing draft. attach_media stores a file the client already made. Neither call publishes.

update_draft changes a draft that has not been sent. attach_vidiq_check records a vidIQ score and notes on a YouTube draft. attach_seo_check stores a research score with its source and date. seo_draft returns per-channel copy from one topic. seo_score records advisory notes. seo_weekly_report summarizes posted drafts and saved search terms. Profiles that require a vidIQ check, including the profile id 1ststep-ai unless that setting is turned off, cannot be approved without one. Search volumes are only stored when the caller sends them. find_hook_examples lists recent public videos and the views-per-subscriber math. capture_hook_structure stores the opening shape only. generate_hook writes three original openings and can attach one to a draft. None of those calls approve or publish.

list_queue lists drafts waiting for approval. list_posts and get_post_status read saved posts and each network's result.

request_approval, schedule_post and publish_post work only where the owner turned on auto-post for that brand and network; otherwise they are refused and the draft stays in the approval queue. discard_draft always refuses: the owner deletes drafts on the desk. cancel_scheduled_post returns a scheduled post to draft. publish_due sends posts that are already scheduled. These calls require queue:approve. Instagram is refused until instagram_public_confirmed is true. A vidIQ gate is refused until a check is attached.`;

export const SERVER_DESCRIPTION =
  "AI drafts, you approve, logins stay on your computer. Nothing posts until you approve.";
