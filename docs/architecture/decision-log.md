# Architecture Decision Log

## 2026-10-27: Social Connector desk is the human product surface

- **Status / owner:** Evan rejected chat/CLI MCP setup friction and asked to fully build desktop + MCP connectors. Same branch `cursor/social-local-mcp-c683`. No production website deploy.
- **Decision:** The product entrypoint is `social-mcp app` (Windows: `scripts/Open-SocialConnector.bat`). A local desk on `127.0.0.1:47830` handles profile naming, OAuth app credentials (`oauth.env`), Connect accounts, and **Enable in Cursor** (merges `~/.cursor/mcp.json`). MCP stdio remains the agent interface and loads `oauth.env` automatically. Humans should not paste MCP JSON into chat.
- **Rationale:** MCP is plumbing. A sellable connector needs a one-window connect path on the user’s OS.
- **Affected systems:** `packages/social-mcp/src/desk/`, `bin/social-mcp.js`, Windows launchers, `docs/SOCIAL_MCP.md`.
- **Verification:** `cd packages/social-mcp && npm test` including desk HTTP tests.
- **Rollback:** Remove desk/launcher files; CLI/MCP server can remain.

## 2026-10-26: Local Social MCP as a sellable connector product

- **Status / owner:** Evan asked to build a local desktop/MCP connector so any AI can connect socials for any brand/user, draft, schedule, and publish — instead of paying social-API SaaS aggregators. Scaffold on branch `cursor/social-local-mcp-c683`. No production website deploy.
- **Decision:** Ship `packages/social-mcp` as a local-first MCP server (`@1ststep/social-mcp`). Profiles are arbitrary brands/users. OAuth callback listens on `127.0.0.1:47831`. Connection tokens are AES-256-GCM encrypted under `~/.social-mcp`. Connect chain is YouTube → Meta (Facebook Page + Instagram) → TikTok. YouTube and TikTok publish from a local `media_path`; Instagram/Facebook require an https `media_url` because Meta’s APIs do. The hosted studio queue on `1ststep.ai/admin` remains the owner desk for 1stStep brands; this package is the portable product surface.
- **Rationale:** The paid SaaS middlemen mostly sell OAuth + a stable API. MCP is that API for agents. Keeping tokens on-device is the trust wedge and removes the recurring micro-subscription for the core loop.
- **Affected systems:** `packages/social-mcp/`, this decision log, `docs/SOCIAL_MCP.md`.
- **Verification:** `cd packages/social-mcp && npm test`. No live platform upload in CI.
- **Rollback:** Remove `packages/social-mcp`. Users delete `~/.social-mcp` locally. No production env change.

## 2026-10-26: Social publishers and the Swing Trade Pros owner path

- **Status / owner:** Evan asked to finish the studio social queue on PR #29. Review only. No production deploy and no production env changes.
- **Decision:** The studio at `/admin/` remains the control plane. One short can be queued for YouTube, Instagram, Facebook, and TikTok with separate copy. YouTube still uploads private first and still requires vidIQ scores or a typed override; this server does not call vidIQ. Swing Trade Pros YouTube must be channel `UC86s7HqMAR-FSfxuv1N1Pwg` and Instagram must be `28230105726692205`, or the connection is refused. Instagram `media_publish` runs only when privacy is public. Facebook private finishes as an unpublished Page Reel (`handed_off`). TikTok uses the inbox upload and is not marked published. X stays unimplemented.
- **Rationale:** Those are the platform APIs that can run with the permissions we can request. Marking a builder as published would be false. The known STP account ids are the ownership check.
- **Affected systems:** `lib/social/`, `api/social/`, `src/admin/SocialDesk.jsx`, `docs/SOCIAL_POSTING.md`, `docs/SOCIAL_OWNER_HANDOFF.md`.
- **Verification:** `test/socialPosting.test.js`. No live platform upload in this change. The Bitcoin short file is not in this repository.
- **Rollback:** Revert this PR. Disconnect the brand in the studio, then delete `social:v1:` KV keys and the private Blob prefix `social/`. Do not add the new env vars to Production as part of this work.

## 2026-10-25: Multi-brand social queue, YouTube first

- **Status / owner:** Evan asked for a lean v1 inside the existing studio. Review PR only. No production deploy and no production env changes.
- **Decision:** Brands live in `lib/social/brands.js`. Posts, hashed brand tokens, the audit log, and encrypted YouTube connections are records in the existing Vercel KV store, under `social:v1:` keys, separate from the studio workspace. Video and thumbnail bytes go to a private Vercel Blob store through a client upload token. Serverless functions never receive the file body. The owner approves from `/admin/`. A YouTube post cannot be approved unless the title score and thumbnail score are at least 90 and keywords are present, unless the owner types an override reason that is written to the audit log. Brand tokens can draft only for their own brand. The server does not call vidIQ. Instagram, Facebook, TikTok, and X have publisher stubs only. Scheduled posts move through a manual Publish due action and `POST /api/social/cron` with `SOCIAL_CRON_SECRET`. No cron is declared in `vercel.json`.
- **Rationale:** The studio already has owner auth and KV. Blob client uploads are the path that survives the function body limit. A separate encryption key keeps YouTube refresh tokens away from the studio and payment keys.
- **Affected systems:** `lib/social/`, `api/social/`, `src/admin/SocialDesk.jsx`, studio navigation, `docs/SOCIAL_POSTING.md`.
- **Verification:** `test/socialPosting.test.js` covers token hashing, encryption round trip, brand scope, the score gate, owner override, and that agents cannot approve.
- **Rollback:** Remove the social routes, library, and studio page. KV keys under `social:v1:` and the Blob store can be deleted. No production env was changed by this work.

## 2026-10-22: Universal Relocations origin demo

- **Status / owner:** Evan asked for the Origin Service US overview on the pricing preview branch. No production deploy.
- **Decision:** `/work/universal-relocations/` hosts the staff portal for the U.S. origin leg. The only disclosure is one muted line: fictional placeholders, and nothing on the page is a quote or a rate. The homepage proof strip places it beside Lyons Life. `/work/` includes the same case. No metrics are added.
- **Rationale:** The portal is a real piece of work. The names and lanes in the walk-through are placeholders, so the page says that once.
- **Affected systems:** `public/work/universal-relocations/index.html`, `index.html`, `work/index.html`, `src/home-v2.css`, `public/home-v2/universal-relocations.webp`, sitemap, `public/llms.txt`, Vite routes, `vercel.json`.
- **Rollback:** Remove the page, the proof card, the portfolio piece, and the sitemap entry.

## 2026-10-22: Homepage conversion order

- **Status / owner:** Evan approved a conversion-focused homepage restructure on the pricing preview branch. No production deploy.
- **Decision:** Homepage order is hero, problem, how it works, services and pricing, proof, founder, a hidden testimonial slot, FAQ, then a final call band. The hero has one primary button, Book a free 20-min call, and a text link, See pricing. The full portfolio, including the studio reel, lives at `/work/`. The homepage proof strip features the Lyons Life Command Center and small thumbnails. The testimonial slot is in the page and hidden, with no quotes. A mobile bar says Book a call. The website-strategy calendar is still `/book/`.
- **Rationale:** Pricing and the next step should sit high. The large portfolio was pushing them down. Empty testimonial slots should not invent quotes.
- **Affected systems:** `index.html`, `work/index.html`, `pricing/index.html`, `src/home-v2.css`, shared Work links, sitemap, `public/llms.txt`, Vite input, `vercel.json`.
- **Rollback:** Restore the previous homepage section order and point Work links at `/#work`. Do not merge this branch unless Evan asks.

## 2026-10-22: Published starting ranges

