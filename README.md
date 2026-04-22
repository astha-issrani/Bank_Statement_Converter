# 🏦 BankParse — PDF Bank Statement Converter

> **Convert any PDF bank statement into clean, structured CSV or JSON data in seconds — powered by AI.**

🔗 **Live Demo:** [https://bank-statement-converter-697q.onrender.com/](https://bank-statement-converter-697q.onrender.com/)

---

## ✨ Features

- 📂 **Drag & Drop Upload** — Simply drop your PDF bank statement
- 🤖 **AI-Powered Extraction** — Uses Groq's LLaMA 3.3 70B to read and parse every transaction intelligently
- 🏷️ **Auto Categorization** — Every transaction is tagged automatically (Food, Transport, Salary, EMI, ATM, etc.)
- 📊 **Live Preview** — See all transactions in a clean table before downloading
- ⬇️ **CSV & JSON Export** — Download data ready for Excel, Google Sheets, Tally, or any accounting tool
- 🔒 **Privacy First** — Your PDF is never stored. Processing happens in real-time
- 🏦 **Works with Any Bank** — HDFC, SBI, ICICI, Axis, Kotak, PNB, and more

---

## 🖥️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Node.js + Express |
| PDF Parsing | `pdf-parse` |
| AI Model | Groq API — LLaMA 3.3 70B |
| Deployment | Render |

---

## 🚀 Getting Started Locally

### 1. Clone the repo
```bash
git clone https://github.com/astha-issrani/Bank_Statement_Converter.git
cd Bank_Statement_Converter
```

### 2. Install dependencies
```bash
npm install
```

### 3. Add your Groq API key
Create a `.env` file in the root:
```
GROQ_API_KEY=your_groq_api_key_here
```
Get your free key at [console.groq.com](https://console.groq.com)

### 4. Start the server
```bash
node --env-file=.env server.js
```

### 5. Open in browser
```
http://localhost:3000
```

---

## 📁 Project Structure

```
Bank_Statement_Converter/
├── server.js          # Express server + PDF parsing + Groq AI call
├── index.html         # Frontend UI
├── index.js           # Frontend logic (upload, fetch, render, download)
├── index.css          # Styles
├── .env               # API keys (never commit this)
├── .gitignore
└── package.json
```

---

## 🔄 How It Works

```
User uploads PDF
      ↓
Express server receives the file buffer
      ↓
pdf-parse extracts raw text from the PDF
      ↓
Text is sent to Groq API (LLaMA 3.3 70B)
      ↓
AI returns structured JSON array of transactions
      ↓
Frontend renders table + enables CSV/JSON download
```

---

## 📸 Screenshot

> Upload any bank statement PDF → Get clean transaction data instantly

| Field | Description |
|-------|-------------|
| `date` | Transaction date |
| `description` | Transaction narration |
| `type` | `credit` or `debit` |
| `amount` | Transaction amount (₹) |
| `balance` | Closing balance (₹) |
| `category` | Auto-tagged category |

---

## ⚙️ Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Your Groq API key from [console.groq.com](https://console.groq.com) |
| `PORT` | Port to run the server (default: 3000) |

---

## 🛠️ Challenges Solved

- **ESM compatibility** with `pdf-parse` — solved using `createRequire`
- **Groq returning markdown-wrapped JSON** — stripped code fences before parsing
- **Express route ordering** — API routes registered before static file middleware
- **Model deprecation** — migrated from `llama3-70b-8192` to `llama-3.3-70b-versatile`

---

## 🔮 Future Improvements

- [ ] Add spending analytics and charts
- [ ] Support Excel/CSV statement uploads
- [ ] Multi-page statement support with pagination
- [ ] Connect to accounting tools (Tally, QuickBooks)
- [ ] User authentication and transaction history

---

## 📄 License

MIT License — free to use and modify.

---

Built with ❤️ by [Astha Issrani](https://github.com/astha-issrani)