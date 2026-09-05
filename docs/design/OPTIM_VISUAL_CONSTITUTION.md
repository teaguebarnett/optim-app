# OPTIM Visual Constitution v1

> **Phase 5.3B update — palette superseded.** The "Warm Stone + Brass"
> palette described throughout this document (sections referencing
> `--pc-near-black` as stone/putty, ivory-on-stone cards, brass as a
> frequent accent) has been replaced app-wide by **Pearl Ivory** (light)
> and **Midnight Navy** (dark), with **electric cobalt** (`#3157F6`) as the
> primary interactive/accent color and a shared deep-navy (`#071A34`)
> "signature surface" reserved for singular focal moments (the coach
> Command Center's top-priority decision). Brass survives only as a rare,
> restrained micro-accent (progress fills, a chapter icon) — never a
> dominant wash. See `app/globals.css`'s `:root` and `:root[data-theme=
> "dark"]` blocks for the authoritative token values, and
> `components/app-shell/theme-provider.tsx` for the explicit, per-account,
> user-selected light/dark mechanism (never inferred from the OS). The
> philosophy, hierarchy, typography, and motion principles below remain
> current; only the literal color values and the "warm stone" framing are
> out of date.

## 1. Purpose

OPTIM is both an intelligent coaching system and a visual product.

The interface must communicate the same qualities as the intelligence underneath it:

**Clarity. Control. Refinement. Energy. Precision. Adaptability.**

OPTIM should never feel like a generic fitness dashboard, calorie tracker, spreadsheet, medical portal, or AI chatbot.

The visual experience should feel intentionally designed enough that an OPTIM screen is recognizable even without the logo.

---

# 2. Core Design Philosophy

## Curated, not sparse

Minimalism is not the goal.

**Curation is.**

OPTIM can know hundreds of things about a client, but only the information that deserves attention should occupy the screen.

Every visible element must earn its place.

Think:

> Ten perfectly arranged objects, not fifty objects piled together.

---

## Relevance determines visibility

Information should appear when it becomes useful.

Today is not a storage page containing every possible metric.

It is an **intelligent presentation layer**.

Examples:

* Cardio does not need prominence at breakfast.
* A post-workout meal becomes important after training.
* A missed meal can become more prominent when the client's normal eating window passes.
* Completed morning actions should collapse into progress/status rather than permanently consuming large areas of the screen.

OPTIM should increasingly understand the client's patterns and reorganize information accordingly.

---

## Importance determines visual weight

Not all information deserves equal hierarchy.

The interface should dynamically determine what is:

* dominant
* supporting
* summarized
* temporarily hidden

The baseline experience should remain a beautiful daily overview.

A stronger **NOW / NEXT** hierarchy should appear only when context makes it valuable.

Do not make the client open OPTIM every day to the same repetitive "your last meal was 47 minutes ago" experience.

---

# 3. Emotional Target

Opening OPTIM should produce a blend of:

* clarity
* control
* refinement
* energy

The product should feel visually outstanding without becoming visually exhausting.

**Outstanding, not overwhelming.**

**Architectural, not sterile.**

**Precise, but human.**

---

# 4. Primary Visual Direction

## Warm Stone + Brass

This is the primary OPTIM design language.

### Canvas

Warm stone / light beige / soft putty.

Avoid:

* cold gray
* clinical white
* blue-gray corporate backgrounds

The canvas should feel warm and physical.

### Surfaces

Ivory / cream / warm off-white.

Cards should visibly separate from the canvas without looking like floating white rectangles on a gray dashboard.

### Structural dark

Deep charcoal or extremely dark navy.

Used for:

* primary actions
* important structural contrast
* dominant text where appropriate
* selected states

Avoid pure black unless required for legibility.

### Brass

Muted architectural brass.

Used selectively for:

* progress
* active states
* meaningful highlights
* important moments
* data visualization
* refined micro-details

Brass must never become bright metallic gold or luxury-brand decoration.

It is an **accent**, not the product.

### Status colors

Functional colors may exist when semantically necessary:

* completion
* warning
* error
* success

They should remain restrained and harmonize with the Warm Stone + Brass system.

---

# 5. Geometry

OPTIM uses one consistent engineered geometry.

### Primary radius range

**12–16px**

The interface should feel:

* refined
* engineered
* approachable
* easy to read

Avoid:

* exaggerated pill-shaped everything
* extremely rounded toy-like UI
* sharp industrial corners
* inconsistent radius systems

Circular elements are appropriate for:

* progress rings
* profile imagery
* certain status indicators
* purposeful data visualization

Consistency matters more than experimentation.

---

# 6. Composition

Every screen should be treated as a **composition**, not a vertical stack of components.

Default structure:

* approximately 2–3 coordinated information zones
* medium-to-high information density
* strong hierarchy
* deliberate negative space
* mostly symmetrical balance

Asymmetry may be used when it creates intentional emphasis.

It should never happen accidentally because components happened to fit that way.

## 6.1 Modular / Bento Composition

For information-dense daily experiences (Today, and eventually Training, Nutrition, Progress, Chat, and History), a **modular bento grid** is an approved and preferred composition technique — coordinated tiles of different visual weight, sized by relevance, grouped rather than stacked.

**A chronological, single-column list of equal-weight rows must never become the default page architecture.** A vertical list of full-width cards — even a compact one, even one with expand/collapse — still reads as a task list, not a designed product. If a screen's information doesn't fit naturally into 2–3 coordinated zones or a genuine multi-column grid, that's a signal to reconsider the composition, not a reason to fall back to a list.

Within a bento grid:

* the item that is truly relevant right now earns the dominant tile (typically full-width);
* compact summary tiles (a progress indicator, a consolidated "completed" state) replace repeating the same information as multiple equal rows;
* not-yet-relevant items live in small tiles, not full-width rows — a tile may reveal its full interaction on tap without breaking the grid;
* the grid's structure stays stable across states (so the client always knows where to look), while what fills each tile — and how much visual weight it carries — is what actually changes as the day evolves.

---

# 7. Symmetry and Alignment

Symmetry is a core part of OPTIM's sense of refinement.

Alignment should feel exceptionally intentional.

Prioritize:

* consistent horizontal anchors
* proportional spacing
* balanced internal card layouts
* predictable visual rhythm
* clean relationships between typography, graphics, and controls

Premium should come from **precision of composition**, not visual decoration.

---

# 8. Cards

Cards remain an important OPTIM component.

The problem is not cards.

The problem is treating every piece of information as an identical card.

Cards may be:

* dominant
* compact
* supporting
* informational
* interactive
* temporarily collapsed

Some information should appear directly on the canvas without a card.

The page itself must feel like one designed composition rather than a pile of independent rectangles.

---

# 9. Sculptural Information

Important data may become a visual object.

Examples:

* calorie / macro rings
* weight trends
* adherence arcs
* training readiness indicators
* timelines
* progress curves
* program progression

These elements do not always need conventional dashboard containers.

When appropriate, allow a visualization to sit directly within the composition and become one of the defining visual elements of the screen.

Data visualization should balance:

**clinical precision + visual beauty.**

Never sacrifice comprehension for aesthetics.

---

# 10. Typography

Typography must create immediate hierarchy.

The client should understand the page before consciously reading everything.

Use clear distinctions between:

* screen title
* major status/value
* section heading
* primary action
* body information
* supporting metadata
* labels

Avoid excessive font weights, unnecessary capitalization, and tiny gray helper text.

Typography should contribute warmth and refinement while remaining highly legible on mobile.

## 10.1 Type Family

OPTIM uses exactly ONE font family: **Manrope.** No screen should introduce a second.

Hierarchy comes entirely from **scale, weight, line-height, tracking, capitalization, and spatial placement** — never from switching typefaces. A calorie number and a button label must read as the same product because they use the same typeface; only how each one is set (size, weight, position on the page) tells the client which one matters more right now.

This is a deliberate correction: an earlier iteration paired Manrope with a second, expressive serif for display moments (a greeting, a focal metric, a coach's note). It was removed because it split OPTIM's identity across two typographic voices instead of expressing precision, warmth, and hierarchy through one confident, well-controlled system. Distinctiveness now comes from restraint and composition, not from a decorative accent font.

## 10.2 Semantic Typography Tokens

Every screen must reach for one of these named roles instead of choosing an arbitrary font size or weight locally. In code, these exist as Tailwind utilities (`text-display`, `text-metric`, `text-heading`, `text-subheading`, `text-body`, `text-label`, `text-meta`, `text-action`) defined once in `app/globals.css` and consumed everywhere — never a one-off `text-[Npx]` for these roles. Each token controls only font-family/size/weight/line-height/tracking; text color is always applied separately (`text-off-white`, `text-neutral`, etc.) so the same role can be recolored per context.

| Token | Size / weight | Use for |
|---|---|---|
| `text-display` | 30px, 600 | The daily greeting and rare hero statements. One per screen, at most. |
| `text-metric` | 36px, 600, tabular numerals | One sculptural focal number per surface — calories, bodyweight, a major progress number. Not every number; only the one a surface is built around. Scale and weight carry the "sculptural" feel — there is no separate display typeface to lean on. |
| `text-heading` | 18px, 600 | A major card/surface title — the one thing a surface is currently about (e.g. a spotlighted task's name). |
| `text-subheading` | 15px, 600 | Secondary/compact titles: a tile's task name, a coach's name, a resolved status line. |
| `text-body` | 15px, 400 | Real sentences — descriptions, coaching guidance, encouragement copy. |
| `text-label` | 11px, 600, uppercase, restrained tracking | Short category tags (FUEL, TRAINING, RIGHT NOW). Clearly subordinate; never a substitute for `text-heading`. |
| `text-meta` | 13px, 400 | Times, dates, program-week context, recommendations, supporting status fragments. Small is not the same as faint — pair with `text-neutral`, never a low-opacity color, and never shrink below what's comfortably legible on a phone. |
| `text-action` | 14px, 600 | Bespoke interactive text not going through the Button component (inline links like "Change" or "Message"). Button's own size variants already encode this role for real buttons. |

Coach communication (see §16) stays visually human through **composition** — a named author, an avatar, an explicit "From your coach" label, a brass keyline, a dedicated warm surface — using the exact same tokens as everything else, never a different or decorative typeface.

---

# 11. Density

OPTIM should be capable of showing substantial information without feeling dense.

Target:

**medium-to-high informational density with high perceived simplicity.**

Large empty areas are not automatically premium.

Information should be efficiently composed rather than unnecessarily enlarged.

A screen should never require excessive vertical scrolling simply because every metric was given its own full-width block.

---

# 12. Adaptive Layout

OPTIM should become highly adaptive.

Within a stable navigation and visual framework, the hierarchy may change based on:

* time of day
* training time
* meal schedule
* completed actions
* missed actions
* historical behavior
* recurring habits
* coach programming
* current goals
* contextual recommendations

The client should always understand where they are and how to navigate.

The **content hierarchy may adapt aggressively.**

The **mental model may not.**

---

# 13. Completion Behavior

Completing an action should make OPTIM visibly respond.

Depending on importance:

* subtle confirmation
* satisfying micro-animation
* progress visualization update
* card collapse
* screen reorganization
* elevation of the next relevant item

The interface should feel alive because the system understands what changed.

Avoid:

* confetti
* exaggerated celebrations
* gamification for trivial actions
* distracting animations

---

# 14. Motion

Motion should be:

* smooth
* restrained
* responsive
* purposeful

Use motion to communicate:

* completion
* hierarchy changes
* state transitions
* expansion/collapse
* navigation
* adaptation

Motion should never exist solely to demonstrate that animation is possible.

---

# 15. Human Warmth

OPTIM must never become a sterile laboratory interface.

Warmth should come from:

* warm stone surfaces
* ivory rather than clinical white
* softened charcoal typography
* subtle physical depth
* human coaching language
* thoughtful imagery when appropriate
* natural transitions
* coach presence

The product can have the precision of a medical lab while retaining the hospitality of an exceptional restaurant.

---

# 16. Coach vs OPTIM

The distinction between the human coach and OPTIM must remain visually clear.

The client must always understand whether information came from:

* their coach
* OPTIM
* their own logged data

Coach communication should feel distinctly human and personal.

OPTIM assistance should feel integrated and intelligent without impersonating the coach.

---

# 17. Page Identity

Every major area belongs to the same design language but should not have the same composition.

### Today

Purpose: orientation and intelligent daily prioritization.

Should feel dynamic and adaptive.

### Training

Purpose: execution.

Should prioritize workout structure, progression, immediate inputs, and clarity under physical effort.

### Nutrition

Purpose: planning and consumption.

Should make meals, timing, progress, and relevant guidance effortless to understand.

### Progress

Purpose: reflection.

Should lean more heavily into beautiful, precise data visualization and historical context.

### Chat

Purpose: communication.

Should feel personal and conversational while clearly separating Coach and OPTIM.

### Historical Day

Purpose: review.

Should visually communicate that the client is looking backward rather than operating inside today's live workflow.

---

# 18. Navigation

Navigation must remain exceptionally obvious.

The user should never:

* wonder where they are
* hunt for major functions
* confuse navigation with content
* lose context after completing an action

Simple understanding outranks novelty.

---

# 19. Mobile-First Rule

OPTIM is designed for the client's phone first.

Every design decision must be tested against:

* thumb reach
* one-handed use
* rapid comprehension
* gym environments
* walking / eating / daily-life contexts
* limited attention

Desktop space must never become an excuse for a desktop-dashboard architecture.

---

# 20. The Restaurant Standard

OPTIM should follow the philosophy of an invite-only precision restaurant:

* restrained environment
* perfect placement
* exceptional ingredients
* no unnecessary excess
* highly intentional presentation
* personal service
* memorable experience
* each course arrives when it should

The intelligence underneath may be extremely complex.

The experience presented to the client should feel effortless.

---

# 21. OPTIM Must Never Become

* a generic SaaS dashboard
* a grid of analytics widgets
* a calorie tracker
* a spreadsheet
* a dark racing-themed application
* an AI chatbot with fitness features attached
* sterile corporate healthcare software
* excessively rounded lifestyle UI
* decorative luxury UI
* cluttered
* visually repetitive
* difficult to navigate
* visually impressive at the expense of comprehension

---

# 22. Final Design Test

Before approving any OPTIM screen, ask:

1. Can the purpose of this screen be understood immediately?
2. Is everything visible actually relevant?
3. Does the most important information have the strongest visual weight?
4. Could anything be combined rather than placed in another card?
5. Does the composition feel intentional and balanced?
6. Is the information dense without feeling cluttered?
7. Does it feel warm rather than sterile?
8. Does it feel distinctly OPTIM?
9. Does it work beautifully on a phone?
10. Would removing the OPTIM logo still leave a recognizable product?

If several answers are no, the screen is not finished.