- **Status / owner:** Evan listed the ranges and asked for a homepage Pricing section plus `/pricing/`, preview only. No production deploy.
- **Decision:** The homepage and `/pricing/` show six cards: Business & Bottleneck Audit $750–$1,500 flat, credited toward the build; Website Build from $3,500; Automations & Integrations from $2,500 per workflow; App Development from $10,000 (MVP); Build Rescue & Handoff starts with a $1,000 code review; Consulting & Support $150–$200/hr or retainers from $1,500/mo. Each card links to `/book/` with the label Book a call. The note is “Every project is scoped on a free call.” The primary nav says Pricing. The studio reel is not a priced offer.
- **Rationale:** Visitors should see the real starting ranges without a cartoon-ad price or a claim that the website-strategy calendar is a systems audit.
- **Affected systems:** `index.html`, `pricing/index.html`, `src/home-v2.css`, `src/motion.css`, shared primary nav, sitemap, `public/llms.txt`, Vite input, `vercel.json`.
- **Rollback:** Remove the section, page, nav link, and sitemap entry. Do not merge this branch to production unless Evan asks.

## 2026-10-22: Product names restored before production

- **Status / owner:** Evan approved production and asked for the product names and awkward swaps to be corrected first. Preview, then merge of PR #19.
- **Decision:** Swing Trade Pros keeps the product names Node AI and Nova AI. The app stays Job Agent, which is the name on app.1ststep.ai. Discovery copy says search and chat answers, visibility in search and chat assistants, and SEARCH & ASSISTANT SHARE OF VOICE. The OS line reads as engineering with agents. 1stStep.ai stays.
- **Rationale:** Node AI and Nova AI are names on swingtradepros.com. The job product is labeled Job Agent in the app. The earlier substitutes “answer search” and “answer engines” did not read as finished copy.
- **Affected systems:** Homepage, `/os`, tools listings, revenue FAQ, outgrown-website campaign, `public/llms.txt`.
- **Rollback:** Revert this commit. Production stays on the previous main deployment until this merge is deployed.

## 2026-10-22: Visible copy drops the standalone word AI

- **Status / owner:** Evan asked for the word AI to leave user-visible copy, on the same preview branch. No production deploy.
- **Decision:** Nav, headings, buttons, and body copy use agents, automation, assistant, or team training instead of the standalone word AI. Named swaps: Agent Operations, Assistant, Agents that work for your business, with you in control, and Team Training. 1stStep.ai stays, including the blue .ai wordmark. File names, URLs, schema organization name, and non-visible keys such as `ai-system-agent` and `genome-ai` stay.
- **Rationale:** The brand already carries .ai. Repeating AI in the interface made the copy sound generic.
- **Affected systems:** Homepage, Lyons Life demo, service pages, `/os`, tools listings, fit check, journey, app idea checker, foundry labels, admin labels, `public/llms.txt`.
- **Rollback:** Restore the previous visible labels. Do not rename 1stStep.ai while rolling back.

## 2026-10-22: One quiet disclosure on each showcase

- **Status / owner:** Evan asked for premium copy on the site, the Lyons Life demo, and the AI console. Preview only. No production deploy.
- **Decision:** Repeated sample, example, and simulated badges come off the hero, the lost-to-booked path, the AI console, and the Lyons Life demo. Each of those showcases keeps one muted line, “Illustrative data.” Lyons safety states read Supervised, Approval-gated, and Approval required, with the approval control drawn on. The brief buttons are Generate brief and Download brief. Selected work now says “Products we built.” The App Idea Checker preview keeps one quiet “Illustrative data” line beside the sample score. Concept-versus-live labels on 1stStep OS and the Auto Model Router stay, because those pages are not presenting invented results as a product demo.
- **Rationale:** A showcase should feel finished. The numbers are still not real results, so one quiet line carries that, instead of a badge on every panel.
- **Affected systems:** `index.html`, `src/home-v2.css`, `public/work/lyons-life-demo/index.html`, `public/home-v2/lyons-life.webp`, `public/llms.txt`, `app-idea-viability-checker.html`.
- **Rollback:** Restore the previous badge copy and the sample banner.

## 2026-10-22: Lyons Life sample motion stays cheap and stops offscreen

- **Status / owner:** Evan asked for staggered section motion and an ambient background on the hosted sample. Preview only. No production deploy.
- **Decision:** Website rows slide in with a stagger, and the green and amber status dots pulse. Organic search numbers count up from zero in order, then the visibility bars fill one after the other. On Executive reports, the period control, Generate button, and brief sections arrive in sequence, and Download has a repeating shine. A slow gradient drift and a few particles sit behind the demo. They use transform and opacity, pause while the browser tab is hidden, and stay still under reduced motion.
- **Rationale:** The sample should feel alive without a canvas loop or a cost while the visitor is in another tab.
- **Affected systems:** `public/work/lyons-life-demo/index.html`.
- **Rollback:** Remove the ambient layer, the pause class, and the staggered delays.

## 2026-10-22: Lyons Life sample uses a dark command center

- **Status / owner:** Evan asked for a premium redesign of the hosted sample. Preview only. No production deploy.
- **Decision:** `/work/lyons-life-demo/` is a dark cinematic command center with a light theme control. Panels are glass, accents are lime and blue, and motion is fade, slide, count-up, row, and bar fill. Reduced motion shows the finished states with no pulse and no count-up. Tab switching, the site filter, Generate sample brief, and download stay. The sample banner stays. Site labels stay Acquisition Site A, B, and C, plus Lyons Life. The homepage card image is a new shot of that dark Overview.
- **Rationale:** The sample should look like a product a visitor would want built, without adding names or claims.
- **Affected systems:** `public/work/lyons-life-demo/index.html`, `public/home-v2/lyons-life.webp`, `index.html`, `public/llms.txt`.
- **Rollback:** Restore the previous light demo file and card image.

## 2026-10-22: Generic demo site labels, and an example AI console

- **Status / owner:** Evan asked for a privacy pass on the hosted Lyons Life demo and a new homepage AI operations section. Preview only. No production deploy.
- **Decision:** Florida Private Health, Self Employed Health, and ACA Florida in the sample demo are now Acquisition Site A, B, and C. Lyons Life stays. The homepage gains an example console between the lost-to-booked path and the closing call. The headline is “AI agents that work for your business, with you in control.” Book a call goes to `/book/`. Four agents, a task feed, a typed prompt, and an Approve chip run a 14 second loop of transform and opacity. It plays only while the section is in view. Reduced motion shows the approval frame still and hides Pause animation. The board is marked “Example console, simulated” and names no clients and no results.
- **Rationale:** The sample names looked like real agency sites. The console should show human control without inventing a customer or a metric.
- **Affected systems:** `public/work/lyons-life-demo/index.html`, `public/home-v2/lyons-life.webp`, `index.html`, `src/home-v2.css`, `src/home-v2.js`, `public/llms.txt`.
- **Rollback:** Restore the previous demo names and remove the `#agents` section.

## 2026-10-22: Lyons Life Command Center card links to Evan's sample demo

- **Status / owner:** Evan supplied a self-contained interactive sample and asked for it on the Selected work card. Preview only. No production deploy. This supersedes the empty-slot sentence in the motion-layer entry below.
- **Decision:** The card is named Lyons Life Command Center. Its visible description is the portfolio sentence Evan supplied. The one-line reveal says “Try the interactive demo” and the card links to `/work/lyons-life-demo/`. The demo file is UTF-8, titled Lyons Life, and keeps the banner that all names and figures are invented. The homepage does not repeat those figures. The card image is a screenshot of the Overview tab inside the existing device frame. The page is `noindex` so the sample counts are not a search result. Directory requests rewrite to `index.html`.
- **Rationale:** The demo is the asset. Its counts are labeled as invented, so they stay inside the demo and off the marketing card.
- **Affected systems:** `index.html`, `src/home-v2.css`, `public/work/lyons-life-demo/index.html`, `public/home-v2/lyons-life.webp`, `public/llms.txt`, `vite.config.js`, `vercel.json`.
- **Rollback:** Point the card back at the empty slot and remove the demo page, the screenshot, and the rewrite.

