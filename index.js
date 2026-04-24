let selectedFile   = null;
let transactions   = [];
let barChartInstance = null;

const CHART_COLORS = ['#00E5FF','#00FF94','#FF4D6D','#FFD700','#A78BFA','#FB923C','#60A5FA','#F472B6','#34D399','#FBBF24'];
const fmt = v => '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2 });

// ── File handling ─────────────────────────────────────────────────────────────
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
  document.getElementById('drop-icon').textContent  = '📄';
  document.getElementById('drop-title').textContent = f.name;
  document.getElementById('drop-hint').textContent  = (f.size / 1024).toFixed(1) + ' KB · Click to change';
  document.getElementById('file-name-text').textContent = f.name;
  document.getElementById('file-name-chip').style.display = 'inline-flex';
  document.getElementById('convertBtn').disabled = false;
}

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(type, message) {
  const bar  = document.getElementById('status-bar');
  const icon = document.getElementById('status-icon');
  const text = document.getElementById('status-text');
  bar.classList.add('show');
  text.textContent = message;
  text.style.color = type === 'error' ? '#FF4D6D' : type === 'done' ? '#00FF94' : '#E0E8F0';
  if (type === 'loading') {
    icon.className    = 'spinner';
    icon.style.background  = '';
    icon.style.boxShadow   = '';
  } else {
    icon.className         = 'dot-pulse';
    icon.style.background  = type === 'error' ? '#FF4D6D' : '#00FF94';
    icon.style.boxShadow   = '0 0 8px ' + (type === 'error' ? '#FF4D6D' : '#00FF94');
  }
}

// ── Convert ───────────────────────────────────────────────────────────────────
async function convert() {
  if (!selectedFile) return;
  const convertBtn = document.getElementById('convertBtn');
  convertBtn.disabled    = true;
  convertBtn.textContent = 'Processing...';
  document.getElementById('stats-section').classList.remove('show');
  document.getElementById('dashboard-section').style.display = 'none';
  transactions = [];
  setStatus('loading', 'AI is extracting transactions… this may take 15-30 seconds');
  try {
    const pw  = document.getElementById('pdfPassword')?.value?.trim();
    const url = pw ? `/api/convert?password=${encodeURIComponent(pw)}` : '/api/convert';
    const res = await fetch(url, { method: 'POST', body: selectedFile });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Server error'); }
    const data = await res.json();
    if (!data.transactions || !Array.isArray(data.transactions) || data.transactions.length === 0)
      throw new Error('No transactions found in this statement.');
    transactions = data.transactions;
    setStatus('done', `✓ Extracted ${transactions.length} transactions`);
    renderResults();
    renderDashboard();
    document.getElementById('csvBtn').style.display   = 'inline-block';
    document.getElementById('jsonBtn').style.display   = 'inline-block';
    document.getElementById('resetBtn').style.display  = 'inline-block';
  } catch (err) {
    setStatus('error', 'Error: ' + (err.message || 'Conversion failed'));
  } finally {
    convertBtn.disabled    = false;
    convertBtn.textContent = '⚡ Convert to CSV';
  }
}

