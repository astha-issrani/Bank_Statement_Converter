import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ✅ API route FIRST — before static middleware
app.post('/api/convert', async (req, res) => {
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const fileBuffer = Buffer.concat(buffers);
    console.log('📄 File buffer size:', fileBuffer.length);

    const parser = new PDFParse({ data: fileBuffer });
    const parsed = await parser.getText();
    const extractedText = parsed.text;
    console.log('📝 Extracted text length:', extractedText.length);

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

    console.log('🤖 Groq status:', aiResponse.status);
    const groqResult = await aiResponse.json();
    console.log('🤖 Groq result:', JSON.stringify(groqResult).slice(0, 300));

    if (groqResult.error) throw new Error('Groq error: ' + groqResult.error.message);

    const raw = groqResult.choices?.[0]?.message?.content ?? "";
    console.log('📦 Raw AI response:', raw.slice(0, 300));

    const clean = raw.replace(/```json|```/g, "").trim();
    const transactions = JSON.parse(clean);

    res.status(200).json({ transactions });

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Static files AFTER API routes
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Running at http://localhost:${PORT}`));