## 2026-10-22: Portfolio and pages share a light motion layer

- **Status / owner:** Evan asked for the rest of the site to feel as considered as the hero, with the current layout and the blue “.ai” kept. Preview only. No production deploy.
- **Decision:** Work cards rise and scale in as they enter, staggered. Hover tilts the card a few degrees, lifts it, zooms the image, lights a lime and blue edge, and reveals the existing one-line caption. Lyons Life Command Center is an empty slot labeled “Case study coming soon.” No facts were added because there are no assets. Other headings, cards, and panels use the same reveal. Section breaks carry a thin lime-to-blue line. Page changes use a cross-document fade where the browser supports it, and a short fade-in otherwise. Reduced motion leaves everything still. Nothing hijacks scroll.
- **Rationale:** The hero was moving and the rest of the site was not. The new card has a place ready without inventing a case study.
- **Affected systems:** `index.html`, `src/home-v2.css`, `src/motion.css`, `src/motion.js`, `vite.config.js`.
- **Evidence:** Local production preview, mobile Lighthouse performance 91 (FCP 1.1s, LCP 3.5s, TBT 0, CLS 0). Cards start hidden and rise only on the way in. Hover on a fine pointer lifts, tilts, zooms, and lights the edge. Touch keeps the caption visible. Reduced motion adds no reveal class.
- **Rollback:** Remove the motion stylesheet and script injection. Remove the Lyons card and the tilt wrappers.

## 2026-10-22: Homepage desk hero is lit and the example dashboard moves

- **Status / owner:** Evan asked for the desk hero to come more to life, closer to the Swing Trade Pros homepage density, without trading content. Preview only. No production deploy.
- **Decision:** The background plate is a brighter photographic desk. The monitor is still HTML. It holds a business snapshot with sparklines, five example leads, an automation flow, an assistant thread, and booked cards. A 12 second loop slides in a lead, lights the flow, flicks a toggle, slides in a booking, and types a reply. Motion is transform and opacity. It pauses offscreen and when Pause animation is pressed. Reduced motion shows the populated screen still. Scroll moves the photo, the desk props, and the monitor at three small rates, throttled with one animation frame. A diagonal light sweeps the dashboard once, for 1.2 seconds, when the hero enters view. A small pointer parallax shifts the plate and the monitor. There is no custom cursor and no scroll library. Every panel stays labelled EXAMPLE or SIMULATED. There are no client names, prices, or result counts.
- **Rationale:** The previous screen was too dark and the panels sat still. The reference is a full, lit monitor with things arriving.
- **Affected systems:** `index.html`, `src/home-v2.css`, `src/home-v2.js`, `public/home-v2/desk-scene.webp`, `public/llms.txt`.
- **Rollback:** Restore the previous desk hero markup and the darker plate. Leave the wordmark blue and the reel card in place.

## 2026-10-22: Header wordmark “.ai” uses the logo blue

- **Status / owner:** Evan asked for the nav “.ai” to leave lime and use the blue from the canonical logo, with readable contrast on the dark header. Preview only. No production deploy.
- **Decision:** `.wordmark i` is `#007BF8` on the homepage and on every `body.v2` header. That hex is an opaque pixel in `public/assets/firststep-logo-transparent-cleaned.png` (105 pixels). The most common bright-blue pixel in that file is `#006EEC`, which measures 4.14:1 against header ink `#0D0C0A`. The homepage wordmark is 18px and the mobile size is 16px, so the text needs 4.5:1. `#007BF8` is the nearest common exact logo blue that clears it, at 4.83:1. Lime stays on buttons, eyebrows, and example labels. The logo file is unchanged.
- **Rationale:** The “.ai” should match the logo’s blue and stay readable on `#0D0C0A`.
- **Affected systems:** `src/home-v2.css`, `src/v2-site.css`.
- **Rollback:** Set `.wordmark i` back to `var(--acid)` on the homepage and `#D4FF3A` on `body.v2`.

## 2026-10-22: Homepage hero matches the Swing Trade Pros desk composition

- **Status / owner:** Evan sent a screenshot of the Swing Trade Pros homepage and asked for that composition on 1stStep. Preview only. No production deploy. This supersedes the node-diagram hero.
- **Decision:** The first screen keeps the headline “Get more from the business you already have.” The subline is “Websites, integrations, automations, and custom apps.” Book a call still goes to `/book/`. A second control, “See our work,” goes to `#work`. The right side is a dark desk with a monitor. The screen is a live HTML dashboard: sidebar, new-lead rows, automation toggles, booked-today cards, and a small assistant thread. Every panel is marked EXAMPLE or SIMULATED. There are no counts, prices, or client names. The mug uses the canonical logo file. Notebook and book-spine words are HTML. A feature strip sits along the bottom, with the line “Start with what you have. We’ll build the rest.” Motion is transform and opacity. It runs only while the hero is on screen, and Pause animation freezes it. Reduced motion shows the populated scene still and hides the pause control. The header logo stays `firststep-logo-transparent-cleaned.png`, at 48px tall with the 1147:946 ratio locked so the mark is not squeezed. The reel stays a smaller selected-work card.
- **Rationale:** Evan wanted the Swing Trade Pros hero’s layout and life, in the 1stStep palette, without trading content or invented results.
- **Affected systems:** `index.html`, `src/home-v2.css`, `src/home-v2.js`, `public/home-v2/desk-scene.webp`, `public/llms.txt`.
- **Rollback:** Restore the node-diagram hero. Leave the reel card, the music credit, and the canonical logo file in place.

## 2026-10-21: Homepage hero is a quiet system diagram, and the reel is a work card

- **Status / owner:** Evan asked to take the cartoon reel out of the first screen and to match the feel of the Swing Trade Pros homepage hero, adapted to 1stStep. Preview only. No production deploy.
- **Decision:** The hero is the headline “Get more from the business you already have.”, one subline, and Book a call to `/book/`, over a low-contrast diagram. Scattered nodes labeled Lead, Call, Form, and Tool drift, then lines draw into one path that ends at Booked. The word Example sits on that end node. The loop is about 12 seconds. It runs only while the hero is on screen (`is-on` via IntersectionObserver, the same pause idea as Swing Trade Pros’ `.desk-is-running`). Reduced motion shows the connected diagram still, with no draw and no drift. The approved v4 reel moves into Selected work as a smaller card: muted, looping, playsinline, with one Tap for sound control that restarts at the beginning. The card loads when it nears the viewport and pauses when it leaves. The footer music credit stays. Reference studied: the live hero at https://swingtradepros.com/ (`header.animated-desk-hero`). Its scene uses a CSS wipe (`.desk-chart-wipe`, `desk-fixed-chart-reveal`, 12s, scaleX) and a faint scanline, paused until `.desk-is-running`, and hidden under `prefers-reduced-motion`. No Swing Trade Pros source repository was available from this environment. This supersedes the full-bleed reel placement in the entry below. The headline, `/book/`, the reel file, the music credit, the headshot, and the honesty rules stay.
- **Rationale:** The film was in front of the offer. The first screen should read as the offer, with motion that shows a system coming together and does not compete with the type.
- **Affected systems:** `index.html`, `src/home-v2.css`, `src/home-v2.js`, `public/llms.txt`.
- **Rollback:** Restore the full-bleed reel hero from the previous homepage commit. Leave the reel file and the music credit in place.

