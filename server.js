import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
console.log('✅ SERVER LOADED - Groq version');

// ─── Text Cleaner ─────────────────────────────────────────────────────────────
function cleanExtractedText(text) {
  return text
    .replace(/â‚¹/g, '₹')
    .replace(/Rs\.?/g, '₹')
    .replace(/[^\x20-\x7E\n\t₹]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .trim();
}

// ─── JSON Repair ──────────────────────────────────────────────────────────────
function repairJSON(raw) {
  raw = raw.replace(/```json|```/g, "").trim();
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    return raw.slice(arrayStart, arrayEnd + 1);
  } else if (arrayStart !== -1) {
    const partial = raw.slice(arrayStart);
    const lastComplete = partial.lastIndexOf("}");
    return lastComplete !== -1
      ? partial.slice(0, lastComplete + 1) + "]"
      : "[]";
  }
  return "[]";
}

// ─── Call Groq AI on a single chunk ──────────────────────────────────────────
async function parseChunkWithAI(chunkText) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You are an Indian bank statement parser. Always respond with a raw JSON array only. No markdown, no explanation, no code fences.
Rules:
- Amount fields must be plain numbers only, no ₹ or commas. E.g. 5000.00
- type field must be either "debit" or "credit" only
- Debit means money going out, Credit means money coming in
- date format: DD/MM/YYYY
- If you cannot fit all transactions, stop after the last COMPLETE object and close the array with ].
- If no transactions found in this chunk, return empty array: []`
        },
        {
          role: "user",
          content: `Extract ALL transactions from this bank statement chunk.
Return ONLY a raw JSON array with fields: date, description, type, amount, balance, category.

Bank Statement Text:
${chunkText}`
        }
      ]
    })
  });

  const text = await response.text();
  console.log('🤖 Groq raw response:', text.slice(0, 300));

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    console.error('❌ Groq returned non-JSON:', text.slice(0, 200));
    return [];
  }

  if (result.error) {
    throw new Error('Groq error: ' + (result.error.message || JSON.stringify(result.error)));
  }

  const raw = result.choices?.[0]?.message?.content ?? "";
  console.log('📦 Raw AI response:', raw.slice(0, 300));

  const clean = repairJSON(raw);

  try {
    return JSON.parse(clean);
  } catch {
    console.warn('⚠️ Could not parse chunk response:', clean.slice(0, 100));
    return [];
  }
}

// ─── Retry wrapper (handles Groq 429 rate limit) ──────────────────────────────
async function parseChunkWithRetry(chunkText, retries = 5, delayMs = 60000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await parseChunkWithAI(chunkText);
    } catch (err) {
      const isRateLimit =
        err.message?.includes('429') ||
        err.message?.toLowerCase().includes('rate') ||
        err.message?.toLowerCase().includes('quota');
      if (isRateLimit && attempt < retries) {
        console.log(`⏳ Rate limited. Waiting ${delayMs * attempt}ms before retry ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
}

// ─── Main Route ───────────────────────────────────────────────────────────────
app.post('/api/convert', async (req, res) => {
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const password = urlObj.searchParams.get('password') || '';
    console.log('🔑 Password received:', password || '(none)');

    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const fileBuffer = Buffer.concat(buffers);
    console.log('📄 File buffer size:', fileBuffer.length);

    const loadingTask = getDocument({
      data: new Uint8Array(fileBuffer),
      ...(password ? { password } : {})
    });
    const pdfDoc = await loadingTask.promise;

    let extractedText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      extractedText += content.items.map(item => item.str).join(' ') + '\n';
    }
    console.log('📝 Raw extracted text length:', extractedText.length);

    extractedText = cleanExtractedText(extractedText);
    console.log('🧹 Cleaned text length:', extractedText.length);
    console.log('🧹 Cleaned text sample:', extractedText.slice(0, 300));

    // Smaller chunks for 8B model — it handles less context than 70B
    const CHUNK_SIZE = 3000;
    const OVERLAP = 150;
    const chunks = [];

    if (extractedText.length <= CHUNK_SIZE) {
      chunks.push(extractedText);
    } else {
      for (let i = 0; i < extractedText.length; i += CHUNK_SIZE - OVERLAP) {
        chunks.push(extractedText.slice(i, i + CHUNK_SIZE));
        if (i + CHUNK_SIZE >= extractedText.length) break;
      }
    }
    console.log(`📦 Split into ${chunks.length} chunk(s)`);

    let allTransactions = [];
    for (let i = 0; i < chunks.length; i++) {
  console.log(`🤖 Processing chunk ${i + 1}/${chunks.length}...`);
  const txns = await parseChunkWithRetry(chunks[i]);
  console.log(`✅ Chunk ${i + 1} returned ${txns.length} transactions`);
  allTransactions = allTransactions.concat(txns);
  // Wait 62 seconds between chunks to reset the TPM limit
  if (i < chunks.length - 1) {
    console.log(`⏳ Waiting 62s before next chunk to avoid rate limit...`);
    await new Promise(r => setTimeout(r, 62000));
  }
}

    // Deduplicate by date + amount + description
    const seen = new Set();
    const deduplicated = allTransactions.filter(tx => {
      const key = `${tx.date}|${tx.amount}|${tx.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`🎯 Total: ${allTransactions.length} raw → ${deduplicated.length} after dedup`);
    if (deduplicated[0]) console.log('🔍 Sample:', JSON.stringify(deduplicated[0]));

    res.status(200).json({ transactions: deduplicated });

  } catch (err) {
    console.error('❌ Error:', err);
    const msg = err.message?.toLowerCase().includes('password')
      ? 'Wrong password or PDF is encrypted. Please enter the correct password.'
      : err.message;
    res.status(500).json({ error: msg });
  }
});

app.use(express.static(__dirname, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.includes('/api/')) res.status(403).end();
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Running at http://localhost:${PORT}`));