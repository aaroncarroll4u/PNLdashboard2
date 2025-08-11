import React, { useMemo, useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Colors
const COLORS_INCOME = ["#22c55e", "#16a34a", "#4ade80", "#15803d", "#86efac"]; // greens
const COLORS_EXPENSES = ["#fb923c", "#f97316", "#fdba74", "#ea580c", "#fed7aa"]; // oranges
const COLORS_ASSETS = ["#14b8a6", "#0ea5e9", "#06b6d4", "#38bdf8", "#2dd4bf"]; // teal/cyan
const COLORS_NET = ["#0891b2"]; // single-slice for Net Worth (no liabilities for now)

// Fixed base headings (from your spreadsheet labels)
const BASE_TEMPLATES = {
  income: ["Salary", "Cash", "Music", "Fitness", "Carry Over"],
  saving: ["Saving Blanket", "Cash", "Current"],
  investment: ["Apt Valuation", "Bitcoin", "Stocks", "Pension Valuation"],
  expense: [
    "Mortgage", "Jiujitsu", "CrossFit", "Food Shop", "Leisure/Concert",
    "Company car (N/A)", "TV/Mobile/Apps", "Supplements", "BONGO Dog",
    "Electricity", "Other", "Takeaway"
  ]
};

function emptyMonth(templates) {
  return {
    income: Object.fromEntries(templates.income.map((c) => [c, 0])),
    saving: Object.fromEntries(templates.saving.map((c) => [c, 0])),
    investment: Object.fromEntries(templates.investment.map((c) => [c, 0])),
    expense: Object.fromEntries(templates.expense.map((c) => [c, 0]))
  };
}

function createInitialData(templates) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { months: { [monthKey]: emptyMonth(templates) } };
}

function entriesToChartData(obj) {
  return Object.entries(obj || {})
    .filter(([, v]) => Number(v) !== 0)
    .map(([name, value]) => ({ name, value: Number(value) }));
}

function sum(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + Number(b), 0);
}