## 2026-10-21: Homepage leads with the reel and the product frames

- **Status / owner:** Evan said the short studio page had too much text and was not impressive enough. Preview only. No production deploy.
- **Decision:** The first screen is the approved v4 reel, full bleed, with the headline “Get more from the business you already have.” and Book a call. Selected work is five device frames: DaySetGo, SwingTradePros, Job Agent, SkillSprout, and Real-Rank.ai. Captions are labels. A before/after board shows a lost lead beside a booked lead and is marked “Example, not a client's data.” It has no counts and no client name. The founder photograph sits with the closing Book a call. Motion is a hero reveal, a scroll-in, a short parallax on the frames, and a hover scale. Those use transform and opacity, driven by CSS, with no scroll library and no custom cursor. Reduced motion leaves the reel on its poster and shows the boards in place. The video file waits until the browser is idle, and it does not autoplay on a slow or data-saver connection. This supersedes the section density in the short-studio-page entry. The headline, `/book/`, the reel credit, the headshot, and the honesty rules stay.
- **Rationale:** The page should show the film and the shipped products, and stay smooth.
- **Affected systems:** `index.html`, `src/home-v2.css`, `src/home-v2.js`, `public/llms.txt`.
- **Rollback:** Restore the previous short studio homepage.

## 2026-10-21: Homepage is a short studio page, and the custom cursor is gone

- **Status / owner:** Evan replaced the long homepage brief and asked to keep the cursor and performance cleanup. Preview only. No production deploy.
- **Decision:** The homepage is five parts: a hero (“Get more from the business you already have.”, one subline, Book a call), selected work, what we do, a short founder strip, and a closing Book a call. Selected work is DaySetGo, SwingTradePros, Job Agent, SkillSprout, Real-Rank.ai (a capture of the public homepage), and the approved v4 reel. Book a call still goes to `/book/`. The label is “Book a call”. The custom cursor, Lenis, GSAP, ScrollTrigger, the grain layer, and the long homepage sections are removed. Motion is a hero reveal, a scroll-in on each work piece, and a hover scale on the work image. Those use transform and opacity. Reduced motion turns them off and leaves the reel on its poster, with the sound control hidden. The fixed header on subpages uses a solid ink background instead of a blur. The integrations row stays on the five service pages. This supersedes the long v2 section order, the custom-cursor entry below, and the empty testimonial and client-reel slots. Those slots are removed, not filled. The v4 reel file, its poster, the music credit, the founder photograph, and the locked logo stay.
- **Rationale:** Evan asked for a cleaner page that shows the design work, and for the pointer lag to stop.
- **Affected systems:** `index.html`, `src/home-v2.css`, `src/home-v2.js`, the fixed header in `src/v2-site.css`, `public/home-v2/real-rank.webp`, `public/llms.txt`.
- **Rollback:** Restore the previous homepage files, the cursor, and the header blur. Leave the service-page integrations in place.

## 2026-10-21: Homepage reel is the approved v4 cut

- **Status / owner:** Evan approved `1ststep_reel_16x9_v4_web` for the homepage preview. Preview only. No production deploy.
- **Decision:** The hero and the cartoon-ad cinema play `public/home-v2/1ststep-reel-v4.mp4`, the supplied file copied without re-encoding. Phone and desktop use that same file. Posters are a frame at two seconds: the full 16:9 frame, and a center 9:16 crop for the phone still. Autoplay stays muted and looping, with playsinline. “Tap for sound” still unmutes, restarts at the beginning, and mutes again. The homepage footer credits Kevin MacLeod’s “Happy Boy Theme” under CC BY 4.0, and notes BigSoundBank for the sound effects. The old `reel_16x9.mp4` and `reel_9x16.mp4` files are removed. This supersedes the soundtrack file named in the earlier reel entry.
- **Rationale:** The v4 cut is the reel Evan approved. The phone should not keep playing the previous film.
- **Affected systems:** Homepage hero, cartoon-ad cinema, posters, homepage footer.
- **Rollback:** Restore the previous reel files and posters, and remove the music credit.

## 2026-10-21: The homepage founder photo is Evan’s real headshot

- **Status / owner:** Evan supplied a 400×400 headshot for the homepage v2 preview. Preview only. No production deploy.
- **Decision:** Replace the “Evan photo here” slot with that photograph, square, uncropped, and without a color filter. Serve AVIF and WebP, with JPEG as the fallback, and use the JPEG URL as the Person image on the homepage Organization founder. Testimonials and the client sample reel stay empty. This supersedes only the photo clause in the homepage v2 honesty note below.
- **Rationale:** The placeholder was waiting on a real photo. The supplied file is that photo.
- **Affected systems:** Homepage founder section, `public/home-v2/evan-pancis.*`, homepage JSON-LD.
- **Rollback:** Restore the dashed photo slot and remove the image files and the schema image URL. Leave testimonials and the client reel untouched.

## 2026-10-21: Homepage cursor dot follows the pointer with no ease

- **Status / owner:** Evan asked for this on the homepage v2 preview. Preview only. No production deploy.
- **Decision:** The main cursor dot is positioned in the pointer event, with no duration and no lerp. The ring eases at 0.65 per frame and snaps once it is within half a pixel. While the ring is the visible cursor (the hover label), it uses the same instant position as the dot. The system cursor stays visible until that first placement, and stays visible on touch and when reduced motion is requested. The custom cursor does not run in those cases.
- **Rationale:** Hiding the system cursor while the replacement eases behind the pointer reads as lag.
- **Affected systems:** Homepage cursor in `src/home-v2.js` and `src/home-v2.css`.
- **Rollback:** Restore the previous quickTo durations and show the custom cursor on load for any fine pointer.

## 2026-10-21: Integrations row uses only marks the brands allow

- **Status / owner:** Evan asked for a “works with” logo row on the homepage preview, after the paths section, and on the service pages when that was straightforward. Preview only. No production deploy.
- **Decision:** Show Zapier, Make, n8n, Calendly, Square, and Supabase. The marks are the Simple Icons 16.35.0 paths, unmodified, filled with each brand’s published hex. None of those six icons carries a non-CC0 license note. They sit on cream plates so a dark mark stays legible without recoloring it. The row loops, pauses on hover and focus, and becomes a static wrap when the visitor asks for reduced motion. The line under it is: “Logos are trademarks of their respective owners. 1stStep.ai connects with these tools and is not affiliated with or endorsed by them.” The word “partner” is not used.
- **Excluded:** GoHighLevel (brand kit is for their agencies and team, not an unaffiliated site). QuickBooks and Mailchimp (Intuit forbids product logos without a written license). ManyChat (no Simple Icons mark and no public license for this use). Google Workspace, Gmail, and Google Calendar (Google forbids its logos in business marketing). Microsoft 365 and Outlook (a license is required for third-party marketing use of the marks). Slack and Salesforce (Salesforce forbids altering its marks or passing on rights to them; Simple Icons removed both). Shopify and HubSpot (written permission required before a logo goes on a website). Follow Up Boss (press-kit files only, no license for this page). Twilio (the logo requires written permission). OpenAI (do not use the logo without permission; Simple Icons removed it when that permission was not obtained). Meta, Facebook, Instagram, and WhatsApp (only their own brand-center files, which forbid recoloring and logos taken from anywhere else). Notion (logo use has to be an approved mark, and the required credit says it is used with permission). Airtable (compatibility mentions are allowed, but the logo may not be redrawn, and the approved file was not a public SVG). Stripe (the mark is only for the part of a site that directly handles Stripe, such as checkout). Vercel (marks are not for marketing collateral of a commercial service).
- **Rationale:** A compatibility row is useful. A logo the owner forbids is not.
- **Affected systems:** Homepage after the paths section, the five service pages, `src/integrations.css`, `public/integrations/`.
- **Rollback:** Remove the section, the stylesheet link, and the SVG files.

