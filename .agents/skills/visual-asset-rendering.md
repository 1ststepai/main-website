# Visual Asset Rendering Skill

Use this skill whenever the user asks to create:

- website mockup images
- landing page concept images
- hero section previews
- pricing card visuals
- testimonial graphics
- before/after graphics
- social media preview images
- dashboard mockups
- product UI screenshots
- marketing graphics
- Open Graph images
- LinkedIn banners
- Twitter/X banners
- Google Business Profile images
- Facebook/LinkedIn/Twitter share graphics

## Core Rule

Do not create low-effort placeholder graphics.

When the user asks for an image-style mockup, create a polished visual composition in HTML/CSS, render it in the browser, screenshot it, and save it as an image file.

The output should look like a premium generated design image, not a plain webpage.

## Important Constraint

Codex does not have native access to ChatGPT image generation unless an image-generation API is explicitly wired into the repo.

Default approach:

- Build the image as a single HTML/CSS composition.
- Render it at the requested dimensions.
- Take a screenshot using Playwright.
- Save as PNG and/or WebP.

Do not pretend an AI image was generated if it was actually rendered from HTML/CSS.

## Target Visual Quality

The visual should feel like:

- premium SaaS marketing
- polished product-studio design
- dark navy / black glassmorphism
- blue / cyan / purple neon gradient accents
- sharp modern typography
- balanced spacing
- realistic dashboard/UI elements
- strong CTA hierarchy
- high-contrast cards
- subtle background grid
- radial glow effects
- soft shadows
- clean iconography

Avoid:

- generic Tailwind cards
- default browser UI
- oversized empty sections
- random gradients
- blurry text
- low-contrast gray text
- cramped buttons
- fake clutter
- awkward AI-generated misspellings
- tiny unreadable UI labels
- inconsistent icons
- off-brand colors

## 1stStep.ai Visual Direction

For 1stStep.ai graphics, use:

Background:

- deep navy / near-black
- subtle grid overlay
- soft blue/purple radial glows

Accent colors:

- electric blue
- cyan
- violet
- magenta-purple
- occasional green for positive status/checks

Style:

- futuristic but clean
- premium SaaS
- product studio
- glass panels
- glowing borders
- rounded cards
- functional dashboard mockups

Typography:

- large bold headlines
- tight line-height
- strong gradient highlight on the key phrase
- body text muted but readable

Brand copy themes:

- app idea
- manual workflow
- working first version
- right first version
- launch faster
- no overbuilding
- dashboards
- websites
- automations
- SaaS MVPs
- lead systems
- Chrome extensions

## Rendering Workflow

For every visual asset task:

1. Determine target size.
2. Create an HTML/CSS composition.
3. Use inline SVG or CSS icons when possible.
4. Use real logo assets if available.
5. Use CSS-created dashboard mockups instead of flat screenshots unless the user provides real screenshots.
6. Render locally in browser.
7. Take screenshot.
8. Review screenshot.
9. Fix spacing, alignment, contrast, and text issues.
10. Export final PNG/WebP.

Do not report done until the screenshot exists and has been visually reviewed.

## Recommended File Structure

Create temporary render files here:

```text
tools/visual-renders/
```

Suggested files:

```text
tools/visual-renders/render-asset.html
tools/visual-renders/render-asset.css
tools/visual-renders/render-asset.js
tools/visual-renders/screenshot-asset.mjs
```

Save final outputs to:

```text
public/generated/
```

or for user-download assets:

```text
exports/
```

Use descriptive file names:

```text
public/generated/firststep-hero-mockup.png
public/generated/firststep-google-reviews-section.png
public/generated/firststep-before-after.png
public/generated/firststep-pricing-cards.png
```

## Standard Sizes

Use these unless the user specifies otherwise:

Website mockup:

1600x1000

Hero/fold mockup:

1600x1100

Open Graph image:

1200x630

LinkedIn company banner:

1128x191

LinkedIn personal banner:

1584x396

Twitter/X header:

1500x500

Facebook cover:

1640x924

Google Business Profile cover:

1024x576

Square social post:

1080x1080

Landscape social post:

1200x675

YouTube thumbnail:

1280x720

## HTML/CSS Rendering Standards

Use:

- CSS grid/flex layouts
- fixed viewport canvas
- high-resolution screenshot
- local fonts or system font stack
- SVG icons when possible
- CSS gradients
- CSS shadows
- CSS radial glows
- CSS background grid
- realistic mock dashboard panels

