import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // Read raw body as buffer
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const bodyBuffer = Buffer.concat(buffers);

    // Parse multipart to separate PDF bytes and password
    const contentType = req.headers['content-type'] || '';
    let fileBuffer, password = '';

    if (contentType.includes('multipart/form-data')) {
      // Use busboy to parse multipart
      const busboy = require('busboy');
      const bb = busboy({ headers: req.headers });
      const fields = {};
      const fileParts = [];

      await new Promise((resolve, reject) => {
        bb.on('file', (name, stream) => {
          stream.on('data', d => fileParts.push(d));
          stream.on('end', () => {});
        });
        bb.on('field', (name, val) => { fields[name] = val; });
        bb.on('finish', resolve);
        bb.on('error', reject);
        bb.end(bodyBuffer);
      });

      fileBuffer = Buffer.concat(fileParts);
      password = fields.password || '';
    } else {
      // Legacy: raw PDF body (no password support)
      fileBuffer = bodyBuffer;
    }

    // ✅ Pass password to pdf-parse if provided
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
    // ✅ Give a clear message if password is wrong
    const msg = err.message?.toLowerCase().includes('password')
      ? 'Wrong password or PDF is encrypted.'
      : err.message;
    res.status(500).json({ error: msg });
  }
}