## 2026-10-21: Public subpages use the homepage v2 theme

- **Status / owner:** Evan asked for this on the homepage v2 preview branch, after the reel soundtrack. Preview only. No production deploy.
- **Decision:** Tools, the App Idea Checker, services, journey, fit-check, booking, campaigns, startup checker, legal pages, and the public `/os` concept use the homepage v2 system: ink `#0D0C0A`, cream `#F1EADB`, lime `#D4FF3A`, self-hosted Archivo and Instrument Serif, the shared header and footer, outline “Book a 20-min call” pills, and lime primary buttons. Copy, forms, and routes stay as they were. Shared rules live in `src/v2-site.css`.
- **Exceptions:** The 1stStep OS and OS Audit tool pages keep the same header and footer look without “Book a 20-min call,” Begin Your Journey, or `/book/`, because those pages stay listings, not hire-us intake. The five service pages omit the footer link to the App Idea Checker so website and systems visitors stay on their own paths. The homepage is unchanged. Fictional makeover pages, admin, demos, Foundry, and OG render sources keep their own artwork.
- **Rationale:** Leftover navy and lavender made the rest of the site look like a different brand from the approved homepage.
- **Affected systems:** Public HTML routes listed above, their CSS, and `src/v2-site.css`. Status colors for scores and errors stay green, amber, and red.
- **Rollback:** Remove `src/v2-site.css` and restore the previous page headers, footers, and color values. Do not alias the preview to production.

## 2026-10-21: Homepage cartoon reel plays with sound on request

- **Status / owner:** Evan supplied a web-ready 16:9 reel with an AAC track and asked for it on the homepage preview. Preview only. No production deploy.
- **Decision:** Replace `public/home-v2/reel_16x9.mp4` with that file everywhere the 16:9 reel is used (hero desktop and the cartoon-ad cinema). Keep the existing poster. Autoplay stays muted. A “Tap for sound” control on the hero and on the cinema unmutes that copy, restarts it at the beginning, and switches to a mute icon. The portrait hero file keeps its video frames and now carries the same AAC track, copied rather than re-encoded, so the phone hero can unmute too. This supersedes the “reels have no audio” note in the homepage v2 entry.
- **Rationale:** Browsers block audible autoplay. The soundtrack is part of the reel Evan delivered, and the portrait crop is the same film.
- **Affected systems:** Homepage hero, cartoon-ad cinema, `public/home-v2/reel_16x9.mp4`, `public/home-v2/reel_9x16.mp4`.
- **Rollback:** Restore the previous silent reel files and remove the sound controls.

## 2026-10-21: Homepage “Book a 20-min call” uses the Website Strategy Call

- **Status / owner:** Evan directed this on the v2 homepage preview branch. Preview only. No production deploy.
- **Decision:** Every homepage control labeled “Book a 20-min call” links to `/book/`, the existing LeadConnector Website Strategy Call. Remove the visible booking TODO. Remove “Watch with sound” because the reel files have no audio track; the hero still plays muted. The three path rows and “Ask about a cartoon ad” still scroll to the closing section. This supersedes the booking bullet in the homepage v2 entry below.
- **Rationale:** Evan named `/book/` as the destination. The calendar page keeps its own Website Strategy Call label.
- **Affected systems:** Homepage header, hero, and closing CTA; `public/llms.txt`; homepage tests.
- **Rollback:** Point those three controls back to an approved booking URL, or restore the TODO, without relabeling `/book/` itself.

## 2026-10-21: Homepage v2 replaces the Signal Path first screen on a preview branch

- **Status / owner:** Implementing on `cursor/homepage-v2-1b3b` from the approved v2 handoff. Evan owns the design. This change is preview-only. It does not authorize a production deploy or any change to the live `1ststep.ai` / `www.1ststep.ai` domains.
- **Decision:** Rebuild the public homepage from the v2 static prototype (ink `#0D0C0A`, cream `#F1EADB`, acid `#D4FF3A`, Archivo + Instrument Serif, film grain, reel hero, pinned fictional makeover, pinned lead-to-booked flow, horizontal portfolio, three paths, cartoon-ads cinema, founder, CTA). Keep the Vite multi-page app, the existing routes, SEO head (canonical `https://www.1ststep.ai/`, OG image, Organization JSON-LD), the locked logo, and the LeadConnector calendar on `/book/`. Self-host Archivo and Instrument Serif. Vendor GSAP 3.12.5, ScrollTrigger, and Lenis. Do not mount the Signal Path figure on the homepage. Leave `src/signal-path.js` in the repo, unmounted, so the previous motion model can be restored.
- **Booking:** The v2 copy says “Book a 20-min call.” `/book/` is the 30-minute Website Strategy Call, so the homepage button does not use it. The control scrolls to a visible TODO until Evan names the destination. Footer links keep `/journey/` and `/fit-check/` reachable.
- **Honesty:** Bramblewick is labeled “Example makeover · fictional business,” and `/makeover/before.html` and `/makeover/after.html` are `noindex`. SkillSprout has no metrics. SwingTradePros shows only 8,000+ Discord members, 4,000+ YouTube subscribers, and the name Node AI. No TradingView mention and no performance claim. The Evan photo, testimonials, and client sample reel stay empty placeholders. The lead flow is labeled illustrative.
- **Fixes in this pass:** A heavier lower scrim sits behind the hero type so burned-in reel captions do not read through the subtext. Makeover tiles are clipped with `overflow: hidden` and `clip-path: inset(0)` on the browser viewport. Hero and cinema video stay off until needed. Below-fold stills are WebP with `loading="lazy"`. Reels were re-encoded at CRF 27 (SSIM about 0.987 and 0.990) and have no audio track.
- **CSP:** Homepage fonts, scripts, images, and video are same-origin, which the existing policy already allows. Google Fonts stays allowed for the fictional makeover pages and the rest of the site. The homepage does not embed the LeadConnector frame.
- **Alternatives:** Point the new CTA at `/book/` or `/fit-check/`; rewrite the page as React; delete the Signal Path module.
- **Verification:** Local build, existing route tests updated for the homepage contract, and browser checks at 1440 and 390. Preview URL when Vercel provides one. Production verification is out of scope.
- **Rollback:** Revert this branch. Do not alias the preview to production. The previous production homepage remains the live site until a separate release decision.

## 2026-09-21: 1stStep OS Cycle 1 is a public free core, not a hosted product

