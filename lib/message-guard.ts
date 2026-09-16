/**
 * Message Guard — lightweight, on-device scam analysis for Indian messaging scams.
 *
 * Local heuristics are weighted and combined into a 0–100 risk score. For an
 * optional AI-powered second opinion, `buildGuardPrompt(text)` produces a
 * structured prompt that can be sent to any LLM endpoint.
 */

export type GuardLevel = "safe" | "moderate" | "high";

export interface GuardFlag {
  code: string;
  weight: number;
  /** Senior-friendly explanation (English) */
  label: string;
  /** Senior-friendly explanation (Hindi) */
  labelHi: string;
}

export interface GuardResult {
  level: GuardLevel;
  /** 0–100 weighted risk score */
  score: number;
  headline: { en: string; hi: string };
  /** Calm, reassuring line shown to seniors */
  reassurance: { en: string; hi: string };
  flags: GuardFlag[];
  advice: { en: string; hi: string }[];
}

interface Rule {
  code: string;
  weight: number;
  re: RegExp;
  label: string;
  labelHi: string;
}

const RULES: Rule[] = [
  {
    code: "otp",
    weight: 40,
    re: /\b(otp|one[\s-]?time (password|pin))\b|\bpin\b/i,
    label: "Asks for an OTP or PIN — no bank or company will ever ask for this",
    labelHi: "OTP या PIN माँग रहा है — कोई भी बैंक या कंपनी ऐसा नहीं कहती",
  },
  {
    code: "digital-arrest",
    weight: 40,
    re: /\b(digital arrest|cbi|narcotics|income tax (officer|raid)|arrest warrant|parcel (contains|with) (drugs|passport))\b/i,
    label: "Police/CBI 'digital arrest' threat — real police never arrest over a video call",
    labelHi: "पुलिस/CBI 'डिजिटल अरेस्ट' की धमकी — असली पुलिस वीडियो कॉल पर गिरफ्तार नहीं करती",
  },
  {
    code: "kyc",
    weight: 35,
    re: /\b(kyc|verify your (account|kyc)|account (is )?(blocked|suspended|frozen)|block(ed)? your account)\b/i,
    label: "Says your account is blocked or KYC expired — this is a common scare tactic",
    labelHi: "कहता है खाता ब्लॉक है या KYC एक्सपायर — यह आम डराने की तरकीब है",
  },
  {
    code: "electricity",
    weight: 35,
    re: /\b(electricity bill|power (will be )?(cut|disconnect)|bijli|disconnect(ed)? (your )?(electricity|power|connection)|meter (replac|updat))\b/i,
    label: "Threatens to cut your electricity — real electricity boards never warn through SMS links",
    labelHi: "बिजली काटने की धमकी — असली विद्युत विभाग SMS-लिंक नहीं भेजता",
  },
  {
    code: "lottery",
    weight: 35,
    re: /\b(lottery|prize|jackpot|lucky draw|kbc|you (have )?won|₹\s?\d+[,\d]*\s?(lakh|crore))\b/i,
    label: "Offers a lottery/prize you never entered — real winners are never asked to pay",
    labelHi: "ऐसा इनाम जो आपने कभी नहीं जीता — असली इनाम के लिए पैसे नहीं माँगे जाते",
  },
  {
    code: "money",
    weight: 25,
    re: /\b(upi|paytm|gpay|google pay|phonepe|neft|refund|cashback|processing fee|registration fee|advance fee|send money|transfer (₹|rs\.?|money))\b/i,
    label: "Wants a money transfer, a fee, or a 'refund' — always verify before paying",
    labelHi: "पैसे भेजने, शुल्क या 'रिफंड' की माँग — भेजने से पहले जाँच ज़रूर करें",
  },
  {
    code: "relative",
    weight: 25,
    re: /\b(your (son|daughter|grandson)|hospitalised|admitted in hospital|new number|lost my phone)\b/i,
    label: "Claims a relative needs money urgently — call them on their old number first",
    labelHi: "रिश्तेदार को जल्दी पैसे चाहिए का दावा — पहले उनके पुराने नंबर पर कॉल करें",
  },
  {
    code: "link",
    weight: 20,
    re: /(click|tap)[^.]{0,30}(link|here)|bit\.ly|tinyurl|https?:\/\//i,
    label: "Contains a link — never tap links in unknown messages",
    labelHi: "इसमें लिंक है — अनजान संदेश का लिंक कभी न दबाएँ",
  },
  {
    code: "urgency",
    weight: 20,
    re: /\b(urgent|immediately|within \d+ (hours|minutes)|last (chance|warning)|today only|expires? (today|in \d+)|final notice)\b/i,
    label: "Pressures you to act fast — hurry is a scammer's favourite trick",
    labelHi: "जल्दी करने का दबाव — जल्दबाज़ी ठगी का पुराना तरीका है",
  },
  {
    code: "courier",
    weight: 20,
    re: /\b(courier|fedex|bluedart|customs|parcel (is )?(stuck|held)|import duty)\b/i,
    label: "Fake courier / customs fee demand",
    labelHi: "नकली कूरियर/कस्टम्स शुल्क की माँग",
  },
];

