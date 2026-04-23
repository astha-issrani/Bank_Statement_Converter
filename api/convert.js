import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse-new');

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // Read password from query param (?password=xxx)
    const password = new URL(req.url, 'http://localhost').searchParams.get('password') || '';

    // Read raw PDF buffer directly
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const fileBuffer = Buffer.concat(buffers);

    // Pass password to pdf-parse only if provided
    const pdfOptions = password ? { password } : {};
    const data = await pdf(fileBuffer, pdfOptions);
    const extractedText = data.text;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are a bank statement parser. Always respond with a raw JSON array only. No markdown, no explanation, no code fences."
          },
          {
            role: "user",
            content: `Extract ALL transactions from this bank statement.
Return ONLY a raw JSON array with fields: date, description, type, amount, balance, category.

Bank Statement Text:
${extractedText}`
          }
        ]
      })
    });

    const result = await aiResponse.json();
    const raw = result.choices?.[0]?.message?.content ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const transactions = JSON.parse(clean);

    res.status(200).json({ transactions });

  } catch (err) {
    const msg = err.message?.toLowerCase().includes('password')
      ? 'Wrong password or PDF is encrypted.'
      : err.message;
    res.status(500).json({ error: msg });
  }
}