- **Status / owner:** Approved by Evan via the public-site update request; implemented on `/tools/1ststep-os/`, `/tools/`, and `/os`. Evan retains authority for claiming a hosted OS product, deploying a compile API, or offering a ZIP generator on Vercel or 1ststep.ai.
- **Decision:** Treat 1stStep OS as honestly **live** only as a **public free core**: clone https://github.com/1ststepai/1ststep-os and run Cycle 1 locally (`npm install && npm test && npm run build && npm start`, then http://localhost:3000/os) for idea → project profile → Project OS markdown ZIP. The listing at `/tools/1ststep-os/` and the Tools hub card must link that GitHub URL and give the exact local commands. `/os` may point at the repo and local ZIP path without overselling. Keep illustrative demos labeled illustrative. Do **not** claim a full agent OS, hosted control plane, or production-ready product. Do **not** add a hosted ZIP generator. Cycle 1 is not production-ready; the unauthenticated compile API must not be deployed publicly. Auto Model Router listing stays intact. Primary CTAs remain GitHub / local run / concept page, not hire-us. Supersedes the GitHub-404 and “no ZIP demo” clauses of the earlier 2026-09-21 tools-hub OS listing; Audit CLI honesty rules still hold.
- **Rationale:** The OS repository is now public and Cycle 1 exists as a local thin vertical. Visitors should be able to click from `/tools` to GitHub and know how to run the ZIP path. Calling that a hosted product would overclaim.
- **Affected systems:** `/tools/`, `/tools/1ststep-os/`, `/os`, `/tools/1ststep-os-audit/` companion copy, sitemap lastmod for `/os`, `public/llms.txt`, README, homepage OS showcase/bridge copy.
- **Alternatives:** Keep “source available soon”; add a hosted ZIP UI on the marketing site; label Cycle 1 as a finished agent OS.
- **Implementation / audit:** Tests must require the public OS GitHub href, `localhost:3000/os`, the exact npm command chain, Cycle 1, “free core,” and honest limits (not hosted, not a full agent OS, not a control plane, not production-ready, no hosted ZIP generator). Reject hire-us primary CTAs on the OS tools page. AMR marketplace honesty tests stay unchanged.
- **Reversal:** Requires a new owner decision before labeling 1stStep OS as a hosted product, deploying the compile API, or offering a ZIP generator on 1ststep.ai / Vercel.

## 2026-09-21: Tools hub lists OS Audit live and OS foundation with honest status

- **Status / owner:** Implemented on `/tools/`; **partially superseded** by the Cycle 1 public-core decision above for GitHub linking and local ZIP copy. Audit CLI listing and “no hire-us CTA” rules still hold. Evan retains authority for claiming a hosted OS product or publishing a ZIP generator on this site.
- **Decision:** Add two listings to the public Tools hub. **1stStep OS Audit** is a live, usable free CLI at `/tools/1ststep-os-audit/` with GitHub `https://github.com/1ststepai/1ststep-os-audit`. Pitch: evidence over docs, zero metered API cost path, CLI `--help`, scores can be draft, does not rewrite the target repo. **1stStep OS** was listed at `/tools/1ststep-os/` as foundation / in development (Phase 0, idea→profile→ZIP in progress, free core) until the public repo and Cycle 1 vertical existed. Primary public reference is `https://www.1ststep.ai/os`. Do not claim a hosted OS product. Primary CTAs on these pages are GitHub/CLI or the concept page, not a hire-us path. Extends the 2026-09-20 hub rule: live tools stay live; in-development work may be named only with an explicit status label.
- **Rationale:** The audit CLI is public and usable. At the time of this entry the OS repo was not public; that constraint is lifted by the later Cycle 1 decision.
- **Affected systems:** `/tools/`, `/tools/1ststep-os-audit/`, `/tools/1ststep-os/`, `/os` audit section link, sitemap, Vite/Vercel inputs, `public/llms.txt`, README.
- **Alternatives:** Wait until OS GitHub is public; hide OS until ZIP exists; treat Audit as an `/os` subsection only.
- **Implementation / audit:** Tests must keep GitHub href for Audit, require honest OS status matching the current owner decision, and “does not rewrite.” No hire-us primary CTA on the new tool pages.
- **Reversal:** Requires a new owner decision before labeling 1stStep OS as a hosted product or linking a ZIP generator on this site.

## 2026-09-20: Auto Model Router listings stay honest about marketplace status

- **Status / owner:** Implemented on the public Tools pages; Evan retains authority for claiming an official marketplace is live.
- **Decision:** Advertise Auto Model Router install with real public URLs only: GitHub (install works today) and the cursor.directory community listing. Label cursor.directory as community and do not claim it is live in Cursor’s official Marketplace. Show Cursor official Marketplace and Claude community plugin catalog as “Submitted — pending review” with no invented product URLs. Optional Anthropic docs link for how community plugins are discovered is allowed. Codex public directory remains out of scope. The plugin must not be described as guaranteeing billing or token savings. The live-motion demo from the later-merged pass remains on the same page and is a separate honesty rule (motion replay, not savings proof).
- **Rationale:** Marketplace submissions can exist before a public product page. Linking `/marketplace/publish` or a guessed slug would over-claim availability.
- **Affected systems:** `/tools/auto-model-router/`, `/tools/`, `public/llms.txt`, site README.
- **Alternatives:** Hide pending catalogs; wait until official product URLs exist; invent marketplace slugs.
- **Implementation / audit:** Tests must keep GitHub and cursor.directory hrefs, require the pending status strings, and reject `cursor.com/marketplace/publish` or a fake official product URL.
- **Reversal:** Requires a new owner decision before labeling official Cursor or Claude listings as live.

## 2026-09-20: Auto Model Router live demo is a motion replay of the real pass, not a slide deck

- **Status / owner:** Implemented on `/tools/auto-model-router/`; Evan remains authority for any later billing or estimator claims. Supersedes the earlier “play Evan’s recorded Codex MP4 as a 40-second session recording” presentation after Evan rejected the instructional slide-deck cut.
- **Decision:** Ship the Live demo as a Codex-style chat motion replay of the real suggest → wait → confirm pass (`amr-codex-live-demo.mp4`). Label it as a motion replay, not a slide explainer. Use a wait-state frame as the video poster. Keep the exact real-pass reply strings. Keep the CSS animation labeled `Example flow (illustrative)`. Do not present the demo as billing, invoice, or token-savings evidence. Do not recreate title-card slide decks as the live demo.
- **Rationale:** Visitors need to see the flow happening in a chat UI. A slide deck does not demonstrate suggest → wait → confirm.
- **Affected systems:** `/tools/auto-model-router/`, Tools hub copy, `public/assets/amr-codex-live-demo.mp4`, `public/assets/amr-codex-live-pass.png`, `public/assets/amr-codex-live-demo.vtt`, README, `llms.txt`.
- **Alternatives:** Keep the rejected slide-deck MP4; claim a raw unedited Codex screen recording; claim estimator savings on the public page.
- **Implementation / audit:** The live section must embed the motion-replay MP4 with controls and the wait-frame poster. Exact replies must remain the real-pass strings. Honest copy must say suggest → wait → confirm, not savings or slides. The illustrative kicker stays `Example flow (illustrative)`.
- **Reversal:** Requires a new owner decision before removing the live-motion replay or treating the page as a billing dashboard.

## 2026-09-20: Auto Model Router live demo is a real Codex session, not savings proof

- **Status / owner:** Superseded by the motion-replay decision above after Evan rejected the slide-deck cut. Honesty rule (no billing or token-savings claim) still holds.
- **Decision:** Add a Live demo section labeled “Real Codex session” that plays Evan’s recorded Codex pass (`amr-codex-live-demo.mp4`), quotes the activation and `getUserName` → `fetchUserName` replies, and uses the session frame as the video poster. Keep the existing CSS animation, labeled as an illustrative example only. Offer a copy-paste “Try this in Codex” rename prompt. Do not present the demo as billing, invoice, or token-savings evidence.
- **Rationale:** Visitors need to see suggest → wait before they install. The recorded pass is the real session; the illustrative animation only explains the four-step flow. Mixing those labels, or implying cost savings, would overclaim.
- **Affected systems:** `/tools/auto-model-router/`, Tools hub copy, `public/assets/amr-codex-live-demo.mp4`, `public/assets/amr-codex-live-pass.png`, README, `llms.txt`.
- **Alternatives:** Keep only the still frame; replace the CSS animation; claim estimator savings on the public page.
- **Implementation / audit:** The live section must embed the recorded MP4 with controls and the session-frame poster. Exact replies must remain the real-pass strings. Honest copy must say suggest → wait, not savings. The illustrative kicker stays `Example flow (illustrative)`.
- **Reversal:** Requires a new owner decision before removing the live session or treating the page as a billing dashboard.