export default function BudgetDashboard() {
  // Load/persist templates so custom subheadings can be remembered
  const [userTemplates, setUserTemplates] = useState(() => {
    try { const raw = localStorage.getItem("pl-templates"); if (raw) return JSON.parse(raw); } catch {}
    return { income: [], saving: [], investment: [], expense: [] };
  });
  useEffect(() => { try { localStorage.setItem("pl-templates", JSON.stringify(userTemplates)); } catch {} }, [userTemplates]);

  const TEMPLATES = useMemo(() => ({
    income: [...BASE_TEMPLATES.income, ...userTemplates.income],
    saving: [...BASE_TEMPLATES.saving, ...userTemplates.saving],
    investment: [...BASE_TEMPLATES.investment, ...userTemplates.investment],
    expense: [...BASE_TEMPLATES.expense, ...userTemplates.expense]
  }), [userTemplates]);

  // Settings (currency, fiscal start month, MoM coloring, compact mode)
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pl-settings")) || { currency: "EUR", fyStartMonth: 1, showMoMColors: true, compactMode: false }; } catch {}
    return { currency: "EUR", fyStartMonth: 1, showMoMColors: true, compactMode: false };
  });
  useEffect(() => { try { localStorage.setItem("pl-settings", JSON.stringify(settings)); } catch {} }, [settings]);

  const fmtCurrency = (n) => new Intl.NumberFormat(undefined, { style: "currency", currency: settings.currency || "EUR" }).format(Number(n));

  // App state (data)
  const [data, setData] = useState(() => {
    try { const raw = localStorage.getItem("pl-dashboard"); if (raw) return JSON.parse(raw); } catch {}
    return createInitialData(TEMPLATES);
  });
  useEffect(() => { try { localStorage.setItem("pl-dashboard", JSON.stringify(data)); } catch {} }, [data]);

  const monthsOrder = Object.keys(data.months).sort();
  const [selectedMonth, setSelectedMonth] = useState(monthsOrder[monthsOrder.length - 1]);
  const [view, setView] = useState("Monthly"); // Monthly | Annual

  // Ensure selected month exists; carry forward saving/investment balances from previous month; leave income/expense at 0
  useEffect(() => {
    if (data.months[selectedMonth]) return;
    setData((prev) => {
      const keys = Object.keys(prev.months).sort();
      const prevKey = keys.filter((k) => k < selectedMonth).pop();
      const carry = prevKey ? prev.months[prevKey] : emptyMonth(TEMPLATES);
      const nextMonth = emptyMonth(TEMPLATES);
      // carry forward balances for saving/investment
      nextMonth.saving = { ...nextMonth.saving, ...(carry.saving || {}) };
      nextMonth.investment = { ...nextMonth.investment, ...(carry.investment || {}) };
      return { months: { ...prev.months, [selectedMonth]: nextMonth } };
    });
  }, [selectedMonth, TEMPLATES]);

  function shiftMonth(delta) {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(key);
  }

  function fiscalYearKeysFor(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const startMonth = Number(settings.fyStartMonth || 1); // 1-12
    const startYear = m >= startMonth ? y : y - 1;
    const keys = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(startYear, (startMonth - 1) + i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
  }

  const monthKeysForView = useMemo(() => {
    if (view === "Monthly") return [selectedMonth];
    const fyKeys = fiscalYearKeysFor(selectedMonth);
    return monthsOrder.filter((k) => fyKeys.includes(k));
  }, [view, selectedMonth, monthsOrder, settings.fyStartMonth]);

  // Aggregate for view
  const aggregated = useMemo(() => {
    const acc = { income: {}, saving: {}, investment: {}, expense: {} };
    for (const m of monthKeysForView) {
      const month = data.months[m];
      if (!month) continue;
      for (const k of Object.keys(acc)) {
        for (const [cat, val] of Object.entries(month[k] || {})) {
          acc[k][cat] = (acc[k][cat] || 0) + Number(val);
        }
      }
    }
    return acc;
  }, [monthKeysForView, data]);

  const incomeData = entriesToChartData(aggregated.income);
  const expenseData = entriesToChartData(aggregated.expense);
  const savingData = entriesToChartData(aggregated.saving);
  const investmentData = entriesToChartData(aggregated.investment);
  // Saving + Investments combined pie
  const savingInvestData = useMemo(() => {
    const map = new Map();
    [...savingData, ...investmentData].forEach(({ name, value }) => {
      map.set(name, (map.get(name) || 0) + Number(value));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [savingData, investmentData]);

  const netWorthValue = sum(aggregated.saving) + sum(aggregated.investment);
  const netWorthData = [{ name: "Net Worth", value: netWorthValue }];
  const cashFlow = sum(aggregated.income) - sum(aggregated.expense);

  // Undo/snackbar state
  const [snackbar, setSnackbar] = useState(null); // {label, undo}
  function showUndo(label, undo) {
    setSnackbar({ label, undo });
    setTimeout(() => setSnackbar((s) => (s && s.label === label ? null : s)), 5000);
  }

  // Center add menu + add dialog
  const [showMenu, setShowMenu] = useState(false);
  const [showAdder, setShowAdder] = useState(null); // 'income'|'saving'|'investment'|'expense'
  const [newCat, setNewCat] = useState("");
  const [newOther, setNewOther] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [rememberSubheading, setRememberSubheading] = useState(true);

  function addItem(kind) {
    const amt = Number(newAmt);
    const catToUse = (newOther && newOther.trim()) ? newOther.trim() : newCat;
    if (!kind || !catToUse || !Number.isFinite(amt)) return;
    // capture prev for undo
    const prevMonth = data.months[selectedMonth] || emptyMonth(TEMPLATES);
    const prevVal = Number(prevMonth[kind]?.[catToUse] || 0);
    setData((prev) => {
      const next = { ...prev, months: { ...prev.months } };
      const base = next.months[selectedMonth] || emptyMonth(TEMPLATES);
      const m = { ...base, [kind]: { ...base[kind] } };
      m[kind][catToUse] = (m[kind][catToUse] || 0) + amt;
      next.months[selectedMonth] = m;
      return next;
    });
    showUndo(`Added ${fmtCurrency(amt)} to ${catToUse}`, () => updateAmount(catToUse, prevVal));

    if (newOther && rememberSubheading) {
      setUserTemplates((prev) => ({
        ...prev,
        [kind]: Array.from(new Set([...(prev[kind] || []), newOther.trim()]))
      }));
    }
    setNewCat("");
    setNewOther("");
    setNewAmt("");
    setShowAdder(null);
    setShowMenu(false);
  }

  // Drilldown modal (editable + tags + totals + confirm delete)
  const [breakdown, setBreakdown] = useState({ open: false, title: "", items: [], total: 0, bucket: null });
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDel, setConfirmDel] = useState(null); // cat name

  function mapTitleToBucket(title) {
    if (/Expense/i.test(title)) return 'expense';
    if (/Income/i.test(title)) return 'income';
    if (/Saving|Investment/i.test(title)) return 'saving-invest'; // combined view
    return null; // Net Worth not directly editable
  }

  function openBreakdown(title, data) {
    const items = [...data].sort((a, b) => b.value - a.value);
    const total = items.reduce((a, d) => a + (d.value || 0), 0);
    setBreakdown({ open: true, title, items, total, bucket: mapTitleToBucket(title) });
    setEditIndex(null);
    setEditValue("");
    setConfirmDel(null);
  }

  function currentMonthBucket() {
    return data.months[selectedMonth] || emptyMonth(TEMPLATES);
  }

  function prevMonthKey(key) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getPrevValueFor(cat, bucketName) {
    const prevKey = prevMonthKey(selectedMonth);
    const prevMonth = data.months[prevKey];
    if (!prevMonth) return 0;
    if (bucketName === 'saving-invest') {
      return Number(prevMonth.saving?.[cat] || 0) + Number(prevMonth.investment?.[cat] || 0);
    }
    return Number(prevMonth[bucketName]?.[cat] || 0);
  }

  function updateAmount(cat, newAmtNum) {
    const bucket = breakdown.bucket;
    if (!bucket) return; // Net Worth
    // snapshot for undo
    const before = currentMonthBucket();
    const oldVal = bucket === 'saving-invest'
      ? Number(before.saving?.[cat] || 0) + Number(before.investment?.[cat] || 0)
      : Number(before[bucket]?.[cat] || 0);

    setData((prev) => {
      const next = { ...prev, months: { ...prev.months } };
      const base = next.months[selectedMonth] || emptyMonth(TEMPLATES);
      const applyTo = (k) => {
        const m = { ...base, [k]: { ...base[k] } };
        m[k][cat] = Number(newAmtNum) || 0;
        next.months[selectedMonth] = m;
      };
      if (bucket === 'saving-invest') {
        if (base.saving && Object.prototype.hasOwnProperty.call(base.saving, cat)) applyTo('saving');
        else if (base.investment && Object.prototype.hasOwnProperty.call(base.investment, cat)) applyTo('investment');
        else if (TEMPLATES.saving.includes(cat)) applyTo('saving');
        else applyTo('investment');
      } else {
        applyTo(bucket);
      }
      return next;
    });

    showUndo(`Changed ${cat} to ${fmtCurrency(newAmtNum)}`, () => updateAmount(cat, oldVal));
  }

  function deleteAmount(cat) {
    const before = currentMonthBucket();
    const bucket = breakdown.bucket;
    const oldVal = bucket === 'saving-invest'
      ? Number(before.saving?.[cat] || 0) + Number(before.investment?.[cat] || 0)
      : Number(before[bucket]?.[cat] || 0);
    updateAmount(cat, 0);
    showUndo(`Deleted ${cat}`, () => updateAmount(cat, oldVal));
  }

  function tagFor(cat) {
    const base = currentMonthBucket();
    if (Object.prototype.hasOwnProperty.call(base.expense, cat)) return { label: 'Expense', cls: 'bg-orange-100 text-orange-700' };
    if (Object.prototype.hasOwnProperty.call(base.income, cat)) return { label: 'Income', cls: 'bg-emerald-100 text-emerald-700' };
    if (Object.prototype.hasOwnProperty.call(base.saving, cat)) return { label: 'Saving', cls: 'bg-emerald-50 text-emerald-700' };
    if (Object.prototype.hasOwnProperty.call(base.investment, cat)) return { label: 'Investment', cls: 'bg-teal-50 text-teal-700' };
    return null;
  }

  // Export (CSV / Excel) for month or annual (fiscal year aware)
  async function exportData(scope, format) {
    const keys = scope === 'month' ? [selectedMonth] : fiscalYearKeysFor(selectedMonth);
    const rows = [];
    for (const k of keys) {
      const m = data.months[k];
      if (!m) continue;
      for (const bucket of ['income','expense','saving','investment']) {
        for (const [cat, val] of Object.entries(m[bucket] || {})) {
          rows.push({ Month: k, Bucket: bucket, Category: cat, Amount: Number(val) });
        }
      }
    }

    if (!rows.length) return;

    if (format === 'csv') {
      const header = Object.keys(rows[0]).join(',');
      const csv = [header, ...rows.map(r => `${r.Month},${r.Bucket},"${String(r.Category).replace(/\"/g,'\"\"')}",${r.Amount}`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = scope === 'month' ? `budget_${selectedMonth}` : `budget_FY-${selectedMonth.slice(0,4)}`;
      a.download = `${name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const XLSX = (await import('xlsx')).default;
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, scope === 'month' ? selectedMonth : `FY-${selectedMonth.slice(0,4)}`);
      const name = scope === 'month' ? `budget_${selectedMonth}` : `budget_FY-${selectedMonth.slice(0,4)}`;
      XLSX.writeFile(wb, `${name}.xlsx`);
    }
  }

  // Backup (full JSON) and import
  function downloadBackup() {
    const payload = { data, templates: userTemplates, settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pl_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json.data) setData(json.data);
      if (json.templates) setUserTemplates(json.templates);
      if (json.settings) setSettings(json.settings);
    } catch (e) {
      alert('Import failed. Please select a valid backup JSON.');
    }
  }

  // Resets
  function resetData() {
    if (!confirm('Reset all month data? This cannot be undone.')) return;
    setData(createInitialData(TEMPLATES));
  }
  function resetTemplates() {
    if (!confirm('Reset custom subheadings? This cannot be undone.')) return;
    setUserTemplates({ income: [], saving: [], investment: [], expense: [] });
  }

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  function ChartCard({ title, data, colors, onClick }) {
    const pieClass = settings.compactMode ? "h-48 md:h-44" : "h-64 md:h-56";
    return (
      <div className={"bg-white rounded-2xl shadow p-4 flex flex-col cursor-pointer " + (settings.compactMode ? "text-sm" : "")} onClick={onClick}>
        <div className={"text-center font-semibold mb-2 " + (settings.compactMode ? "text-base" : "text-base md:text-xl")}>{title}</div>
        <div className={pieClass}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={settings.compactMode ? 80 : 90} paddingAngle={2} label>
                {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={colors[index % colors.length]} />))}
              </Pie>
              <Tooltip formatter={(v) => fmtCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: settings.compactMode ? 10 : 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 p-3 md:p-4">
      {/* Header with quick date switcher, export, and settings */}
      <div className={"flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center justify-between mb-4 " + (settings.compactMode ? "text-sm" : "")}>
        <div className={"font-bold " + (settings.compactMode ? "text-lg" : "text-xl md:text-2xl")}>Budget Overview</div>
        <div className="flex gap-2 items-center flex-wrap">
          <button aria-label="Previous month" className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => shiftMonth(-1)}>◀</button>
          <select className="border rounded-xl px-3 py-2 bg-white text-sm md:text-base" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {monthsOrder.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <button aria-label="Next month" className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => shiftMonth(1)}>▶</button>
          <div className="flex bg-white rounded-xl shadow overflow-hidden">
            {["Monthly", "Annual"].map((m) => (
              <button key={m} onClick={() => setView(m)} className={`px-3 py-2 text-sm ${view === m ? "bg-emerald-500 text-white" : "hover:bg-slate-100"}`}>{m}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => exportData('month','csv')}>Export Month CSV</button>
            <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => exportData('month','xlsx')}>Export Month XLSX</button>
            <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => exportData('year','csv')}>Export Year CSV</button>
            <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => exportData('year','xlsx')}>Export Year XLSX</button>
          </div>
          <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </div>

      {/* Four charts: Expenses/Costs, Saving/Investments, Income, Net Worth */}
      <div className={"grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 " + (settings.compactMode ? "max-w-4xl mx-auto" : "")}>
        <ChartCard title="Expenses / Costs" data={expenseData} colors={COLORS_EXPENSES} onClick={() => openBreakdown('Expenses / Costs', expenseData)} />
        <ChartCard title="Saving / Investments" data={savingInvestData} colors={COLORS_ASSETS} onClick={() => openBreakdown('Saving / Investments', savingInvestData)} />
        <ChartCard title="Income" data={incomeData} colors={COLORS_INCOME} onClick={() => openBreakdown('Income', incomeData)} />
        <ChartCard title="Net Worth" data={netWorthData} colors={COLORS_NET} onClick={() => openBreakdown('Net Worth', netWorthData)} />
      </div>

      {/* Cashflow strip */}
      <div className={"mt-6 text-center " + (settings.compactMode ? "text-base" : "text-base md:text-lg")}>
        <span className="font-semibold">Current CashFlow = </span>
        <span className={`${cashFlow >= 0 ? "text-emerald-600" : "text-rose-600"} font-bold`}>{fmtCurrency(cashFlow)}</span>
      </div>

      {/* Center Add button */}
      <div className="mt-8 flex justify-center">
        <button className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-full shadow-lg" onClick={() => setShowMenu(!showMenu)}>+ Add Entry</button>
      </div>

      {showMenu && (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {[{k:'income',label:'Income',cls:'bg-emerald-500'},{k:'saving',label:'Saving/Cash',cls:'bg-emerald-600'},{k:'investment',label:'Investment/Asset',cls:'bg-teal-500'},{k:'expense',label:'Expense/Cost',cls:'bg-orange-500'}].map(({k,label,cls}) => (
            <button key={k} className={`px-4 py-2 rounded-xl text-white font-semibold ${cls}`} onClick={() => setShowAdder(k)}>{label}</button>
          ))}
        </div>
      )}

      {showAdder && (
        <div className="mt-6 bg-white p-4 rounded-2xl shadow max-w-md mx-auto">
          <h3 className="text-lg font-semibold mb-3">Add to {showAdder}</h3>
          <select className="border rounded-xl px-3 py-2 bg-white w-full mb-2" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            <option value="">Select category…</option>
            {TEMPLATES[showAdder].map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <input type="text" placeholder="Other (custom name)" className="border rounded-xl px-3 py-2 w-full mb-2" value={newOther} onChange={(e) => setNewOther(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
            <input type="checkbox" checked={rememberSubheading} onChange={(e) => setRememberSubheading(e.target.checked)} />
            Remember custom name as a subheading for future months
          </label>
          <input inputMode="decimal" type="number" step="0.01" placeholder="Amount" className="border rounded-xl px-3 py-2 w-full mb-3" value={newAmt} onChange={(e) => setNewAmt(e.target.value)} />
          <button className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl w-full" onClick={() => addItem(showAdder)}>Save</button>
        </div>
      )}

      {/* Breakdown modal (with percentages + edit/delete + tags + totals + MoM deltas) */}
      {breakdown.open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-3" onClick={() => setBreakdown({ open:false, title:"", items:[], total: 0, bucket: null })}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{breakdown.title}</h3>
              <button className="text-slate-600" onClick={() => setBreakdown({ open:false, title:"", items:[], total: 0, bucket: null })}>✕</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-auto">
              {breakdown.items.map((row, i) => {
                const pct = breakdown.total ? (row.value / breakdown.total) * 100 : 0;
                const prevVal = getPrevValueFor(row.name, breakdown.bucket);
                const delta = Number(row.value) - Number(prevVal);
                const isEditing = editIndex === i;
                const tag = tagFor(row.name);
                const deltaCls = settings.showMoMColors ? (delta >= 0 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-500';
                const deltaArrow = delta >= 0 ? '▲' : '▼';
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{row.name}</span>
                      {tag && <span className={`px-2 py-0.5 rounded-full text-xs ${tag.cls}`}>{tag.label}</span>}
                    </div>
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          inputMode="decimal"
                          type="number"
                          step="0.01"
                          className="border rounded-md px-2 py-1 w-28"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                        <button className="px-2 py-1 rounded-md bg-emerald-500 text-white" onClick={() => { updateAmount(row.name, Number(editValue)); setEditIndex(null); }}>
                          Save
                        </button>
                        <button className="px-2 py-1 text-slate-600" onClick={() => setEditIndex(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <div className="text-right">
                          <div>{fmtCurrency(row.value)} ({pct.toFixed(1)}%)</div>
                          <div className={`${deltaCls} text-xs`}>{deltaArrow} {fmtCurrency(Math.abs(delta))} vs prev</div>
                        </div>
                        {breakdown.bucket && (
                          <div className="flex items-center gap-2">
                            {confirmDel === row.name ? (
                              <>
                                <button className="px-2 py-1 rounded-md bg-rose-600 text-white" onClick={() => { deleteAmount(row.name); setConfirmDel(null); }}>
                                  Confirm
                                </button>
                                <button className="px-2 py-1 text-slate-600" onClick={() => setConfirmDel(null)}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button className="px-2 py-1 rounded-md bg-slate-200" onClick={() => { setEditIndex(i); setEditValue(String(row.value)); }}>
                                  Edit
                                </button>
                                <button className="px-2 py-1 rounded-md bg-rose-500 text-white" onClick={() => setConfirmDel(row.name)}>
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t pt-3 text-sm flex items-center justify-between">
              <span className="text-slate-600">Total</span>
              <span className="font-semibold">{fmtCurrency(breakdown.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar for undo */}
      {snackbar && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-3">
          <span>{snackbar.label}</span>
          <button className="underline" onClick={() => { snackbar.undo?.(); setSnackbar(null); }}>Undo</button>
          <button className="ml-2" onClick={() => setSnackbar(null)}>✕</button>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-3" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Settings</h3>
              <button className="text-slate-600" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Currency code</label>
                <input className="border rounded-xl px-3 py-2 w-full" value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value.toUpperCase() })} placeholder="EUR" />
                <div className="flex gap-2 mt-2">
                  {["EUR","GBP","USD"].map((c) => (
                    <button key={c} className={`px-2 py-1 rounded-md border ${settings.currency===c? 'bg-slate-900 text-white':'bg-white'}`} onClick={() => setSettings({ ...settings, currency: c })}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Fiscal year starts in</label>
                <select className="border rounded-xl px-3 py-2 w-full" value={settings.fyStartMonth} onChange={(e) => setSettings({ ...settings, fyStartMonth: Number(e.target.value) })}>
                  {[
                    '01 Jan','02 Feb','03 Mar','04 Apr','05 May','06 Jun','07 Jul','08 Aug','09 Sep','10 Oct','11 Nov','12 Dec'
                  ].map((label, idx) => (
                    <option key={label} value={idx+1}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={settings.showMoMColors} onChange={(e) => setSettings({ ...settings, showMoMColors: e.target.checked })} />
                  Show coloured month-over-month deltas
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={settings.compactMode} onChange={(e) => setSettings({ ...settings, compactMode: e.target.checked })} />
                  Compact mode
                </label>
              </div>
              <div className="md:col-span-2 border-t pt-3">
                <div className="flex flex-wrap gap-2">
                  <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={downloadBackup}>Download Backup (JSON)</button>
                  <label className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100 cursor-pointer">
                    Import Backup JSON
                    <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files && e.target.files[0] && importBackup(e.target.files[0])} />
                  </label>
                  <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={resetData}>Reset Data</button>
                  <button className="px-3 py-2 rounded-xl bg-white shadow hover:bg-slate-100" onClick={resetTemplates}>Reset Templates</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