const BASE_ADVICE: { en: string; hi: string }[] = [
  { en: "Never share OTP, PIN, or CVV with anyone — not even 'bank staff'.", hi: "कभी भी किसी के साथ OTP, PIN या CVV साझा न करें — 'बैंक स्टाफ' को भी नहीं।" },
  { en: "Real banks never block accounts through SMS links.", hi: "असली बैंक SMS-लिंक से खाता कभी ब्लॉक नहीं करते।" },
  { en: "Before sending any money, call the person on their old number.", hi: "पैसे भेजने से पहले उस व्यक्ति को उसके पुराने नंबर पर कॉल करें।" },
];

const HEADLINES: Record<GuardLevel, { en: string; hi: string; reassurance: { en: string; hi: string } }> = {
  safe: {
    en: "✅ Looks Safe",
    hi: "✅ सुरक्षित लगता है",
    reassurance: {
      en: "No scam patterns found. Well done for checking before trusting it!",
      hi: "कोई ठगी का पैटर्न नहीं मिला। भरोसा करने से पहले जाँच करना बहुत अच्छा!",
    },
  },
  moderate: {
    en: "⚠️ Moderate Risk — Be Careful",
    hi: "⚠️ मध्यम जोखिम — सावधान रहें",
    reassurance: {
      en: "Something looks suspicious. Don't tap anything or pay yet — ask your family first.",
      hi: "कुछ संदिग्ध लग रहा है। अभी कुछ न दबाएँ, पैसे न भेजें — पहले परिवार से पूछें।",
    },
  },
  high: {
    en: "🚨 High Risk — Likely a Scam",
    hi: "🚨 उच्च जोखिम — संभव ठगी",
    reassurance: {
      en: "You did the right thing by checking first. Do not click any link, share any OTP, or send any money.",
      hi: "आपने पहले जाँच करके बिल्कुल सही किया। कोई लिंक न दबाएँ, OTP न दें, पैसे न भेजें।",
    },
  },
};

export const GUARD_SAMPLES = [
  "URGENT: Your electricity bill is overdue. Power will be cut tonight at 8 PM. Pay ₹2,340 immediately via https://mseb-fastpay.xyz to restore your connection.",
  "Dear customer, your KYC expires today. Click http://sbi-kyc-alert.verify-update.com or your account will be blocked within 2 hours.",
  "Congratulations! You won ₹25,00,000 in KBC Lucky Draw. Send ₹5,000 processing fee via UPI to claim your prize immediately.",
  "Hi Mummy, I reached office safely. Will be home by 7 pm. Please do not wait for dinner. Love you!",
];

export function analyzeMessage(text: string): GuardResult {
  const flags: GuardFlag[] = [];
  let score = 0;
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      flags.push({ code: rule.code, weight: rule.weight, label: rule.label, labelHi: rule.labelHi });
      score += rule.weight;
    }
  }
  score = Math.min(100, score);
  const level: GuardLevel = score >= 60 ? "high" : flags.length > 0 ? "moderate" : "safe";
  const advice = [...BASE_ADVICE];
  if (level === "high") {
    advice.push({
      en: "Report this message to the Cyber Crime helpline 1930.",
      hi: "इस संदेश को साइबर क्राइम हेल्पलाइन 1930 पर रिपोर्ट करें।",
    });
  }
  return {
    level,
    score,
    headline: HEADLINES[level],
    reassurance: HEADLINES[level].reassurance,
    flags,
    advice,
  };
}

/** Pre-formatted "Ask Family" message for the circle chat / alert group. */
export function guardShareText(result: GuardResult, message: string): string {
  const snippet = message.trim().slice(0, 400);
  const levelWord =
    result.level === "high"
      ? "HIGH RISK"
      : result.level === "moderate"
        ? "MODERATE RISK"
        : "LOOKS SAFE";
  return [
    "🛡️ Message Guard — please help me check this message",
    `Risk score: ${levelWord} (${result.score}/100)`,
    "",
    `"${snippet}"`,
    "",
    "क्या यह सही है? Please reply or call me. — Sent via Suraksha Circle",
  ].join("\n");
}

/** Structured prompt for an optional LLM-powered second opinion. */
export function buildGuardPrompt(message: string): string {
  return [
    "You are Suraksha Circle's scam analyst for Indian users (Hindi/English SMS & WhatsApp).",
    "Classify the message below as SAFE, MODERATE or HIGH risk.",
    "List the scam vectors used (OTP, KYC, lottery, electricity cut-off, digital arrest, UPI fee, courier, urgency).",
    "Give one-line advice in very simple words for a senior citizen.",
    `MESSAGE: """${message}"""`,
  ].join("\n");
}