## 2026-09-20: Homepage first screen is owner-offer + fit-check, architecture below the fold

- **Status / owner:** Implemented on the public site; complementary to Tools PRs #10 and #11. Evan retains authority for CTA or booking-path changes.
- **Decision:** The homepage first screen states the offer in owner language—websites, apps, and AI systems that capture and follow up leads—with one primary CTA to `/fit-check/`. Service pages are secondary links. The architecture story, Begin Your Journey, and System Audit email stay below the fold. `/book/` remains the website-strategy calendar and is not the homepage primary CTA. Canonical host is `www.1ststep.ai`.
- **Rationale:** Busy owners need the offer and next step in the first screen. Fit Check is the lighter website-intent start. Journey remains the systems diagnosis. This sprint does not change Tools pages owned by open PRs #10 and #11.
- **Affected systems:** Homepage hero/FAQ, service H1s and OG, sitemap, robots, `llms.txt`, fit-check/book metadata.
- **Alternatives:** Keep Journey as the only first-screen CTA; send all owners to `/book/`.
- **Implementation / audit:** JSON-LD FAQ must match visible FAQ text. Do not label `/book/` as a System Audit. No guaranteed-revenue copy.
- **Reversal:** Requires a new owner decision before moving the primary homepage CTA off `/fit-check/`.

## 2026-09-20: Public Tools hub is for builder utilities, not client services

- **Status / owner:** Implemented on the public site with the Auto Model Router page.
- **Decision:** Publish `/tools/` as a short hub for free/open tools that help people build with AI coding agents. List only live, usable tools. Auto Model Router is the first card. Future directions may be mentioned as unlisted work, never as fake products. Homepage primary nav and Explore footer link to the hub. Distinguish this shelf from `/services/internal-tools.html`.
- **Rationale:** A single signup URL is not enough of a public home for OSS builder tools. A hub keeps later tools from becoming one-off URLs and keeps services vs. utilities separate.
- **Affected systems:** Homepage nav/footer, `/tools/`, `/tools/auto-model-router/`, sitemap, Vite/Vercel `/tools` rewrite.
- **Alternatives:** Keep only the Auto Model Router URL; mix OSS tools into the OS or services pages.
- **Implementation / audit:** Hub copy must stay honest. Email remains optional on the Auto Model Router form.
- **Reversal:** Requires a new owner decision before removing the hub or treating Tools as a paid catalog.

## 2026-09-20: Auto Model Router public feedback is opt-in only

- **Status / owner:** Implemented for the public site; Evan retains authority for any later CRM or marketing-list expansion.
- **Decision:** Publish `/tools/auto-model-router/` as an optional feedback page for the MIT Auto Model Router skill. Accept written feedback without an email. Require a visible opt-in before storing or emailing a submitted address. Deliver submissions through the existing Resend owner-notification path used by Fit Check and the App Idea Checker. Do not add a new SaaS vendor, silent list capture, or a requirement to sign up to use the skill.
- **Rationale:** The skill is open source and must remain usable without contact details. Reusing the current CORS, rate-limit, idempotency, allowlist, and Resend contract keeps delivery honest without inventing a lead store.
- **Affected systems:** Public site page, `POST /api/auto-model-router-feedback`, Resend admin notification, sitemap, privacy copy.
- **Alternatives:** Formspree; GHL forwarding; a new database table. All add a vendor or persistence surface the repo does not already use for this kind of note.
- **Implementation / audit:** Validation requires feedback or email, and opt-in when email is present. Success is `201` only after Resend accepts the message; otherwise `503`. Analytics events must not include the email or feedback text.
- **Reversal:** Remove the page and endpoint, or replace delivery only after an approved alternative that preserves the same opt-in and no-harvest contract.

## 2026-09-13: Public-site and OS engineering authority

- **Status / owner:** Approved by Evan Pancis through the public-site master operating prompt; Evan retains human authority for material business and risk decisions.
- **Decision:** The public-site agent owns `1ststep.ai`, `/os`, and the public/business experience, including UI/UX, responsive and design-system quality, brand integrity, conversion, technical SEO, analytics/attribution, performance, visual QA, accessibility, security, and release verification. The site leads with systems architecture and automation consultancy; `/os` develops the distinct AI Engineering Operating System and AI-engineering service direction. The dedicated `app.1ststep.ai` Engineering Orchestrator owns the authenticated Job Agent application and its engineering domain. Cross-app needs become explicit contracts and handoffs; this agent does not independently implement app-owned changes.
- **Rationale:** Give the public site and AI Engineering OS one accountable technical steward, preserve the canonical logo decision, and avoid competing authorities or overlapping application edits.
- **Affected systems:** Main website, `/os`, Begin Your Journey, public integrations, public-facing Lead OS/Pain Finder, and interfaces to `app.1ststep.ai`.
- **Alternatives:** Split public-site ownership across unrelated agents; allow the website agent to edit app engineering independently. Both increase drift and collision risk.
- **Implementation / audit:** `AGENTS.md` and `docs/PUBLIC_SITE_AGENT_OPERATING_CHARTER.md` carry the operating responsibilities. Verify task ownership, evidence, and release gates on each substantial change; this entry is not proof those workflows already exist.
- **Reversal:** Requires a new explicit owner decision and a reconciled authority contract. No decision is superseded by this entry.

## 2026-07-22: Keep the checker deterministic and vendor-light

- **Decision:** Preserve deterministic scoring and the Vercel function architecture; do not add a paid model provider.
- **Context:** The product offers an instant first-pass assessment and lead intake, not autonomous AI decision-making.
- **Alternatives:** Add a hosted model; move the flow into GHL; rebuild as a larger application.
- **Rationale:** Lower cost, smaller secret surface, predictable output, and no new availability dependency.
- **Risk:** Marketing must not imply that a model performed analysis.
- **Reversal:** Add a server-side provider only after owner approval, budget controls, privacy review, timeouts, and output validation.

## 2026-07-22: A success response requires real delivery

- **Decision:** Return `200` only when KV persistence, Resend notification, or an approved webhook succeeds; otherwise return `503`.
- **Context:** No-op storage previously allowed the UI to claim a report was saved even when it could be dropped.
- **Alternatives:** Always return success; require KV only.
- **Rationale:** Truthful failure behavior while preserving low-cost delivery choices.
- **Risk:** Misconfigured production environments will expose an error rather than silently collect nothing.
- **Reversal:** Add another verified delivery adapter that satisfies the same success contract.

## 2026-07-22: Minimize browser-resident lead data

- **Decision:** Remove legacy raw lead storage, preserve `appIdeaCheckerLastResponse`, and store only a small non-contact result summary.
- **Context:** Raw contact details, idea text, and generated previews were persisted in browser storage.
- **Alternatives:** Encrypt client-side; retain full local history.
- **Rationale:** Client-side encryption would not solve same-origin script access; full lead data is unnecessary for the user flow.
- **Risk:** Old local history is cleared when the checker loads.
- **Reversal:** Add an authenticated, server-backed history feature with a documented need and deletion controls.

## 2026-07-22: Layer application controls with deployment controls

- **Decision:** Add strict input allowlisting, same-origin CORS, request IDs, per-instance rate limiting, and warm-instance idempotency without a new dependency.
- **Context:** The public endpoint had permissive CORS and no abuse or duplicate-delivery protection.
- **Alternatives:** Add a paid rate-limit vendor; rely only on Vercel Firewall.
- **Rationale:** Immediate defense in depth with no new vendor.
- **Risk:** Serverless instances do not share the in-memory limits or idempotency cache.
- **Reversal:** Replace the in-memory layer with an approved durable store while keeping the same response contract.

## 2026-09-23: Outcome-led commercial homepage; Foundry remains separate

