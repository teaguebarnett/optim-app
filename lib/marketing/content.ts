// All public-website copy, in one place. This is the approved beta copy —
// change it here, not inside components. No invented trials, discounts,
// guarantees, response times, remaining-place counts, or time-saving claims.

export const HOME_META = {
  title: "OPTIM | Coaching Software Built Around Your Method",
  description:
    "Explore OPTIM, software designed to reduce repetitive coaching work while keeping your method and coaching decisions central. Request beta access.",
};

export const PRICING_META = {
  title: "OPTIM Pricing | Plans for Fitness Coaches",
  description: "OPTIM plans are based on how many clients you coach: Starter, Growth, Pro, and Scale. Paid signup is not open yet — request beta access.",
};

export const NAV = {
  product: "Product",
  howItWorks: "How it works",
  pricing: "Pricing",
  requestAccess: "Request beta access",
  betaLogin: "Beta login",
  privacy: "Privacy",
  menu: "Menu",
};

export const HERO = {
  eyebrow: "Software for fitness coaches",
  heading: "Less updating. More coaching.",
  body: "OPTIM is designed to reduce repetitive coaching work while keeping your methodology, client relationships, and meaningful decisions at the center.",
  primary: "Request beta access",
  secondary: "See how OPTIM works",
  stageNote: "Private beta. Paid signup is not open yet.",
};

/** Captions for real stills captured from the current beta interface running
 * with demonstration data — never presented as live customer data. */
export const STILLS = {
  calibration: "The existing coach calibration survey, from the current beta interface.",
  attention: "The coach view in the current beta interface, shown with demonstration data.",
  clientToday: "A client's day in the current beta interface, shown with demonstration data.",
  clientEdge: "The client's daily entrance in the current beta interface, shown with demonstration data.",
};

export const DEMO = {
  heading: "See the coaching workflow.",
  body: "Explore how your coaching method, client information, and review decisions come together in OPTIM.",
  steps: [
    { title: "Your coaching method", body: "Coach calibration asks how you coach: who you work with, how you build and adjust training, and how you communicate." },
    { title: "Client information", body: "Each client completes an intake, so their plan starts from what they actually told you." },
    { title: "Review decisions", body: "Program proposals come to you to approve, edit, or reject." },
  ],
};

export const METHOD = {
  heading: "Your coaching method is the starting point.",
  body: "Tell us how you coach. The beta walkthrough explores how OPTIM is intended to support your programming principles, communication style, and decision boundaries.",
  labels: [
    { title: "Your method", body: "Your programming principles and communication style, in your own terms." },
    { title: "Clear boundaries", body: "The decisions you want brought to you, stated up front." },
    { title: "Your final say", body: "Meaningful coaching decisions stay with the coach." },
  ],
  authority: "Our product model keeps the coach responsible for meaningful decisions. We’ll show you the current review workflow during the beta walkthrough.",
};

export const ATTENTION = {
  heading: "Know where your attention matters.",
  body: "Explore OPTIM’s coach view: decisions that need you, useful updates, and completed work. Ask us to show what is working in the current beta.",
  zones: [
    { label: "NEEDS YOU", body: "Decisions that need your judgment." },
    { label: "WORTH KNOWING", body: "Useful updates, kept out of the way." },
    { label: "HANDLED", body: "Completed work you can check any time." },
  ],
};

export const CLIENT = {
  heading: "A clearer next step for every client.",
  body: "OPTIM is being developed around the client’s day: what matters now, what to do next, and how it connects to their goal—with their coach still central to the experience.",
  entryLine: "Already using OPTIM with your coach?",
  button: "Beta login",
};

export const SETUP = {
  heading: "Built to start with your coaching.",
  body: "Here’s the planned setup journey when paid signup opens. For now, request a beta walkthrough.",
  steps: [
    { title: "Choose your plan", body: "Select the client range that fits your practice and complete Stripe checkout." },
    { title: "Set up your account", body: "Your OPTIM email contains the secure account-setup link for your purchase." },
    { title: "Calibrate your method", body: "Complete the existing coach calibration, review your method, and confirm it." },
    { title: "Bring in your first client", body: "Invite a client, review their intake, and approve their first plan." },
  ],
};

export const PRICING = {
  heading: "Plans that match your client roster.",
  body: "Choose the client range that fits your coaching practice. Paid signup will open after the complete coaching journey has been verified.",
  cardCta: "Request beta access",
  scaleCta: "Discuss Scale",
  customPrice: "Custom pricing",
  perMonth: "/month",
  note: "Published base prices are monthly in USD. No payment is collected through beta requests.",
  founding: "Interested in founding-coach access? Ask about the Founding Ten program and current availability.",
  foundingCta: "Ask about founding-coach access",
  previewLink: "See full pricing",
};