// ── Render table ──────────────────────────────────────────────────────────────
function renderResults() {
  const parseAmt = v => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
  transactions = transactions.map(t => ({ ...t, type: (t.type ?? '').toLowerCase() }));
  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + parseAmt(t.amount), 0);
  const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t)  => s + parseAmt(t.amount), 0);
  const net = credits - debits;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-box"><div class="stat-label">Transactions</div><div class="stat-value">${transactions.length}</div></div>
    <div class="stat-box"><div class="stat-label">Total Credits</div><div class="stat-value" style="color:#00FF94">${fmt(credits)}</div></div>
    <div class="stat-box"><div class="stat-label">Total Debits</div><div class="stat-value" style="color:#FF4D6D">${fmt(debits)}</div></div>
    <div class="stat-box"><div class="stat-label">Net Flow</div><div class="stat-value" style="color:${net>=0?'#00FF94':'#FF4D6D'}">${net>=0?'+':'-'}${fmt(net)}</div></div>`;

  document.getElementById('table-body').innerHTML = transactions.map(t => {
    const parseAmt2 = v => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
    return `<tr>
      <td>${t.date ?? '—'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${t.description ?? '—'}</td>
      <td><span class="tag">${t.category ?? 'Other'}</span></td>
      <td><span class="type-badge type-${t.type}">${t.type}</span></td>
      <td class="${t.type}">${t.type==='debit'?'−':'+'}${fmt(parseAmt2(t.amount))}</td>
      <td style="color:#4A5568">${t.balance!=null?fmt(parseAmt2(t.balance)):'—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('stats-section').classList.add('show');
}

// ── Render dashboard ──────────────────────────────────────────────────────────
function renderDashboard() {
  const parseAmt = v => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
  const txList   = transactions.map(t => ({ ...t, type: (t.type ?? '').toLowerCase(), amount: parseAmt(t.amount) }));

  const credits    = txList.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits     = txList.filter(t => t.type === 'debit').reduce((s, t)  => s + t.amount, 0);
  const net        = credits - debits;
  const avg        = (credits + debits) / txList.length || 0;
  const maxCredit  = Math.max(0, ...txList.filter(t => t.type === 'credit').map(t => t.amount));
  const maxDebit   = Math.max(0, ...txList.filter(t => t.type === 'debit').map(t => t.amount));

  // Metric cards
  document.getElementById('m-total').textContent         = txList.length;
  document.getElementById('m-credits').textContent       = fmt(credits);
  document.getElementById('m-debits').textContent        = fmt(debits);
  document.getElementById('m-net').textContent           = (net >= 0 ? '+' : '-') + fmt(net);
  document.getElementById('m-net').style.color           = net >= 0 ? '#00FF94' : '#FF4D6D';
  document.getElementById('m-net-change').textContent    = net >= 0 ? '↑ positive' : '↓ negative';
  document.getElementById('m-net-change').className      = 'mchange ' + (net >= 0 ? 'up' : 'down');
  document.getElementById('m-avg').textContent           = fmt(avg);
  document.getElementById('m-maxcredit').textContent     = fmt(maxCredit);
  document.getElementById('m-maxdebit').textContent      = fmt(maxDebit);

  // Category totals for bar chart
  const cats = {};
  txList.forEach(t => {
    const c = t.category || 'Other';
    if (!cats[c]) cats[c] = { credit: 0, debit: 0 };
    cats[c][t.type] = (cats[c][t.type] || 0) + t.amount;
  });
  const catNames   = Object.keys(cats).sort((a, b) => (cats[b].debit + cats[b].credit) - (cats[a].debit + cats[a].credit)).slice(0, 8);
  const catCredits = catNames.map(c => Math.round(cats[c].credit || 0));
  const catDebits  = catNames.map(c => Math.round(cats[c].debit  || 0));

  // Bar chart
  if (barChartInstance) barChartInstance.destroy();
  Chart.defaults.color       = '#4A5568';
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size   = 11;
  barChartInstance = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: catNames,
      datasets: [
        { label: 'Credits', data: catCredits, backgroundColor: 'rgba(0,255,148,0.7)',  borderColor: '#00FF94', borderWidth: 1, borderRadius: 4 },
        { label: 'Debits',  data: catDebits,  backgroundColor: 'rgba(255,77,109,0.7)', borderColor: '#FF4D6D', borderWidth: 1, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#4A5568', boxWidth: 10, padding: 16 } },
        tooltip: { backgroundColor: '#0E1218', borderColor: '#1A2030', borderWidth: 1, titleColor: '#E0E8F0', bodyColor: '#4A5568',
          callbacks: { label: ctx => ' ' + fmt(ctx.raw) }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(26,32,48,0.8)' }, ticks: { color: '#4A5568' } },
        y: { grid: { color: 'rgba(26,32,48,0.8)' }, ticks: { color: '#4A5568', callback: v => '₹' + v.toLocaleString('en-IN') } }
      }
    }
  });

  // Category breakdown cards
  const debitCats = {};
  txList.filter(t => t.type === 'debit').forEach(t => {
    const c = t.category || 'Other';
    debitCats[c] = (debitCats[c] || 0) + t.amount;
  });
  const sorted   = Object.entries(debitCats).sort((a, b) => b[1] - a[1]);
  const totalDeb = sorted.reduce((s, [, v]) => s + v, 0);
  document.getElementById('cat-grid').innerHTML = sorted.map(([name, val], i) => `
    <div class="cat-item">
      <div class="cat-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
      <div class="cat-name">${name}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <div class="cat-val">${fmt(val)}</div>
        <div class="cat-pct">${Math.round(val / totalDeb * 100)}%</div>
      </div>
    </div>`).join('');

  document.getElementById('dashboard-section').style.display = 'block';
  document.getElementById('dashboard-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Downloads ─────────────────────────────────────────────────────────────────
function downloadCSV() {
  const header = ['Date','Description','Type','Amount','Balance','Category'];
  const rows   = transactions.map(t => [t.date, `"${(t.description??'').replace(/"/g,'""')}"`, t.type, t.amount, t.balance??'', t.category??'']);
  triggerDownload('bank_statement.csv', [header,...rows].map(r=>r.join(',')).join('\n'), 'text/csv');
}
function downloadJSON() {
  triggerDownload('bank_statement.json', JSON.stringify(transactions, null, 2), 'application/json');
}
function triggerDownload(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click();
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetAll() {
  selectedFile = null; transactions = [];
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
  document.getElementById('drop-icon').textContent         = '📂';
  document.getElementById('drop-title').textContent        = 'Drop your bank statement PDF here';
  document.getElementById('drop-hint').textContent         = 'or click to browse · PDF files only';
  document.getElementById('file-name-chip').style.display  = 'none';
  document.getElementById('convertBtn').disabled            = true;
  document.getElementById('csvBtn').style.display           = 'none';
  document.getElementById('jsonBtn').style.display          = 'none';
  document.getElementById('resetBtn').style.display         = 'none';
  document.getElementById('status-bar').classList.remove('show');
  document.getElementById('stats-section').classList.remove('show');
  document.getElementById('dashboard-section').style.display = 'none';
  document.getElementById('fileInput').value                = '';
}

// ── Mesh canvas ───────────────────────────────────────────────────────────────
const meshCanvas = document.getElementById('meshCanvas');
if (meshCanvas) {
  const ctx = meshCanvas.getContext('2d');
  function resizeMesh() { meshCanvas.width = meshCanvas.offsetWidth; meshCanvas.height = meshCanvas.offsetHeight; }
  resizeMesh();
  window.addEventListener('resize', resizeMesh);
  const pts = [
    { x:.15, y:.25, vx:.0005,  vy:.0004,  col:'rgba(0,229,255,0.09)' },
    { x:.85, y:.15, vx:-.0004, vy:.0006,  col:'rgba(0,255,148,0.07)' },
    { x:.5,  y:.75, vx:.0003,  vy:-.0005, col:'rgba(255,77,109,0.06)' },
    { x:.1,  y:.85, vx:.0006,  vy:-.0003, col:'rgba(0,229,255,0.06)' },
    { x:.9,  y:.55, vx:-.0005, vy:.0004,  col:'rgba(0,255,148,0.08)' },
  ];
  function drawMesh() {
    ctx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
      const g = ctx.createRadialGradient(p.x*meshCanvas.width, p.y*meshCanvas.height, 0, p.x*meshCanvas.width, p.y*meshCanvas.height, meshCanvas.width*0.5);
      g.addColorStop(0, p.col); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, meshCanvas.width, meshCanvas.height);
    });
    requestAnimationFrame(drawMesh);
  }
  drawMesh();
}

// ── Event wiring ──────────────────────────────────────────────────────────────
const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('active'); });
dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('active'));
dropzone.addEventListener('drop',      handleDrop);
dropzone.addEventListener('click',     () => fileInput.click());
fileInput.addEventListener('change',   () => handleFileInput(fileInput));
document.getElementById('convertBtn').addEventListener('click', convert);
document.getElementById('csvBtn').addEventListener('click',     downloadCSV);
document.getElementById('jsonBtn').addEventListener('click',    downloadJSON);
document.getElementById('resetBtn').addEventListener('click',   resetAll);