- **Owner / authority:** Evan's explicit outcome-led homepage instruction. Preview only; no merge or Production approval.
- **Base:** 0d8eb5ae59fc02770b7f1992000b0251008ff4b7. Isolated branch astra/outcome-homepage-preview.
- **Decision:** Lead with business outcomes and the Build / Finish / Automate paths. Use a six-second, one-shot illustrative workflow transformation with pause/replay and static reduced-motion behavior. Keep the entire Foundry implementation unchanged at /foundry/, linked as optional capability proof.
- **Preserved:** Intake/API/security/analytics/attribution implementation, intent identifiers, approved client-control language and counsel gate. No absolute ownership claim. No new packages.
- **Proof boundary:** Three first-party products/projects, never paid-client engagements. DaySetGo public-demo screenshot, Job Agent public-entry screenshot and Nova public-access screenshot were captured 2026-09-22 and reused without fabricating interfaces or results. Sources: https://www.daysetgo.ai/plan?mode=demo ; https://app.1ststep.ai/concierge ; https://swingtradepros.com/ai-assistant-demo . Authenticated service completion is not claimed. Prior owner-approved Google excerpts and their exact source links are preserved; review status is separate from paid-client status.
- **Verification:** Existing security/intake tests remain intact. Updated homepage tests assert the approved headline, three honest project stories, optional Foundry link, correct intake paths and FAQ parity. Browser checks cover 1440/1280/768/390/320 widths, no overflow, all intent/attribution paths, keyboard FAQ, pause/finite motion, reduced motion and no Foundry renderer request on the homepage. No external form submitted.
- **Release gate / rollback:** Owner Preview review required. No merge or Production. Previous candidate remains available at the base SHA.

## 2026-09-23 - Homepage Original / Light appearance (owner approved)

- Owner: Evan. Status: implementation for isolated Preview review, not Production.
- Base and rollback: 62297119b619b666462d6cf2b566efba0956a977.
- Preserve the outcome-led structure and all commercial copy/routes. Original navy/blue/cyan is default; ivory/forest remains Light. One homepage, one motion system, centralized semantic CSS tokens, native Appearance select.
- Explicit preference is local-only under firststep-home-appearance; allowlisted pre-style restoration. Storage denial safely retains Original on reload. No theme analytics. Foundry and all non-home routes remain independent.
- Scope: index.html, src/outcome-home.css, src/outcome-home.js and this decision. No backend, intake, attribution, schema, reviews, ownership, Handoff Standard or Foundry changes. Captions receive opaque themed surfaces; decorative workflow icons hide at 320px to avoid text collision.
- Local evidence: 126 tests pass; build passes. Browser checks at 1440,1280,768,390,320 for both themes: no horizontal overflow; computed text contrast passes WCAG AA thresholds (including gradient endpoints). Desktop/mobile screenshots inspected; focus and native keyboard selection verified. All three intent/attribution paths and back/reload preference restoration pass in both themes. Reduced-motion mode retains static accessible content. No console warnings/errors observed.
- Bootstrap checks: missing, invalid, Original, Light and blocked storage. Restoration executes before CSS/content. Preference is origin-local, so different Preview URLs do not share it. JS/storage disabled cannot restore a saved preference; page defaults to Original.
- Preview SHA and deployment verification recorded in delivery; no merge or Production authorization. Existing Foundry build chunk warning remains outside this theme scope. No lint/typecheck script exists in package.json.

## 2026-09-26 - Signal Path hero and restored Journey secondary path (owner approved, Slice 1)

- **Owner / authority:** Evan's explicit Slice 1 authorization. Zero-user Preview only; no merge to main and no Production.
- **Base and rollback:** 8af9397a9343cfa13a4fc425c7accd15e4b30df6 (`codex/outcome-theme-preview`, the build matched to current Production), treated as the immutable baseline. Isolated branch `claude/signal-path-hero`. Production/main drift is a separate release-management item that must be reconciled before any Production release.
- **Decision:** Replace the scattered-card hero figure with the Signal Path: one illustrative inquiry travels Source, Capture, Qualify, Route, Follow up, Convert and Measure, and attribution returns to the source. It starts disconnected (duplicate entry, no owner, follow-up not sent, unattributed outcome), comes online once in about six seconds, and rests. Pause and Replay are kept. On desktop (at least 1280px) a slim, non-interactive status rail carries the same system state through Problem, Work, Services, How, Reviews and the final CTA. It never pins, hijacks or gates scrolling. Below 1280px the figure is a vertical, tappable signal path with no rail.
- **CTA hierarchy:** Fit Check stays the only primary CTA ("Tell us what you need built"). Begin Your Journey is restored as a text-link secondary path in the hero and final section ("Need to understand what's broken first?"), tracked as `journey_start_click` with a placement. This reverses the hero's earlier "no /journey/ link" test assertion by owner decision. "Deploy Our OS" is not introduced. The headline is unchanged.
- **Honesty:** Figure values are labeled illustrative (not live data, not a client). No metrics, clients or results are implied.
- **Engineering:** No new dependencies and no WebGL. It uses semantic HTML, inline SVG, CSS transitions and one requestAnimationFrame clock (`src/motion/core.js`), with choreography in `src/signal-path.js` loaded by dynamic import after the page is usable. Every visual state is a `reach-*` class, shared by the animation, step-through, rail and static fallback. The no-JS markup ships fully resolved. An inline script holds the disconnected first frame only when motion is allowed, and it restores the resolved state if the module has not initialized within 4s. A failed import also restores it. Reduced motion shows the complete system with a six-step inspector and no autoplay. Offscreen or hidden tabs pause the clock.
- **Affected systems:** `index.html` (hero figure, secondary Journey links), `src/outcome-home.css` (removed dead scattered-card rules and tokens; added Signal Path, rail and secondary-link styles), `src/outcome-home.js`, new `src/motion/core.js`, new `src/signal-path.js`, `test/signalPath.test.js`, `test/publicDiscoverability.test.js`.
- **Verification / release gate:** See the Slice 1 delivery report (Lighthouse before/after, width matrix, reduced motion, no-JS, blocked-module and keyboard checks). Owner visual review is required before Slice 2, merge or Production.
- **Release (2026-09-26):** Evan explicitly approved Production. `caa1468` (diagram breakpoint raised to 1280px) was deployed by Vercel CLI from a clean checkout as `main-website-repo-e3zwfry1d-1ststep.vercel.app`, aliased to www.1ststep.ai. The previous Production was confirmed content-identical to `8af9397` before the release, so the release only adds this slice.
- **Production verification:** www and apex resolve and serve the Signal Path markup, both secondary Journey placements, source-linked reviews and canonical. All assets and the /journey/, /fit-check/, /foundry/, /os, /tools/, app-checker, robots and sitemap routes return 200. In a live browser, Vercel Analytics loads and nothing else fails; there are no console errors. Pause/resume, step announcements, all six rail states, reduced motion at 1440 and 390, the 1279/1280 layout switch and zero overflow all pass.
- **Live Lighthouse, median of 3 (before -> after):** mobile perf 69 -> 71, LCP 7.20s -> 6.14s, CLS 0.105 -> 0.106. Desktop perf 96 -> 96, LCP 1.37s -> 1.38s, CLS 0.005 -> 0.009.
- **Rollback:** Vercel instant rollback to `dpl_5uV2cw18AL1uRUmfJPWaeP9aa4wo` (`main-website-repo-75gz2vvt8-1ststep.vercel.app`, content `8af9397`).
- **Still open:** `main` (324e589) does not contain `8af9397` or this slice. A Production deploy built from `main` would roll the live homepage back. Fast-forward `main` to `caa1468` (it contains all of `main`) before any main-based deploy.
