import { getCompanySettings } from "./companySettings";

export async function getGeminiKey() {
  const s = await getCompanySettings();
  return (s.gemini_api_key || "").trim();
}

// Call Gemini with a system context + the user's question. Returns answer text.
export async function askGemini(question, businessContext, lang) {
  const key = await getGeminiKey();
  if (!key) throw new Error("NO_KEY");

  const langInstruction = lang === "ml"
    ? "Reply in Malayalam."
    : lang === "hi"
    ? "Reply in Hindi."
    : "Reply in the same language the user asked in (English, Malayalam, or Hindi).";

  const systemPrompt = `You are the assistant for "Minarva Biz", an ERP used by SEVENSEAS Modern Enterprises (a civil construction company in Oman). Currency is OMR (Omani Rial), shown to 3 decimals.

Answer the user's question using ONLY the business data snapshot below. If a number is asked for, compute it from the data and state it clearly. If the data does not contain the answer, say you don't have that information rather than guessing. Be concise and friendly. ${langInstruction}

${businessContext}`;

  // Try multiple model names (Google changes availability per key/region)
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash", "gemini-flash-latest"];
  let lastErr = "";
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n---\nUSER QUESTION: ${question}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
      });
    } catch (netErr) {
      lastErr = "NETWORK: " + netErr.message;
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
      if (text.trim()) return text.trim();
      lastErr = "EMPTY_RESPONSE";
      continue;
    }

    // Capture the real error text
    let errText = "";
    try { errText = await res.text(); } catch {}
    lastErr = `${res.status}: ${errText.slice(0, 300)}`;
    // If it's a bad key or permission issue, no point trying other models
    if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(errText)) throw new Error("BAD_KEY");
    if (res.status === 403) throw new Error("FORBIDDEN: " + errText.slice(0, 200));
    // 404 = model not found for this key → try next model
    // 429 = quota → try next model (some models have separate quota)
  }
  // All models failed — surface the real reason
  throw new Error("DETAIL: " + lastErr);
}