export const FOUNDER = {
  heading: "Built from the work behind personal coaching.",
  body: "I didn’t start dreading Sundays because I stopped caring about my clients. I dreaded them because every client meant another check-in to interpret, program to review, nutrition decision to make, and message to answer. The coaching was personal. The work behind it kept repeating. That’s why I started OPTIM: to organize the work around a coach’s expertise, so delivering personal coaching doesn’t depend on doing every routine task by hand.",
  attribution: "Teague Barnett, founder of OPTIM",
};

export const FAQ_HEADING = "Questions coaches ask";

export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is OPTIM for coaches or clients?",
    a: "OPTIM is software for coaches and the clients they coach. Coaches choose the software plan. Clients join through their coach’s invitation. If you’re already in the beta, use Beta login.",
  },
  {
    q: "Will OPTIM replace my judgment?",
    a: "OPTIM’s product model keeps meaningful coaching decisions with the coach. The beta walkthrough shows the current review flow and the boundaries being verified before paid launch.",
  },
  {
    q: "Can I change how OPTIM follows my method?",
    a: "The intended experience is a saved coaching method that you can edit through the existing calibration survey in Settings. We’ll demonstrate the current method workflow during the beta walkthrough.",
  },
  {
    q: "Do I need to move every client immediately?",
    a: "Start by exploring one coaching workflow with us. Real-client beta access and any import options depend on the workflows currently supported. We’ll discuss the practical setup before you move a roster.",
  },
  {
    q: "Can I sign up and pay now?",
    a: "Paid signup is not open yet. Request beta access to discuss a walkthrough. The three published base tiers are $49, $149, and $299 per month, based on client count.",
  },
  {
    q: "Is there a free trial?",
    a: "There is no open public trial at this stage. Request beta access to learn about current evaluation options. There is no charge for requesting access.",
  },
  {
    q: "How do my clients get in?",
    a: "New clients join through their coach’s invitation. Clients already in the beta use Beta login to reach their own coaching experience. Installation instructions will reflect the devices and app behavior verified for launch.",
  },
];

export const REQUEST = {
  heading: "See whether OPTIM fits the way you coach.",
  body: "Join the beta list. We’ll email you when OPTIM opens for access.",
  labels: {
    firstName: "First name",
    email: "Email",
    clientCount: "How many active clients do you currently coach?",
    link: "Instagram or website (optional)",
  },
  submit: "Request beta access",
  /** Shown beside the button: how the email will be used. */
  notice: "We’ll use your email only to contact you about OPTIM beta access and launch.",
  noticeLink: "Privacy",
  sending: "Sending your request…",
  successHeading: "You’re on the list.",
  successBody: "We’ll email you when OPTIM opens for access.",
  duplicateHeading: "You’re already on the list.",
  duplicateBody: (email: string) => `${email} is already on the OPTIM beta list. We’ll email you when OPTIM opens for access.`,
  error: "Your request wasn’t sent. Your details are still here—please try again.",
  interestPrefix: "Plan interest:",
  interestNote: "Interest only — no plan is reserved and nothing is charged.",
};

export const FOOTER = {
  tagline: "Coaching software built around your method.",
  stage: "Private beta. Paid signup is not open yet.",
};

/** Phone-only composition (below 768px). Shorter wording of the same claims
 * as the desktop sections above — nothing here adds a claim. */
export const MOBILE = {
  heroBody: "Designed to reduce repetitive coaching work, while your method, client relationships, and decisions stay at the center.",
  stillCaption: "Current beta screen, shown with demonstration data.",
  how: {
    heading: "How OPTIM works",
    steps: [
      { title: "Teach OPTIM your coaching method", body: "Coach calibration asks how you program, adjust training, and communicate." },
      { title: "OPTIM organizes client information and prepares decisions", body: "Each client’s intake sits alongside your method, and program proposals are prepared for you." },
      { title: "You review what matters and remain in control", body: "Approve, edit, or reject every program proposal." },
    ],
  },
  control: {
    heading: "Your method. Your final say.",
    body: "OPTIM prepares and organizes. You make the meaningful decisions.",
  },
  client: {
    heading: "A clearer day for every client.",
    intro: "Being developed around each client’s day:",
    points: ["What matters today", "What to do next", "Guidance within their coach’s approach"],
  },
  founder: {
    heading: "Built from real coaching work.",
    short: "Every client meant another check-in to interpret, program to review, and message to answer. The coaching was personal. The work behind it kept repeating.",
    more: "Why I built OPTIM",
  },
  setupMore: "How setup will work when paid signup opens",
};