Do not use:

- text embedded in raster images unless final export only
- low-resolution assets
- stretched logos
- random stock photos unless user provides them
- copyrighted logos incorrectly except when the user explicitly requests brand-accurate placement and it is appropriate for the mockup

## Screenshot Script Example

Use Playwright to screenshot the visual composition.

Example:

```js
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2
});

await page.goto(`file://${path.join(__dirname, "render-asset.html")}`, {
  waitUntil: "networkidle"
});

await page.screenshot({
  path: path.join(process.cwd(), "public/generated/firststep-visual-asset.png"),
  fullPage: false
});

await browser.close();
```

If Playwright is not installed, install it only if project rules allow new dev dependencies. Otherwise use an existing browser screenshot workflow.

## Design Composition Patterns

### 1. Premium Hero Mockup

Use when creating a homepage/fold picture.

Must include:

- glass navbar
- logo
- nav links
- primary CTA
- eyebrow pill
- large headline
- gradient phrase
- short subheadline
- primary/secondary buttons
- trust chips
- dashboard visual
- floating process cards
- bottom feature strip

Recommended 1stStep.ai headline:

Turn your app idea or manual workflow into a working first version.

Highlight:

working first version

### 2. Before / After Graphic

Must include two clear panels:

Before:

- messy ideas
- scattered tools
- no launch path
- scope keeps growing

After:

- focused first version
- connected workflow
- clear path to action
- roadmap for improvement

Use:

- red/orange subtle accents for Before
- blue/cyan/green accents for After
- strong contrast
- visual metaphors like scattered cards vs clean dashboard

### 3. Pricing Cards Graphic

Must include:

- title
- supporting copy
- three cards
- icon per card
- category badge
- price
- outcome-driven description
- best-for list
- CTA
- bottom trust strip

Pricing cards for 1stStep.ai:

- Website + Lead Capture System — starting at $1,500
- Internal Tool or Dashboard — starting at $3,500
- MVP App Build — starting at $5,000

### 4. Google Reviews Graphic

Must include:

- Google "G" logo where appropriate
- "Google Reviews" headline
- star rating
- testimonial cards
- profile photos if actual photos are available
- otherwise polished neutral avatars
- clean "View on Google" link rows
- CTA button that does not overlap text

Do not fake a review count unless the user provides one.

### 5. Dashboard Mockup Graphic

Must include:

- sidebar
- active nav state
- metrics cards
- progress chart
- checklist
- status tags
- realistic labels
- glowing border
- dark glass panels

For 1stStep.ai:

- Active Projects
- Leads Captured
- Tasks Completed
- Days to Launch
- Project Progress
- Next Steps
- MVP Score
- Recommended Path

## Logo Rules

Use the real project logo asset if it exists in the repo.

Do not recreate the logo text manually if the real logo image is available.

If using the 1stStep.ai logo:

- keep it crisp
- do not stretch it
- preserve aspect ratio
- place it on dark background with enough contrast
- keep clear space around it

## Image Asset Rules

If user provides images:

- use them directly where relevant
- crop carefully
- preserve faces/logos
- avoid distortion
- do not cover important text
- do not use images as blurry background unless intentionally decorative

If profile photos are needed and the user did not provide them:

- use neutral avatar illustrations or initials
- do not invent fake customer headshots for production pages
- mockup-only designs may use clearly illustrative placeholder people

## Copy Rules for Visuals

Keep text short.

Marketing images should not contain paragraphs longer than 2-3 lines.

Use sharp labels:

- Free to start
- No credit card
- Get clarity in minutes
- Built for real workflows
- Launch faster
- No overbuilding
- Version-one scope
- Real builds. Not just mockups.

Avoid:

- long disclaimers
- dense technical explanations
- generic AI buzzwords

## Quality Checklist

Before reporting done, verify:

- The image exists.
- The image size is correct.
- Text is readable.
- No text is cut off.
- Buttons do not overlap text.
- Logo is not distorted.
- Cards are aligned.
- Spacing feels intentional.
- Colors match the brand.
- Dashboard/mockup looks premium.
- The image does not look like a plain webpage screenshot.
- The final asset is saved in the expected location.

## Reporting Format

Report:

Created visual asset:

- File:
- Size:
- Format:
- Source/render files:
- Notes:

If something could not be done, say exactly what failed and why.
