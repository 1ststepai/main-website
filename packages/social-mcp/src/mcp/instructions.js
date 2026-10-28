export const POSTPATH_INSTRUCTIONS = `PostPath keeps social account logins on this computer and stores drafts until they are approved.

status reports the local setup. list_accounts lists connected networks. upsert_profile creates or updates a brand and its presets (default platforms, privacy, hashtags, caption footer).

connect_accounts starts browser sign-in for a network. connect_bluesky stores a Bluesky app password. Neither call publishes.

stage_media saves a file into the local media folder and returns media_path. create_draft and create_post save a draft for one network (platform) or several (platforms), with optional per-network overrides for title, caption, description, hashtags, tags, a Reddit community, privacy, and placement. Omit a network's copy fields to use the base post. Optional media.generate creates an image or a silent video from a prompt and a bring-your-own-key provider. A network override can include its own generate prompt. The claude provider designs an SVG or HTML card and PostPath renders a PNG. Claude does not generate photos or video. caption_provider claude drafts per-network titles, captions, and tags. review true asks Claude for advisory notes after the asset is ready. Those notes never approve or publish the draft. Generated video has no music and no voice. A file from the client can be attached with attach_media. A draft is not published. YouTube privacy defaults to private. Facebook stays a Page draft unless facebook_public is true. Instagram has no private publish.

generate_media starts or repeats generation for an existing draft. attach_media stores a file the client already made. Neither call publishes.

get_interview reads one brand's typed answers, voice notes, and presets. PostPath does not transcribe recordings. create_drafts_from_interview saves posts the assistant already wrote as drafts for that brand. Those drafts are not published.

update_draft changes a draft that has not been sent. attach_vidiq_check records a vidIQ score and notes on a YouTube draft. Profiles that require a vidIQ check, including the profile id 1ststep-ai unless that setting is turned off, cannot be approved without one.

list_queue lists drafts waiting for approval. list_posts and get_post_status read saved posts and each network's result.

get_schedule reads one brand's posting plan and the filled and empty slots. set_posting_plan saves that plan and does not schedule drafts. suggest_slot names the next open slot and does not write it. schedule_approved_post schedules one post only when confirm is true. Without confirm, nothing is scheduled and nothing is published. get_best_times reads suggested times for one brand and one network from that account's own audience data or its own past posts, with the source and the sample size. It does not publish and it does not add a permission. The owner chooses the slot.

Call get_queue_status at the start of every session and again after create_draft, create_post, or create_drafts_from_interview. Summarize what needs the owner: drafts waiting for approval, drafts that fail a check, scheduled posts, and failed publishes. update_draft can change a draft that fails a check. Publishing still needs the owner to approve it in the desk. queue:approve stays off until the owner ticks it.

request_approval publishes a queued draft now, or schedules it, and requires the queue:approve scope. discard_draft removes a draft that has not been sent. schedule_post and cancel_scheduled_post change one post's schedule. publish_post sends one post. publish_due sends scheduled posts whose time has arrived. These calls require queue:approve. Instagram is refused until instagram_public_confirmed is true. A vidIQ gate is refused until a check is attached.`;

export const SERVER_DESCRIPTION =
  "AI drafts, you approve, logins stay on your computer. Nothing posts until you approve.";
