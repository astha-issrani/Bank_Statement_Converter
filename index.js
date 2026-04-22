let selectedFile = null;
let transactions = [];

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('active');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') setFile(f);
  else alert('Please upload a PDF file.');
}

function handleFileInput(input) {
  if (input.files[0]) setFile(input.files[0]);
}

function setFile(f) {
  selectedFile = f;
  document.getElementById('drop-icon').textContent = '📄';
  document.getElementById('drop-title').textContent = f.name;
  document.getElementById('drop-hint').textContent = (f.size / 1024).toFixed(1) + ' KB · Click to change';
  const chip = document.getElementById('file-name-chip');
  document.getElementById('file-name-text').textContent = f.name;
  chip.style.display = 'inline-flex';
  document.getElementById('convertBtn').disabled = false;
}

function setStatus(type, message) {
  const bar = document.getElementById('status-bar');
  const icon = document.getElementById('status-icon');
  const text = document.getElementById('status-text');
  bar.classList.add('show');
  text.textContent = message;
  text.style.color = type === 'error' ? '#FF4D6D' : type === 'done' ? '#00FF94' : '#E0E8F0';
  if (type === 'loading') {
    icon.className = 'spinner';
    icon.style.background = '';
  } else {
    icon.className = 'dot-pulse';
    icon.style.background = type === 'error' ? '#FF4D6D' : '#00FF94';
    icon.style.boxShadow = '0 0 8px ' + (type === 'error' ? '#FF4D6D' : '#00FF94');
  }
}

async function convert() {
  if (!selectedFile) return;
  document.getElementById('convertBtn').disabled = true;
  document.getElementById('stats-section').classList.remove('show');
  transactions = [];

  setStatus('loading', 'Reading PDF…');

  try {
    setStatus('loading', 'AI is extracting transactions…');

    const res = await fetch('/api/convert', {
      method: 'POST',
      body: selectedFile  // send PDF buffer directly
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error');
    }

    // ✅ Backend now sends { transactions: [...] } directly
    const data = await res.json();

    if (!data.transactions || !Array.isArray(data.transactions) || data.transactions.length === 0) {
      throw new Error('No transactions found in this statement.');
    }

    transactions = data.transactions;
    setStatus('done', `✓ Extracted ${transactions.length} transactions`);
    renderResults();
    document.getElementById('csvBtn').style.display = 'inline-block';
    document.getElementById('jsonBtn').style.display = 'inline-block';
    document.getElementById('resetBtn').style.display = 'inline-block';

  } catch (err) {
    setStatus('error', 'Error: ' + (err.message || 'Conversion failed'));
    document.getElementById('convertBtn').disabled = false;
  }
}

function renderResults() {
  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  const net = credits - debits;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-box">
      <div class="stat-label">Transactions</div>
      <div class="stat-value">${transactions.length}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Total Credits</div>
      <div class="stat-value" style="color:#00FF94">₹${credits.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Total Debits</div>
      <div class="stat-value" style="color:#FF4D6D">₹${debits.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Net Flow</div>
      <div class="stat-value" style="color:${net >= 0 ? '#00FF94' : '#FF4D6D'}">${net >= 0 ? '+' : ''}₹${Math.abs(net).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
    </div>
  `;

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = transactions.map(t => `
    <tr>
      <td>${t.date ?? '—'}</td>
      <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis">${t.description ?? '—'}</td>
      <td><span class="tag">${t.category ?? 'Other'}</span></td>
      <td><span class="type-badge type-${t.type}">${t.type}</span></td>
      <td class="${t.type}">${t.type === 'debit' ? '−' : '+'}${Number(t.amount).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="color:#4A5568">${t.balance != null ? Number(t.balance).toLocaleString('en-IN', {minimumFractionDigits:2}) : '—'}</td>
    </tr>
  `).join('');

  document.getElementById('stats-section').classList.add('show');
}

function downloadCSV() {
  const header = ['Date','Description','Type','Amount','Balance','Category'];
  const rows = transactions.map(t => [
    t.date,
    `"${(t.description ?? '').replace(/"/g, '""')}"`,  // ✅ escape quotes in description
    t.type,
    t.amount,
    t.balance ?? '',
    t.category ?? ''
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  triggerDownload('bank_statement.csv', csv, 'text/csv');
}

function downloadJSON() {
  triggerDownload('bank_statement.json', JSON.stringify(transactions, null, 2), 'application/json');
}

function triggerDownload(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function resetAll() {
  selectedFile = null;
  transactions = [];
  document.getElementById('drop-icon').textContent = '📂';
  document.getElementById('drop-title').textContent = 'Drop your bank statement PDF here';
  document.getElementById('drop-hint').textContent = 'or click to browse · PDF files only';
  document.getElementById('file-name-chip').style.display = 'none';
  document.getElementById('convertBtn').disabled = true;
  document.getElementById('csvBtn').style.display = 'none';
  document.getElementById('jsonBtn').style.display = 'none';
  document.getElementById('resetBtn').style.display = 'none';
  document.getElementById('status-bar').classList.remove('show');
  document.getElementById('stats-section').classList.remove('show');
  document.getElementById('fileInput').value = '';
}