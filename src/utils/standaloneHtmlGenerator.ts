import { DairyAppState } from '../types/dairy';
import { createInitialEmptyState } from './storage';

/**
 * Generates a 100% self-contained single-file HTML application ("Ujalaa_Dairy_Complete_App.html")
 * with complete HTML, CSS, and JavaScript so the user can save or copy a single HTML file
 * that runs directly on Android mobile or desktop browsers.
 * Includes all updated features:
 * 1. Live Rate & Amount Preview in Milk Collection
 * 2. Auto-Decimal System for FAT (51 -> 5.1) and SNF (85 -> 8.5) with automatic cursor advance
 * 3. Smart Auto-Entry for Milk Quantity (5 then 258 -> 5.258)
 * 4. Cow/Buffalo classification by FAT (<=5.0 Cow, >5.0 Buffalo) + manual override
 * 5. Compact Live Dashboard & Current Farmer Preview above mobile keyboard
 * 6. Immediate Saved Entry List with Farmer/Date/Shift/MilkType filters, Edit/Delete, and Total Farmers summary
 * 7. 3-Option Excel Rate Chart Import (Auto-Detect, Manual Column Selection, and Format A/B/C) with Preview
 */
export function generateStandaloneHtmlApp(
  currentState?: DairyAppState,
  includeCurrentData = false
): string {
  const seedState =
    includeCurrentData && currentState ? currentState : createInitialEmptyState();
  const serializedSeed = JSON.stringify(seedState).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <title>Ujalaa Dairy — संपूर्ण डेयरी प्रबंधन एवं हिसाब ऐप</title>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>
    :root {
      --blue-950: #0f172a;
      --blue-900: #1e3a8a;
      --blue-700: #1d4ed8;
      --blue-600: #2563eb;
      --blue-100: #dbeafe;
      --blue-50: #eff6ff;
      --slate-50: #f8fafc;
      --slate-100: #f1f5f9;
      --slate-200: #e2e8f0;
      --slate-600: #475569;
      --slate-800: #1e293b;
      --green-600: #16a34a;
      --amber-600: #d97706;
      --red-600: #dc2626;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans Devanagari', system-ui, -apple-system, sans-serif;
      background: var(--slate-50);
      color: var(--slate-800);
      padding-bottom: 84px;
      line-height: 1.5;
    }
    .num { font-variant-numeric: tabular-nums; }
    header {
      background: var(--blue-700);
      color: #fff;
      padding: 10px 14px;
      position: sticky;
      top: 0;
      z-index: 40;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    }
    header h1 { font-size: 1.15rem; font-weight: 700; }
    .container { max-width: 1140px; margin: 0 auto; padding: 12px; }
    .card {
      background: #fff;
      border: 1px solid var(--slate-200);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; }
    .row-compact-2 { display: grid; grid-template-columns: 7fr 5fr; gap: 6px; }
    .row-compact-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .row-compact-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .stat-box {
      background: var(--blue-50);
      border: 1px solid var(--blue-100);
      border-radius: 10px;
      padding: 10px;
    }
    .stat-label { font-size: 0.74rem; color: var(--slate-600); }
    .stat-val { font-size: 1.1rem; font-weight: 700; color: var(--blue-900); margin-top: 2px; }
    label { display: block; font-size: 0.72rem; font-weight: 700; margin-bottom: 2px; color: var(--slate-800); }
    input, select, textarea {
      width: 100%;
      padding: 7px 9px;
      border: 1px solid var(--slate-200);
      border-radius: 8px;
      font-size: 0.9rem;
      margin-bottom: 6px;
      background: #fff;
    }
    button {
      cursor: pointer;
      border: none;
      border-radius: 9px;
      padding: 9px 14px;
      font-size: 0.86rem;
      font-weight: 700;
      min-height: 42px;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.92; }
    .btn-primary { background: var(--blue-600); color: #fff; }
    .btn-success { background: var(--green-600); color: #fff; }
    .btn-secondary { background: var(--slate-100); color: var(--slate-800); border: 1px solid var(--slate-200); }
    .btn-danger { background: #fee2e2; color: var(--red-600); }
    .btn-sm { min-height: 32px; padding: 5px 9px; font-size: 0.76rem; }
    .live-kb-bar {
      background: var(--blue-950);
      color: #fff;
      border: 2px solid var(--blue-600);
      border-radius: 14px;
      padding: 10px 12px;
      margin-bottom: 12px;
      position: sticky;
      top: 54px;
      z-index: 30;
    }
    .live-kb-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      text-align: center;
      margin-top: 6px;
    }
    .live-kb-cell {
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 6px 4px;
    }
    .live-kb-cell span { display: block; font-size: 0.68rem; color: #94a3b8; }
    .live-kb-cell strong { font-size: 0.85rem; color: #fff; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { padding: 8px 9px; border-bottom: 1px solid var(--slate-200); text-align: left; white-space: nowrap; }
    th { background: var(--blue-50); color: var(--blue-900); font-weight: 700; }
    tfoot td { background: var(--slate-100); font-weight: 700; }
    .bottom-nav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: #fff;
      border-top: 1px solid var(--slate-200);
      display: flex;
      overflow-x: auto;
      z-index: 50;
    }
    .bottom-nav button {
      flex: 1;
      min-width: 70px;
      border-radius: 0;
      background: transparent;
      color: var(--slate-600);
      font-size: 0.74rem;
      padding: 8px 4px;
    }
    .bottom-nav button.active {
      color: var(--blue-600);
      border-top: 3px solid var(--blue-600);
      background: var(--blue-50);
    }
    .alert { padding: 10px 12px; border-radius: 9px; margin-bottom: 10px; font-size: 0.82rem; }
    .alert-warn { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .alert-info { background: var(--blue-50); color: var(--blue-900); border: 1px solid var(--blue-100); }
    @media print { .no-print, .bottom-nav, header { display: none !important; } body { padding: 0; background: #fff; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1 id="hdrTitle">Ujalaa Dairy</h1>
    </div>
    <div style="display:flex;gap:6px;align-items:center;">
      <input type="date" id="globalDate" style="margin:0;padding:5px 8px;width:auto;font-size:0.8rem;" />
      <select id="globalShift" style="margin:0;padding:5px 8px;width:auto;font-size:0.8rem;">
        <option value="morning">सुबह (Morning)</option>
        <option value="evening">शाम (Evening)</option>
      </select>
      <button class="btn-secondary btn-sm" onclick="toggleLang()" id="langBtn">EN / हिं</button>
    </div>
  </header>

  <main class="container" id="appRoot"></main>
  <nav class="bottom-nav no-print" id="bottomNav"></nav>

  <script>
    const STORAGE_KEY = 'ujalaa_dairy_state_v1';
    const INITIAL_SEED = ${serializedSeed};
    let state = loadState();
    let activeTab = 'collection';
    let editingColId = null;
    let prevFatVal = '';
    let prevSnfVal = '';
    let prevLitersVal = '';
    let colMilkOverride = 'auto';

    // Filters for saved collection list
    let filterDate = state.selectedDate;
    let filterShift = 'current';
    let filterMilk = 'all';
    let filterSearch = '';

    // Excel import state (3 options)
    let excelMode = 'auto_detect';
    let manualFatCol = 0, manualSnfCol = 1, manualRateCol = 2;
    let pendingExcelPreview = null;

    function getTodayStr() {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
    function getAutoShift() {
      return new Date().getHours() < 12 ? 'morning' : 'evening';
    }
    function loadState() {
      let loaded = JSON.parse(JSON.stringify(INITIAL_SEED));
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = Object.assign({}, INITIAL_SEED, JSON.parse(raw));
      } catch (e) {}
      loaded.selectedDate = getTodayStr();
      loaded.selectedShift = getAutoShift();
      return loaded;
    }
    function saveState() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      render();
    }
    function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
    function round3(n) { return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; }
    function fmtCur(n) { return (n === null || n === undefined || !Number.isFinite(n)) ? '—' : '₹' + Number(n).toFixed(2); }
    function fmtNum(n, d=2) { return (n === null || n === undefined || !Number.isFinite(n)) ? '—' : Number(n).toFixed(d); }
    function classifyMilk(fat) { return Number(fat) <= 5.0 ? 'cow' : 'buffalo'; }
    function makeKey(fat, snf) { return round2(fat).toFixed(2) + '_' + round2(snf).toFixed(2); }

    function lookupRate(type, fat, snf) {
      const chart = state.rateCharts[type];
      if (!chart || !chart.rates) return { found: false, rate: null, msg: 'पहले ' + (type === 'cow' ? 'गाय' : 'भैंस') + ' का रेट चार्ट इंपोर्ट करें।' };
      const r = chart.rates[makeKey(fat, snf)];
      if (r !== undefined && r > 0) return { found: true, rate: round2(r), msg: null };
      return { found: false, rate: null, msg: 'रेट चार्ट में FAT ' + fat + ' और SNF ' + snf + ' का सटीक रेट उपलब्ध नहीं है।' };
    }

    // Auto-Decimal for FAT & SNF: "51" -> "5.1", "85" -> "8.5"
    function formatAutoDecimalFatSnf(newRaw, prevVal) {
      const cleaned = String(newRaw || '').replace(/[^0-9.]/g, '');
      if (!cleaned) return { value: '', completed: false };
      if (String(newRaw).length < String(prevVal || '').length) {
        if (cleaned.endsWith('.')) return { value: cleaned.slice(0, -1), completed: false };
        return { value: cleaned, completed: false };
      }
      if (cleaned.includes('.')) {
        const parts = cleaned.split('.');
        const intP = parts[0].slice(0, 2);
        const decP = parts.slice(1).join('').slice(0, 2);
        return { value: intP + '.' + decP, completed: intP.length >= 1 && decP.length === 1 };
      }
      if (cleaned.length === 1) return { value: cleaned, completed: false };
      if (cleaned.length === 2) return { value: cleaned[0] + '.' + cleaned[1], completed: true };
      return { value: cleaned[0] + '.' + cleaned.slice(1, 3), completed: true };
    }

    // Smart Auto-Entry for Quantity: "5" then "258" -> "5.258"
    function formatSmartMilkQuantity(newRaw, prevVal) {
      const cleaned = String(newRaw || '').replace(/[^0-9.]/g, '');
      if (!cleaned) return { value: '', completed: false };
      if (String(newRaw).length < String(prevVal || '').length) {
        if (cleaned.endsWith('.')) return { value: cleaned.slice(0, -1), completed: false };
        return { value: cleaned, completed: false };
      }
      if (cleaned.includes('.')) {
        const parts = cleaned.split('.');
        const intP = parts[0] || '0';
        const decP = parts.slice(1).join('').slice(0, 3);
        return { value: intP + '.' + decP, completed: decP.length === 3 };
      }
      if (cleaned.length <= 1) return { value: cleaned, completed: false };
      const intP = cleaned.slice(0, 1);
      const decP = cleaned.slice(1, 4);
      return { value: intP + '.' + decP, completed: decP.length === 3 };
    }

    function calcColSummary(list) {
      if (!list.length) return { count: 0, farmers: 0, liters: 0, amount: 0, avgFat: null, avgSnf: null, avgRate: null };
      let liters = 0, amount = 0, wFat = 0, wSnf = 0;
      const fSet = new Set();
      list.forEach(e => {
        const l = Number(e.liters)||0;
        if (e.farmerId) fSet.add(e.farmerId);
        liters += l; amount += Number(e.totalAmount)||0;
        wFat += l * (Number(e.fat)||0); wSnf += l * (Number(e.snf)||0);
      });
      liters = round3(liters); amount = round2(amount);
      if (liters <= 0) return { count: list.length, farmers: fSet.size, liters: 0, amount, avgFat: null, avgSnf: null, avgRate: null };
      return { count: list.length, farmers: fSet.size, liters, amount, avgFat: round2(wFat/liters), avgSnf: round2(wSnf/liters), avgRate: round2(amount/liters) };
    }

    function toggleLang() {
      state.language = state.language === 'hi' ? 'en' : 'hi';
      saveState();
    }

    document.getElementById('globalDate').value = state.selectedDate;
    document.getElementById('globalShift').value = state.selectedShift;
    document.getElementById('globalDate').addEventListener('change', (e) => {
      state.selectedDate = e.target.value;
      filterDate = e.target.value;
      saveState();
    });
    document.getElementById('globalShift').addEventListener('change', (e) => {
      state.selectedShift = e.target.value;
      saveState();
    });

    const TABS = [
      { id: 'dashboard', hi: 'डैशबोर्ड', en: 'Dashboard' },
      { id: 'collection', hi: 'कलेक्शन', en: 'Collection' },
      { id: 'ratechart', hi: 'रेट चार्ट (Excel)', en: 'Rate Chart' },
      { id: 'farmers', hi: 'किसान', en: 'Farmers' },
      { id: 'sales', hi: 'थोक बिक्री', en: 'Sales' },
      { id: 'ledger', hi: 'खाता/बिल', en: 'Ledger' },
      { id: 'backup', hi: 'बैकअप', en: 'Backup' }
    ];

    function renderNav() {
      const nav = document.getElementById('bottomNav');
      nav.innerHTML = TABS.map(t =>
        '<button class="' + (activeTab === t.id ? 'active' : '') + '" onclick="activeTab=\\'' + t.id + '\\';render();">' +
        (state.language === 'hi' ? t.hi : t.en) + '</button>'
      ).join('');
    }

    function render() {
      document.getElementById('hdrTitle').textContent = state.dairyName || 'Ujalaa Dairy';
      renderNav();
      const root = document.getElementById('appRoot');
      if (activeTab === 'dashboard') root.innerHTML = renderDashboard();
      else if (activeTab === 'collection') root.innerHTML = renderCollection();
      else if (activeTab === 'ratechart') root.innerHTML = renderRateChart();
      else if (activeTab === 'farmers') root.innerHTML = renderFarmers();
      else if (activeTab === 'sales') root.innerHTML = renderSales();
      else if (activeTab === 'ledger') root.innerHTML = renderLedger();
      else if (activeTab === 'backup') root.innerHTML = renderBackup();
    }

    function renderDashboard() {
      const d = state.selectedDate;
      const dayCols = state.collections.filter(c => c.date === d);
      const daySum = calcColSummary(dayCols);
      const mornSum = calcColSummary(dayCols.filter(c => c.shift === 'morning'));
      const eveSum = calcColSummary(dayCols.filter(c => c.shift === 'evening'));
      return '<div class="card"><h3>आज का सारांश (' + d + ')</h3><div class="grid-4" style="margin-top:10px;">' +
        '<div class="stat-box"><div class="stat-label">आज का कुल दूध</div><div class="stat-val num">' + fmtNum(daySum.liters,3) + ' L</div></div>' +
        '<div class="stat-box"><div class="stat-label">आज की कुल रकम</div><div class="stat-val num">' + fmtCur(daySum.amount) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">औसत FAT / SNF</div><div class="stat-val num">' + fmtNum(daySum.avgFat) + ' / ' + fmtNum(daySum.avgSnf) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">कुल किसान</div><div class="stat-val num">' + daySum.farmers + '</div></div>' +
        '</div></div>' +
        '<div class="grid-2">' +
        '<div class="card"><h4>सुबह की शिफ्ट (Morning)</h4><p class="num">किसान: ' + mornSum.farmers + ' | दूध: ' + fmtNum(mornSum.liters,3) + ' L | रकम: ' + fmtCur(mornSum.amount) + '</p></div>' +
        '<div class="card"><h4>शाम की शिफ्ट (Evening)</h4><p class="num">किसान: ' + eveSum.farmers + ' | दूध: ' + fmtNum(eveSum.liters,3) + ' L | रकम: ' + fmtCur(eveSum.amount) + '</p></div>' +
        '</div>';
    }

    function renderCollection() {
      const d = state.selectedDate, s = state.selectedShift;
      const todaySaved = calcColSummary(state.collections.filter(c => c.date === d));
      const opts = state.farmers.filter(f => f.active).map(f => '<option value="'+f.id+'">'+f.code+' - '+f.name+'</option>').join('');

      const filteredList = state.collections.filter(c => {
        if (filterDate && c.date !== filterDate) return false;
        if (filterShift === 'current' && c.shift !== s) return false;
        if (filterShift === 'morning' && c.shift !== 'morning') return false;
        if (filterShift === 'evening' && c.shift !== 'evening') return false;
        if (filterMilk !== 'all' && c.milkType !== filterMilk) return false;
        if (filterSearch && !(c.farmerName.toLowerCase().includes(filterSearch.toLowerCase()) || c.farmerCode.toLowerCase().includes(filterSearch.toLowerCase()))) return false;
        return true;
      });
      const sum = calcColSummary(filteredList);

      return '<div class="card" style="padding:10px;border:2px solid var(--blue-600);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.74rem;margin-bottom:6px;">' +
        '<b>' + (editingColId ? 'दूध एंट्री एडिट' : 'दूध कलेक्शन (' + d + ' · ' + (s==='morning'?'सुबह':'शाम') + ')') + '</b>' +
        '<span class="num">आज कुल: <b>' + fmtNum(todaySaved.liters,2) + 'L</b> | <b>' + fmtCur(todaySaved.amount) + '</b></span></div>' +
        '<div id="liveColPreview" style="margin-bottom:8px;padding:7px 9px;border-radius:8px;background:var(--blue-950);color:#fff;font-size:0.78rem;">वर्तमान किसान प्रीव्यू: किसान, FAT, SNF और मात्रा भरें...</div>' +
        '<div class="row-compact-2">' +
        '<div><label>किसान का नाम</label><select id="colFarmer" onchange="updateLiveCol()"><option value="">-- किसान चुनें --</option>' + opts + '</select></div>' +
        '<div><label>प्रकार</label><select id="colMilkType" onchange="colMilkOverride=this.value;updateLiveCol()"><option value="auto">ऑटो (FAT अनुसार)</option><option value="cow">गाय (Cow)</option><option value="buffalo">भैंस (Buffalo)</option></select></div>' +
        '</div>' +
        '<div class="row-compact-3">' +
        '<div><label>1. FAT (51→5.1)</label><input type="text" inputmode="decimal" id="colFat" placeholder="5.1" oninput="onFatInput(this)" /></div>' +
        '<div><label>2. SNF (85→8.5)</label><input type="text" inputmode="decimal" id="colSnf" placeholder="8.5" oninput="onSnfInput(this)" /></div>' +
        '<div><label>3. मात्रा L (5258→5.258)</label><input type="text" inputmode="decimal" id="colLiters" placeholder="5.258" oninput="onLitersInput(this)" /></div>' +
        '</div>' +
        '<button class="btn-primary" style="width:100%;" id="colSaveBtn" onclick="saveColEntry()">' + (editingColId ? 'बदलाव अपडेट करें' : 'दूध एंट्री सेव करें') + '</button>' +
        (editingColId ? ' <button class="btn-secondary" style="margin-top:4px;width:100%;" onclick="cancelEditCol()">रद्द करें</button>' : '') +
        '</div>' +
        '<div class="card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
        '<h4>सेव की गई दूध कलेक्शन लिस्ट</h4>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<input type="date" value="' + filterDate + '" onchange="filterDate=this.value;render()" style="width:auto;margin:0;padding:5px 8px;font-size:0.78rem;" />' +
        '<select onchange="filterShift=this.value;render()" style="width:auto;margin:0;padding:5px 8px;font-size:0.78rem;"><option value="current" '+(filterShift==='current'?'selected':'')+'>वर्तमान शिफ्ट</option><option value="all" '+(filterShift==='all'?'selected':'')+'>दोनों शिफ्ट</option><option value="morning" '+(filterShift==='morning'?'selected':'')+'>सुबह</option><option value="evening" '+(filterShift==='evening'?'selected':'')+'>शाम</option></select>' +
        '<select onchange="filterMilk=this.value;render()" style="width:auto;margin:0;padding:5px 8px;font-size:0.78rem;"><option value="all" '+(filterMilk==='all'?'selected':'')+'>गाय + भैंस</option><option value="cow" '+(filterMilk==='cow'?'selected':'')+'>गाय</option><option value="buffalo" '+(filterMilk==='buffalo'?'selected':'')+'>भैंस</option></select>' +
        '<input type="text" placeholder="किसान खोजें..." value="' + filterSearch + '" oninput="filterSearch=this.value;render()" style="width:140px;margin:0;padding:5px 8px;font-size:0.78rem;" />' +
        '</div></div>' +
        '<div class="table-wrap"><table><thead><tr><th>#</th><th>तारीख</th><th>किसान का नाम</th><th>सुबह/शाम</th><th>प्रकार</th><th>मात्रा (L)</th><th>FAT</th><th>SNF</th><th>रेट/L</th><th>कुल रकम</th><th>एडिट/डिलीट</th></tr></thead><tbody>' +
        (filteredList.map((c,i) => '<tr><td>'+(i+1)+'</td><td>'+c.date+'</td><td><b>'+c.farmerCode+' - '+c.farmerName+'</b></td><td>'+(c.shift==='morning'?'सुबह':'शाम')+'</td><td>'+(c.milkType==='cow'?'गाय':'भैंस')+'</td><td class="num">'+fmtNum(c.liters,3)+'</td><td class="num">'+fmtNum(c.fat,1)+'</td><td class="num">'+fmtNum(c.snf,1)+'</td><td class="num">'+fmtCur(c.rate)+'</td><td class="num"><b>'+fmtCur(c.totalAmount)+'</b></td><td><button class="btn-secondary btn-sm" onclick="editCol(\\''+c.id+'\\')">एडिट</button> <button class="btn-danger btn-sm" onclick="delCol(\\''+c.id+'\\')">डिलीट</button></td></tr>').join('') || '<tr><td colspan="11">अभी कोई रिकॉर्ड नहीं है</td></tr>') +
        '</tbody><tfoot><tr><td colspan="5">कुल किसान: ' + sum.farmers + ' (एंट्री: ' + sum.count + ')</td><td class="num">' + fmtNum(sum.liters,3) + ' L</td><td class="num">' + fmtNum(sum.avgFat) + '</td><td class="num">' + fmtNum(sum.avgSnf) + '</td><td class="num">' + fmtCur(sum.avgRate) + '</td><td class="num">' + fmtCur(sum.amount) + '</td><td></td></tr></tfoot></table></div></div>';
    }

    function onFatInput(el) {
      const res = formatAutoDecimalFatSnf(el.value, prevFatVal);
      el.value = res.value;
      prevFatVal = res.value;
      updateLiveCol();
      if (res.completed) {
        const snfEl = document.getElementById('colSnf');
        if (snfEl) { snfEl.focus(); snfEl.select(); }
      }
    }
    function onSnfInput(el) {
      const res = formatAutoDecimalFatSnf(el.value, prevSnfVal);
      el.value = res.value;
      prevSnfVal = res.value;
      updateLiveCol();
      if (res.completed) {
        const litEl = document.getElementById('colLiters');
        if (litEl) { litEl.focus(); litEl.select(); }
      }
    }
    function onLitersInput(el) {
      const res = formatSmartMilkQuantity(el.value, prevLitersVal);
      el.value = res.value;
      prevLitersVal = res.value;
      updateLiveCol();
      if (res.completed) {
        const btn = document.getElementById('colSaveBtn');
        if (btn) btn.focus();
      }
    }

    function updateLiveCol() {
      const fId = document.getElementById('colFarmer')?.value || '';
      const farmer = state.farmers.find(x => x.id === fId);
      const l = parseFloat(document.getElementById('colLiters')?.value);
      const f = parseFloat(document.getElementById('colFat')?.value);
      const s = parseFloat(document.getElementById('colSnf')?.value);
      const box = document.getElementById('liveColPreview');
      if (!box) return;
      const fName = farmer ? (farmer.code + ' - ' + farmer.name) : 'किसान अनचयनित';
      const shiftLabel = state.selectedShift === 'morning' ? 'सुबह' : 'शाम';
      if (!Number.isFinite(f) || f <= 0) {
        box.textContent = 'किसान: ' + fName + ' (' + shiftLabel + ') | कृपया FAT और SNF दर्ज करें।';
        return;
      }
      const mType = colMilkOverride !== 'auto' ? colMilkOverride : classifyMilk(f);
      const typeLabel = mType === 'cow' ? 'गाय (Cow)' : 'भैंस (Buffalo)';
      if (!Number.isFinite(s) || s <= 0) {
        box.textContent = 'किसान: ' + fName + ' | प्रकार: ' + typeLabel + ' | FAT: ' + f.toFixed(1) + ' | कृपया SNF भरें।';
        return;
      }
      const lk = lookupRate(mType, f, s);
      if (!lk.found) {
        box.textContent = 'किसान: ' + fName + ' | प्रकार: ' + typeLabel + ' | ' + lk.msg;
        return;
      }
      const amt = Number.isFinite(l) && l > 0 ? round2(l * lk.rate) : 0;
      box.innerHTML = '<b>' + fName + '</b> (' + typeLabel + ') — मात्रा: <b>' + (Number.isFinite(l)?l.toFixed(3):'0.000') + 'L</b> | FAT: <b>' + f.toFixed(1) + '</b> | SNF: <b>' + s.toFixed(1) + '</b> | रेट: <b style="color:#fcd34d;">₹' + lk.rate.toFixed(2) + '</b> | कुल रकम: <b style="color:#4ade80;">₹' + amt.toFixed(2) + '</b>';
    }

    function saveColEntry() {
      const fId = document.getElementById('colFarmer').value;
      const farmer = state.farmers.find(x => x.id === fId);
      const l = parseFloat(document.getElementById('colLiters').value);
      const f = parseFloat(document.getElementById('colFat').value);
      const s = parseFloat(document.getElementById('colSnf').value);
      if (!farmer || !Number.isFinite(l) || l <= 0 || !Number.isFinite(f) || !Number.isFinite(s)) {
        alert('कृपया किसान, मात्रा, FAT और SNF सही भरें।'); return;
      }
      const mType = colMilkOverride !== 'auto' ? colMilkOverride : classifyMilk(f);
      const lk = lookupRate(mType, f, s);
      if (!lk.found) { alert(lk.msg); return; }
      const amt = round2(l * lk.rate);

      if (!editingColId) {
        const dup = state.collections.find(c => c.date === state.selectedDate && c.shift === state.selectedShift && c.farmerId === farmer.id && Math.abs(c.liters - l) < 0.001 && Math.abs(c.fat - f) < 0.01 && Math.abs(c.snf - s) < 0.01);
        if (dup && !confirm('इसी किसान और मात्रा की एंट्री पहले से मौजूद है। क्या फिर भी सेव करें?')) return;
      }

      const payload = {
        id: editingColId || ('col_' + Date.now()),
        date: state.selectedDate,
        time: new Date().toTimeString().slice(0,8),
        shift: state.selectedShift,
        farmerId: farmer.id,
        farmerName: farmer.name,
        farmerCode: farmer.code,
        milkType: mType,
        liters: round3(l),
        fat: round2(f),
        snf: round2(s),
        rate: lk.rate,
        totalAmount: amt,
        deduction: 0,
        netPayable: amt,
        notes: '',
        createdAt: new Date().toISOString()
      };

      if (editingColId) {
        state.collections = state.collections.map(c => c.id === editingColId ? payload : c);
        editingColId = null;
      } else {
        state.collections.push(payload);
      }
      prevFatVal = ''; prevSnfVal = ''; prevLitersVal = '';
      saveState();
    }

    function editCol(id) {
      const item = state.collections.find(c => c.id === id);
      if (!item) return;
      editingColId = item.id;
      state.selectedDate = item.date;
      state.selectedShift = item.shift;
      render();
      document.getElementById('colFarmer').value = item.farmerId;
      document.getElementById('colFat').value = item.fat;
      document.getElementById('colSnf').value = item.snf;
      document.getElementById('colLiters').value = item.liters;
      prevFatVal = String(item.fat);
      prevSnfVal = String(item.snf);
      prevLitersVal = String(item.liters);
      updateLiveCol();
    }
    function cancelEditCol() { editingColId = null; render(); }
    function delCol(id) {
      if (!confirm('क्या आप इस दूध एंट्री को हटाना चाहते हैं?')) return;
      state.collections = state.collections.filter(c => c.id !== id);
      saveState();
    }

    function renderRateChart() {
      const cowInfo = state.rateCharts.cow ? ('उपलब्ध (' + Object.keys(state.rateCharts.cow.rates).length + ' रेट)') : 'इंपोर्ट नहीं हुआ';
      const bufInfo = state.rateCharts.buffalo ? ('उपलब्ध (' + Object.keys(state.rateCharts.buffalo.rates).length + ' रेट)') : 'इंपोर्ट नहीं हुआ';
      return '<div class="card"><h3>Excel रेट चार्ट इंपोर्ट (3 आसान विकल्प — .xlsx / .xls / .csv)</h3>' +
        '<p style="margin:6px 0 12px;font-size:0.84rem;">गाय का रेट चार्ट: <b>' + cowInfo + '</b> | भैंस का रेट चार्ट: <b>' + bufInfo + '</b></p>' +
        '<div class="grid-3" style="margin-bottom:12px;">' +
        '<button class="'+(excelMode==='auto_detect'?'btn-primary':'btn-secondary')+'" onclick="excelMode=\\'auto_detect\\';render()">विकल्प 1: ऑटो डिटेक्ट (Auto Detect)</button>' +
        '<button class="'+(excelMode==='manual_columns'?'btn-primary':'btn-secondary')+'" onclick="excelMode=\\'manual_columns\\';render()">विकल्प 2: कॉलम मैन्युअल चुनें</button>' +
        '<button class="'+(excelMode==='format_a'||excelMode==='format_b'?'btn-primary':'btn-secondary')+'" onclick="excelMode=\\'format_a\\';render()">विकल्प 3: फॉर्मेट A (FAT-SNF) / B (SNF-FAT)</button>' +
        '</div>' +
        (excelMode === 'format_a' || excelMode === 'format_b' ? '<div style="margin-bottom:12px;display:flex;gap:8px;"><button class="btn-secondary btn-sm" onclick="excelMode=\\'format_a\\';manualFatCol=0;manualSnfCol=1;manualRateCol=2;render()">फॉर्मेट A: FAT पहले, SNF बाद में</button><button class="btn-secondary btn-sm" onclick="excelMode=\\'format_b\\';manualFatCol=1;manualSnfCol=0;manualRateCol=2;render()">फॉर्मेट B: SNF पहले, FAT बाद में</button></div>' : '') +
        (excelMode === 'manual_columns' ? '<div class="grid-3" style="margin-bottom:12px;"><div><label>FAT कॉलम नंबर (0=A, 1=B, 2=C)</label><input type="number" min="0" value="'+manualFatCol+'" onchange="manualFatCol=Number(this.value)" /></div><div><label>SNF कॉलम नंबर (0=A, 1=B, 2=C)</label><input type="number" min="0" value="'+manualSnfCol+'" onchange="manualSnfCol=Number(this.value)" /></div><div><label>रेट कॉलम नंबर (0=A, 1=B, 2=C)</label><input type="number" min="0" value="'+manualRateCol+'" onchange="manualRateCol=Number(this.value)" /></div></div>' : '') +
        '<div class="grid-2">' +
        '<div><label>गाय का रेट चार्ट इंपोर्ट करें (FAT <= 5.0)</label><input type="file" accept=".xls,.xlsx,.csv" onchange="importChart(event, \\'cow\\')" /></div>' +
        '<div><label>भैंस का रेट चार्ट इंपोर्ट करें (FAT > 5.0)</label><input type="file" accept=".xls,.xlsx,.csv" onchange="importChart(event, \\'buffalo\\')" /></div>' +
        '</div>' +
        (pendingExcelPreview ? '<div class="alert alert-info" style="margin-top:12px;"><h4>इंपोर्ट से पहले रेट चार्ट प्रीव्यू (' + (pendingExcelPreview.type==='cow'?'गाय':'भैंस') + ')</h4><p>कुल पढ़ी गई पंक्तियाँ: <b>' + pendingExcelPreview.totalRows + '</b> | वैध रेट: <b>' + Object.keys(pendingExcelPreview.rates).length + '</b> | खाली/अमान्य: <b>' + pendingExcelPreview.invalidRows + '</b> | डुप्लिकेट: <b>' + pendingExcelPreview.duplicates + '</b></p><div style="margin-top:8px;display:flex;gap:8px;"><button class="btn-success btn-sm" onclick="confirmExcelSave()">पुष्टि करें और सेव करें</button><button class="btn-secondary btn-sm" onclick="pendingExcelPreview=null;render()">रद्द करें</button></div></div>' : '') +
        '</div>';
    }

    function importChart(e, type) {
      const file = e.target.files[0];
      if (!file || typeof XLSX === 'undefined') { alert('Excel पढ़ने के लिए SheetJS आवश्यक है।'); return; }
      const reader = new FileReader();
      reader.onload = function(evt) {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!grid || grid.length < 2) { alert('अमान्य या खाली Excel शीट'); return; }

        const rates = {};
        const fats = [], snfs = [];
        let totalRows = 0, invalidRows = 0, duplicates = 0;

        const firstRow = grid[0].map(x => String(x || '').toLowerCase().trim());
        const hasHeader = firstRow.some(x => x && !Number.isFinite(Number(x)));

        // Determine if 3-column list or 2D Matrix
        let fCol = manualFatCol, sCol = manualSnfCol, rCol = manualRateCol;
        let isThreeCol = (excelMode !== 'auto_detect') || grid[0].length <= 4;

        if (excelMode === 'format_a') { fCol = 0; sCol = 1; rCol = 2; isThreeCol = true; }
        else if (excelMode === 'format_b') { fCol = 1; sCol = 0; rCol = 2; isThreeCol = true; }
        else if (excelMode === 'auto_detect' && hasHeader) {
          const fi = firstRow.findIndex(h => ['fat','फैट','फेट','milk fat'].includes(h));
          const si = firstRow.findIndex(h => ['snf','एसएनएफ','स्नैप','solids not fat'].includes(h));
          const ri = firstRow.findIndex(h => ['rate','रेट','price','amount','मूल्य','दर'].includes(h));
          if (fi !== -1 && si !== -1 && ri !== -1) { fCol = fi; sCol = si; rCol = ri; isThreeCol = true; }
        }

        if (isThreeCol) {
          for (let r = (hasHeader ? 1 : 0); r < grid.length; r++) {
            const row = grid[r];
            if (!row || row.every(c => String(c).trim() === '')) continue;
            totalRows++;
            const fat = parseFloat(row[fCol]);
            const snf = parseFloat(row[sCol]);
            const val = parseFloat(row[rCol]);
            if (Number.isFinite(fat) && Number.isFinite(snf) && Number.isFinite(val) && fat > 0 && snf > 0 && val > 0) {
              const k = makeKey(fat, snf);
              if (rates[k] !== undefined) duplicates++;
              rates[k] = round2(val);
              if (!fats.includes(round2(fat))) fats.push(round2(fat));
              if (!snfs.includes(round2(snf))) snfs.push(round2(snf));
            } else {
              invalidRows++;
            }
          }
        } else {
          const hdr = grid[0];
          for (let r = 1; r < grid.length; r++) {
            const snf = parseFloat(grid[r][0]);
            if (!Number.isFinite(snf)) continue;
            if (!snfs.includes(round2(snf))) snfs.push(round2(snf));
            for (let c = 1; c < hdr.length; c++) {
              totalRows++;
              const fat = parseFloat(hdr[c]);
              const val = parseFloat(grid[r][c]);
              if (Number.isFinite(fat) && Number.isFinite(val) && val > 0) {
                if (!fats.includes(round2(fat))) fats.push(round2(fat));
                rates[makeKey(fat, snf)] = round2(val);
              } else {
                invalidRows++;
              }
            }
          }
        }

        if (Object.keys(rates).length === 0) {
          alert('कोई वैध FAT, SNF और रेट नहीं मिला। कृपया कॉलम या फॉर्मेट की जाँच करें।');
          return;
        }
        pendingExcelPreview = {
          type, fileName: file.name, sheetName: wb.SheetNames[0],
          fats: fats.sort((a,b)=>a-b), snfs: snfs.sort((a,b)=>a-b),
          rates, totalRows, invalidRows, duplicates
        };
        render();
      };
      reader.readAsBinaryString(file);
    }

    function confirmExcelSave() {
      if (!pendingExcelPreview) return;
      const p = pendingExcelPreview;
      state.rateCharts[p.type] = {
        milkType: p.type, fileName: p.fileName, sheetName: p.sheetName,
        updatedAt: new Date().toISOString(), fats: p.fats, snfs: p.snfs,
        rates: p.rates, rowCount: p.snfs.length, colCount: p.fats.length,
        invalidCellCount: p.invalidRows
      };
      pendingExcelPreview = null;
      saveState();
    }

    let saleSubView = 'entry';
    let saleBillBuyer = 'all';
    let saleBillMonth = (state.selectedDate || '2026-03-01').slice(0, 7);
    let saleBillCycle = 1;
    let backupRestoreMode = 'merge';
    let backupStatusMsg = '';

    function getTenDayCycleDates(ym, cycle) {
      const parts = String(ym || '2026-03').split('-');
      const y = Number(parts[0]) || 2026;
      const m = Number(parts[1]) || 3;
      const pad = String(m).padStart(2, '0');
      if (Number(cycle) === 1) return { start: y + '-' + pad + '-01', end: y + '-' + pad + '-10', label: '1 से 10 (' + ym + ')' };
      if (Number(cycle) === 2) return { start: y + '-' + pad + '-11', end: y + '-' + pad + '-20', label: '11 से 20 (' + ym + ')' };
      const lastDay = new Date(y, m, 0).getDate();
      return { start: y + '-' + pad + '-21', end: y + '-' + pad + '-' + String(lastDay).padStart(2, '0'), label: '21 से ' + lastDay + ' (' + ym + ')' };
    }

    function renderSales() {
      const list = state.sales.filter(x => x.date === state.selectedDate);
      const buyers = Array.from(new Set((state.sales || []).map(s => (s.buyerName || '').trim()).filter(Boolean)));
      const cyc = getTenDayCycleDates(saleBillMonth, saleBillCycle);
      const billSales = (state.sales || []).filter(s => {
        if (s.date < cyc.start || s.date > cyc.end) return false;
        if (saleBillBuyer !== 'all' && (s.buyerName || '').trim().toLowerCase() !== saleBillBuyer.toLowerCase()) return false;
        return true;
      });
      const totalBillLiters = round3(billSales.reduce((a, b) => a + (Number(b.liters) || 0), 0));
      const totalBillNet = round2(billSales.reduce((a, b) => a + (Number(b.netReceivable) || 0), 0));
      const mornSales = billSales.filter(s => s.shift === 'morning');
      const eveSales = billSales.filter(s => s.shift === 'evening');
      const mornLiters = round3(mornSales.reduce((a, b) => a + (Number(b.liters) || 0), 0));
      const mornNet = round2(mornSales.reduce((a, b) => a + (Number(b.netReceivable) || 0), 0));
      const eveLiters = round3(eveSales.reduce((a, b) => a + (Number(b.liters) || 0), 0));
      const eveNet = round2(eveSales.reduce((a, b) => a + (Number(b.netReceivable) || 0), 0));

      return '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<button class="' + (saleSubView === 'entry' ? 'btn-primary' : 'btn-secondary') + ' btn-sm" onclick="saleSubView=\\'entry\\';render();">थोक बिक्री एंट्री</button>' +
        '<button class="' + (saleSubView === 'bill10' ? 'btn-primary' : 'btn-secondary') + ' btn-sm" onclick="saleSubView=\\'bill10\\';render();">बिक्री का 10-दिन का बिल</button>' +
        '</div>' +
        (saleSubView === 'entry' ? (
          '<div class="card" style="padding:10px;border:2px solid var(--blue-600);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.76rem;margin-bottom:6px;">' +
          '<b>थोक दूध बिक्री (' + state.selectedDate + ')</b>' +
          '<span id="liveSaleBar" style="color:var(--green-600);font-weight:700;">कुल रकम: ₹0.00</span></div>' +
          '<div><label>खरीदार डेयरी का नाम</label><input id="saleBuyer" placeholder="मुख्य चिलिंग प्लांट" /></div>' +
          '<div class="row-compact-4">' +
          '<div><label>1. FAT</label><input type="number" step="0.1" id="saleFat" oninput="updateLiveSale()" /></div>' +
          '<div><label>2. SNF</label><input type="number" step="0.1" id="saleSnf" oninput="updateLiveSale()" /></div>' +
          '<div><label>3. मात्रा (L)</label><input type="number" step="0.001" id="saleLiters" oninput="updateLiveSale()" /></div>' +
          '<div><label>4. रेट/L (₹)</label><input type="number" step="0.01" id="saleRate" oninput="updateLiveSale()" /></div>' +
          '</div><button class="btn-primary" style="width:100%;" onclick="saveSale()">बिक्री सेव करें</button></div>' +
          '<div class="card table-wrap"><table><thead><tr><th>खरीदार</th><th>शिफ्ट</th><th>लीटर</th><th>रेट</th><th>राशि</th></tr></thead><tbody>' +
          (list.map(x => '<tr><td>'+x.buyerName+'</td><td>'+x.shift+'</td><td class="num">'+fmtNum(x.liters,3)+'</td><td class="num">'+fmtCur(x.rate)+'</td><td class="num">'+fmtCur(x.netReceivable)+'</td></tr>').join('') || '<tr><td colspan="5">कोई बिक्री रिकॉर्ड नहीं</td></tr>') +
          '</tbody></table></div>'
        ) : (
          '<div class="card" style="border:2px solid var(--blue-600);">' +
          '<h3>बिक्री का 10-दिन का बिल (10-Day Wholesale Sale Bill)</h3>' +
          '<div class="grid-3" style="margin-top:8px;">' +
          '<div><label>खरीदार / ग्राहक चुनें</label><select onchange="saleBillBuyer=this.value;render();"><option value="all">सभी खरीदार (All Buyers)</option>' +
          buyers.map(b => '<option value="'+b+'" '+(saleBillBuyer===b?'selected':'')+'>'+b+'</option>').join('') +
          '</select></div>' +
          '<div><label>महीना (Month)</label><input type="month" value="'+saleBillMonth+'" onchange="saleBillMonth=this.value;render();" /></div>' +
          '<div><label>10-दिन साइकिल</label><select onchange="saleBillCycle=Number(this.value);render();">' +
          '<option value="1" '+(saleBillCycle===1?'selected':'')+'>1 से 10 तारीख</option>' +
          '<option value="2" '+(saleBillCycle===2?'selected':'')+'>11 से 20 तारीख</option>' +
          '<option value="3" '+(saleBillCycle===3?'selected':'')+'>21 से महीने के अंत तक</option>' +
          '</select></div></div>' +
          '<div class="grid-3" style="margin-top:8px;">' +
          '<div class="stat-box"><div class="stat-label">सुबह बिक्री ('+mornSales.length+')</div><div class="stat-val num">'+fmtNum(mornLiters,3)+' L | '+fmtCur(mornNet)+'</div></div>' +
          '<div class="stat-box"><div class="stat-label">शाम बिक्री ('+eveSales.length+')</div><div class="stat-val num">'+fmtNum(eveLiters,3)+' L | '+fmtCur(eveNet)+'</div></div>' +
          '<div class="stat-box"><div class="stat-label">10-दिन कुल बिक्री राशि</div><div class="stat-val num" style="color:var(--green-600);">'+fmtNum(totalBillLiters,3)+' L | '+fmtCur(totalBillNet)+'</div></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;" class="no-print">' +
          '<button class="btn-primary btn-sm" onclick="window.print()">प्रिंट / PDF सेव करें</button>' +
          '</div>' +
          '<div class="table-wrap" style="margin-top:10px;"><table><thead><tr><th>तारीख</th><th>शिफ्ट</th><th>खरीदार</th><th>लीटर</th><th>FAT/SNF</th><th>रेट</th><th>कुल राशि (₹)</th></tr></thead><tbody>' +
          (billSales.map(x => '<tr><td>'+x.date+'</td><td>'+(x.shift==='morning'?'सुबह':'शाम')+'</td><td>'+x.buyerName+'</td><td class="num">'+fmtNum(x.liters,3)+'</td><td class="num">'+fmtNum(x.avgFat,1)+'/'+fmtNum(x.avgSnf,1)+'</td><td class="num">'+fmtCur(x.rate)+'</td><td class="num"><b>'+fmtCur(x.netReceivable)+'</b></td></tr>').join('') || '<tr><td colspan="7">इस 10-दिन अवधि में कोई बिक्री रिकॉर्ड नहीं है</td></tr>') +
          '</tbody><tfoot><tr><td colspan="3">कुल 10-दिन योग ('+cyc.label+')</td><td class="num">'+fmtNum(totalBillLiters,3)+' L</td><td>—</td><td>—</td><td class="num">'+fmtCur(totalBillNet)+'</td></tr></tfoot></table></div></div>'
        ));
    }
    function updateLiveSale() {
      const l = parseFloat(document.getElementById('saleLiters')?.value) || 0;
      const r = parseFloat(document.getElementById('saleRate')?.value) || 0;
      const bar = document.getElementById('liveSaleBar');
      if (bar) bar.textContent = 'रेट: ₹' + r.toFixed(2) + ' | कुल रकम: ₹' + round2(l * r).toFixed(2);
    }
    function saveSale() {
      const buyer = document.getElementById('saleBuyer').value.trim();
      const l = parseFloat(document.getElementById('saleLiters').value);
      const f = parseFloat(document.getElementById('saleFat').value)||0;
      const s = parseFloat(document.getElementById('saleSnf').value)||0;
      const r = parseFloat(document.getElementById('saleRate').value);
      if (!buyer || !Number.isFinite(l) || l <= 0 || !Number.isFinite(r) || r <= 0) { alert('कृपया सही बिक्री विवरण भरें।'); return; }
      const gross = round2(l * r);
      state.sales.push({
        id: 'sale_' + Date.now(), date: state.selectedDate, time: new Date().toTimeString().slice(0,8),
        shift: state.selectedShift, buyerName: buyer, milkType: 'mixed', liters: round3(l),
        avgFat: f, avgSnf: s, rate: r, isManualRate: true, grossAmount: gross, otherCharges: 0, netReceivable: gross, notes: '', createdAt: new Date().toISOString()
      });
      saveState();
    }

    function renderFarmers() {
      return '<div class="card"><h3>नया किसान जोड़ें</h3><div class="grid-2" style="margin-top:10px;">' +
        '<div><label>किसान ID / कोड</label><input id="fCode" placeholder="101" /></div>' +
        '<div><label>किसान का नाम</label><input id="fName" placeholder="रामलाल" /></div>' +
        '<div><label>मोबाइल नंबर</label><input id="fMob" placeholder="9876543210" /></div>' +
        '<div><label>दूध आने का समय</label><select id="fSched"><option value="both">सुबह और शाम दोनों समय</option><option value="morning">केवल सुबह</option><option value="evening">केवल शाम</option></select></div>' +
        '</div><button class="btn-primary" onclick="addFarmer()">किसान सेव करें</button></div>' +
        '<div class="card table-wrap"><h4>किसान सूची (' + state.farmers.length + ')</h4><table><thead><tr><th>ID</th><th>नाम</th><th>मोबाइल</th><th>निर्धारित समय</th></tr></thead><tbody>' +
        (state.farmers.map(f => '<tr><td>'+f.code+'</td><td>'+f.name+'</td><td>'+f.mobile+'</td><td>'+(f.shiftSchedule==='morning'?'केवल सुबह':f.shiftSchedule==='evening'?'केवल शाम':'सुबह और शाम')+'</td></tr>').join('') || '<tr><td colspan="4">कोई किसान नहीं है</td></tr>') +
        '</tbody></table></div>';
    }
    function addFarmer() {
      const code = document.getElementById('fCode').value.trim();
      const name = document.getElementById('fName').value.trim();
      const mobile = document.getElementById('fMob').value.trim();
      const shiftSchedule = document.getElementById('fSched').value;
      if (!code || !name) { alert('कृपया किसान ID और नाम भरें।'); return; }
      if (state.farmers.some(f => f.code === code)) { alert('यह किसान ID पहले से मौजूद है!'); return; }
      state.farmers.push({ id: 'f_' + Date.now(), code, name, mobile, village: '', shiftSchedule, openingBalance: 0, notes: '', active: true, createdAt: new Date().toISOString() });
      saveState();
    }

    function renderLedger() {
      return '<div class="card"><h3>किसान खाता एवं 10-दिन बिलिंग</h3><div class="table-wrap"><table><thead><tr><th>किसान</th><th>कुल दूध (L)</th><th>कुल दूध राशि</th></tr></thead><tbody>' +
        (state.farmers.map(f => {
          const cols = state.collections.filter(c => c.farmerId === f.id);
          const sum = calcColSummary(cols);
          return '<tr><td>'+f.code+' - '+f.name+'</td><td class="num">'+fmtNum(sum.liters,3)+' L</td><td class="num">'+fmtCur(sum.amount)+'</td></tr>';
        }).join('') || '<tr><td colspan="3">कोई रिकॉर्ड नहीं</td></tr>') +
        '</tbody></table></div></div>';
    }

    function renderBackup() {
      return '<div class="card" style="border:2px solid var(--blue-600);">' +
        '<h3>ऑल-इन-वन डेटा बैकअप और Restore सेंटर (All-in-One Backup & Restore)</h3>' +
        '<p style="margin:4px 0 10px;font-size:0.8rem;color:var(--slate-600);">ऐप डाउनलोड या इंस्टॉल करने के बाद भी यहाँ से 100% सुरक्षित बैकअप लें और कभी भी Restore करें।</p>' +
        (backupStatusMsg ? '<div class="alert alert-info" style="font-weight:700;">' + backupStatusMsg + '</div>' : '') +
        '<div class="grid-2" style="margin-bottom:12px;">' +
        '<div style="background:var(--slate-50);padding:12px;border-radius:10px;border:1px solid var(--slate-200);">' +
        '<h4>1. बैकअप सेव या कॉपी करें (Backup)</h4>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
        '<button class="btn-primary btn-sm" onclick="exportJson()">JSON बैकअप फाइल डाउनलोड करें</button>' +
        '<button class="btn-secondary btn-sm" onclick="copyBackupText()">बैकअप कोड कॉपी करें (Copy Code)</button>' +
        '</div></div>' +
        '<div style="background:var(--blue-50);padding:12px;border-radius:10px;border:1px solid var(--blue-100);">' +
        '<h4>2. बैकअप फाइल से Restore करें</h4>' +
        '<div style="margin:6px 0;font-size:0.78rem;">' +
        '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;"><input type="radio" name="restMode" value="merge" '+(backupRestoreMode==='merge'?'checked':'')+' onchange="backupRestoreMode=\\'merge\\'" style="width:auto;margin:0;" /> पुराने डेटा में मिलाएं (Merge)</label>' +
        '<label style="display:inline-flex;align-items:center;gap:4px;"><input type="radio" name="restMode" value="replace" '+(backupRestoreMode==='replace'?'checked':'')+' onchange="backupRestoreMode=\\'replace\\'" style="width:auto;margin:0;" /> पूरा बदलें (Replace)</label>' +
        '</div>' +
        '<input type="file" id="standaloneRestoreFile" accept=".json,application/json,text/plain,*/*" style="display:none;" onchange="handleStandaloneFileRestore(event)" />' +
        '<button class="btn-success btn-sm" style="width:100%;" onclick="document.getElementById(\\'standaloneRestoreFile\\').click()">बैकअप फाइल चुनें और Restore करें</button>' +
        '</div></div>' +
        '<div style="background:var(--slate-50);padding:12px;border-radius:10px;border:1px solid var(--slate-200);">' +
        '<h4>3. बैकअप कोड पेस्ट करके Restore करें (मोबाइल APK के लिए सबसे आसान)</h4>' +
        '<textarea id="pasteBackupBox" rows="3" placeholder="यहाँ कॉपी किया हुआ JSON बैकअप कोड पेस्ट करें..."></textarea>' +
        '<button class="btn-primary btn-sm" onclick="restoreFromPastedText()">पेस्ट किए गए कोड से Restore करें</button>' +
        '</div></div>' +
        '<div class="card" style="border:2px solid #16a34a;"><h3>Android Debug APK डाउनलोड (vikramgujjar694488-spec/Ujala-Dairy-apk)</h3>' +
        '<p style="margin:6px 0 10px;font-size:0.82rem;">GitHub Releases से सीधा Ujalaa-Dairy-debug.apk डाउनलोड करें:</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<a href="https://github.com/vikramgujjar694488-spec/Ujala-Dairy-apk/releases/latest/download/Ujalaa-Dairy-debug.apk" target="_blank" style="text-decoration:none;background:#16a34a;color:#fff;padding:10px 14px;border-radius:9px;font-size:0.84rem;font-weight:700;">सीधा APK डाउनलोड करें (Ujalaa-Dairy-debug.apk)</a>' +
        '<a href="https://github.com/vikramgujjar694488-spec/Ujala-Dairy-apk/releases" target="_blank" style="text-decoration:none;background:#f1f5f9;color:#1e293b;border:1px solid #cbd5e1;padding:10px 14px;border-radius:9px;font-size:0.84rem;font-weight:700;">GitHub Releases खोलें</a>' +
        '</div></div>';
    }
    function exportJson() {
      const jsonStr = JSON.stringify(state, null, 2);
      const filename = 'Ujalaa_Dairy_Backup_' + state.selectedDate + '.json';
      try {
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        backupStatusMsg = 'बैकअप फाइल डाउनलोड शुरू हो गई है (' + filename + ')';
        render();
      } catch (e) {
        const a = document.createElement('a');
        a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
    function copyBackupText() {
      const jsonStr = JSON.stringify(state);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonStr).then(() => {
          backupStatusMsg = 'बैकअप कोड कॉपी हो गया! इसे WhatsApp या Notes में सेव कर लें।';
          render();
        });
      } else {
        const box = document.getElementById('pasteBackupBox');
        if (box) { box.value = jsonStr; box.select(); document.execCommand('copy'); }
        backupStatusMsg = 'बैकअप कोड बॉक्स में आ गया है और कॉपी हो गया है!';
        render();
      }
    }
    function applyRestoredObject(parsed) {
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.farmers) || !Array.isArray(parsed.collections)) {
        backupStatusMsg = 'त्रुटि: यह वैध Ujalaa Dairy बैकअप डेटा नहीं है।';
        render();
        return;
      }
      if (backupRestoreMode === 'replace') {
        state = Object.assign({}, INITIAL_SEED, parsed);
      } else {
        const mergeArr = (a, b) => {
          const map = new Map();
          (a || []).forEach(x => { if (x && x.id) map.set(x.id, x); });
          (b || []).forEach(x => { if (x && x.id) map.set(x.id, x); });
          return Array.from(map.values());
        };
        state = Object.assign({}, state, {
          farmers: mergeArr(state.farmers, parsed.farmers),
          customers: mergeArr(state.customers, parsed.customers),
          collections: mergeArr(state.collections, parsed.collections),
          sales: mergeArr(state.sales, parsed.sales),
          advancesAndPayments: mergeArr(state.advancesAndPayments, parsed.advancesAndPayments),
          cattleFeed: mergeArr(state.cattleFeed, parsed.cattleFeed),
          expenses: mergeArr(state.expenses, parsed.expenses),
          bills: mergeArr(state.bills, parsed.bills)
        });
      }
      backupStatusMsg = 'बैकअप सफलतापूर्वक Restore हो गया! (किसान: ' + state.farmers.length + ', कलेक्शन: ' + state.collections.length + ', बिक्री: ' + (state.sales||[]).length + ')';
      saveState();
    }
    function extractJsonString(rawStr) {
      const s = String(rawStr || '').trim();
      const first = s.indexOf('{');
      const last = s.lastIndexOf('}');
      if (first !== -1 && last > first) return s.slice(first, last + 1);
      return s;
    }
    function handleStandaloneFileRestore(ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function() {
        try {
          applyRestoredObject(JSON.parse(extractJsonString(reader.result)));
        } catch (err) {
          backupStatusMsg = 'फाइल पढ़ने में त्रुटि: सही JSON बैकअप फाइल चुनें।';
          render();
        }
      };
      reader.readAsText(f);
      ev.target.value = '';
    }
    function restoreFromPastedText() {
      const raw = (document.getElementById('pasteBackupBox')?.value || '').trim();
      if (!raw) { backupStatusMsg = 'कृपया पहले बॉक्स में बैकअप कोड पेस्ट करें।'; render(); return; }
      try {
        applyRestoredObject(JSON.parse(extractJsonString(raw)));
      } catch (err) {
        backupStatusMsg = 'पेस्ट किया गया कोड सही JSON नहीं है। पूरा कोड कॉपी करके पेस्ट करें।';
        render();
      }
    }

    render();
  </script>
</body>
</html>`;
}
