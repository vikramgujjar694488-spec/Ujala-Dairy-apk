import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Edit2,
  Info,
  Moon,
  Scale,
  Settings2,
  Sun,
  Trash2,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  DairyAppState,
  SaleMilkType,
  ShiftType,
  WholesaleSaleEntry,
} from '../types/dairy';
import {
  calculateReconciliation,
  calculateSaleSummary,
  classifyMilkType,
  formatAutoDecimalFatSnf,
  formatCurrency,
  formatNumber,
  lookupRateFromChart,
  round2,
  round3,
} from '../utils/dairyCalculations';
import { ConfirmDialog } from './Modals';

interface WholesaleAndReconciliationViewProps {
  state: DairyAppState;
  onChangeDate: (date: string) => void;
  onChangeShift: (shift: ShiftType) => void;
  onSaveSale: (entry: WholesaleSaleEntry, isEdit: boolean) => void;
  onDeleteSale: (id: string) => void;
}

export const WholesaleAndReconciliationView: React.FC<
  WholesaleAndReconciliationViewProps
> = ({ state, onChangeDate, onChangeShift, onSaveSale, onDeleteSale }) => {
  const lang = state.language;
  const date = state.selectedDate;
  const shift = state.selectedShift;

  // Sale Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState<string>('');
  const [milkType, setMilkType] = useState<SaleMilkType>('mixed');
  const [litersStr, setLitersStr] = useState<string>('');
  const [fatStr, setFatStr] = useState<string>('');
  const [snfStr, setSnfStr] = useState<string>('');
  const [isManualRate, setIsManualRate] = useState<boolean>(true);
  const [manualRateStr, setManualRateStr] = useState<string>('');
  const [otherChargesStr, setOtherChargesStr] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [showExtraSaleFields, setShowExtraSaleFields] = useState<boolean>(false);
  const [autoDecimalFatSnf, setAutoDecimalFatSnf] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const fatInputRef = useRef<HTMLInputElement | null>(null);
  const snfInputRef = useRef<HTMLInputElement | null>(null);
  const litersInputRef = useRef<HTMLInputElement | null>(null);
  const rateInputRef = useRef<HTMLInputElement | null>(null);

  // Reconciliation filter
  const [recScope, setRecScope] = useState<'shift' | 'full_day'>('full_day');

  // Parse form numbers
  const litersNum = litersStr.trim() !== '' ? Number(litersStr) : NaN;
  const fatNum = fatStr.trim() !== '' ? Number(fatStr) : NaN;
  const snfNum = snfStr.trim() !== '' ? Number(snfStr) : NaN;
  const manualRateNum = manualRateStr.trim() !== '' ? Number(manualRateStr) : NaN;
  const otherChargesNum =
    otherChargesStr.trim() !== '' ? Math.max(0, Number(otherChargesStr) || 0) : 0;

  const hasValidLiters = Number.isFinite(litersNum) && litersNum > 0;
  const hasValidFat = Number.isFinite(fatNum) && fatNum > 0;
  const hasValidSnf = Number.isFinite(snfNum) && snfNum > 0;

  // Rate from chart if !isManualRate
  const effectiveChartType =
    milkType === 'cow'
      ? 'cow'
      : milkType === 'buffalo'
      ? 'buffalo'
      : hasValidFat
      ? classifyMilkType(fatNum)
      : 'cow';

  const chartLookup =
    !isManualRate && hasValidFat && hasValidSnf
      ? lookupRateFromChart(state.rateCharts[effectiveChartType], fatNum, snfNum)
      : { found: false, rate: null, warningHi: null, warningEn: null };

  const liveRate = isManualRate
    ? Number.isFinite(manualRateNum) && manualRateNum > 0
      ? round2(manualRateNum)
      : null
    : chartLookup.found && chartLookup.rate !== null
    ? chartLookup.rate
    : null;

  const liveGrossAmount =
    hasValidLiters && liveRate !== null ? round2(litersNum * liveRate) : null;
  const liveNetReceivable =
    liveGrossAmount !== null ? round2(liveGrossAmount - otherChargesNum) : null;

  const handleFatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!autoDecimalFatSnf) {
      setFatStr(raw);
      return;
    }
    const { value, completedEntry } = formatAutoDecimalFatSnf(raw, fatStr);
    setFatStr(value);
    if (completedEntry && snfInputRef.current) {
      snfInputRef.current.focus();
      snfInputRef.current.select();
    }
  };

  const handleSnfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!autoDecimalFatSnf) {
      setSnfStr(raw);
      return;
    }
    const { value, completedEntry } = formatAutoDecimalFatSnf(raw, snfStr);
    setSnfStr(value);
    if (completedEntry && litersInputRef.current) {
      litersInputRef.current.focus();
      litersInputRef.current.select();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setBuyerName('');
    setMilkType('mixed');
    setLitersStr('');
    setFatStr('');
    setSnfStr('');
    setIsManualRate(true);
    setManualRateStr('');
    setOtherChargesStr('0');
    setNotes('');
    setShowExtraSaleFields(false);
    setFormError(null);
  };

  const handleEdit = (entry: WholesaleSaleEntry) => {
    setEditingId(entry.id);
    onChangeDate(entry.date);
    onChangeShift(entry.shift);
    setBuyerName(entry.buyerName);
    setMilkType(entry.milkType);
    setLitersStr(String(entry.liters));
    setFatStr(String(entry.avgFat));
    setSnfStr(String(entry.avgSnf));
    setIsManualRate(entry.isManualRate);
    setManualRateStr(String(entry.rate));
    setOtherChargesStr(String(entry.otherCharges || 0));
    setNotes(entry.notes || '');
    setShowExtraSaleFields(entry.otherCharges > 0 || Boolean(entry.notes));
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!buyerName.trim()) {
      setFormError(
        lang === 'hi'
          ? 'कृपया खरीदार/डेयरी का नाम दर्ज करें।'
          : 'Please enter the buyer/dairy name.'
      );
      return;
    }
    if (!hasValidLiters || !hasValidFat || !hasValidSnf) {
      setFormError(
        lang === 'hi'
          ? 'कृपया कुल लीटर, औसत FAT और औसत SNF सही दर्ज करें।'
          : 'Please enter valid Liters, Avg FAT, and Avg SNF.'
      );
      return;
    }
    if (liveRate === null || liveGrossAmount === null || liveNetReceivable === null) {
      setFormError(
        isManualRate
          ? lang === 'hi'
            ? 'कृपया वैध मैन्युअल बिक्री रेट (₹ > 0) दर्ज करें।'
            : 'Please enter a valid manual sale rate.'
          : (lang === 'hi' ? chartLookup.warningHi : chartLookup.warningEn) ||
              'रेट चार्ट में रेट उपलब्ध नहीं है।'
      );
      return;
    }

    const now = new Date();
    const existing = editingId ? state.sales.find((s) => s.id === editingId) : undefined;

    const entry: WholesaleSaleEntry = {
      id: editingId || `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date,
      time: existing ? existing.time : now.toTimeString().slice(0, 8),
      shift,
      buyerName: buyerName.trim(),
      milkType,
      liters: round3(litersNum),
      avgFat: round2(fatNum),
      avgSnf: round2(snfNum),
      rate: liveRate,
      isManualRate,
      grossAmount: liveGrossAmount,
      otherCharges: round2(otherChargesNum),
      netReceivable: liveNetReceivable,
      notes: notes.trim(),
      createdAt: existing ? existing.createdAt : now.toISOString(),
    };

    onSaveSale(entry, Boolean(editingId));
    resetForm();
  };

  // Filtered sales for current date
  const daySales = state.sales.filter((s) => s.date === date);
  const saleSummary = calculateSaleSummary(daySales);

  // Reconciliation calculations
  const recCollections = state.collections.filter(
    (c) => c.date === date && (recScope === 'full_day' || c.shift === shift)
  );
  const recSales = state.sales.filter(
    (s) => s.date === date && (recScope === 'full_day' || s.shift === shift)
  );
  const recExpenses = state.expenses.filter(
    (e) =>
      e.date === date &&
      (recScope === 'full_day' ? true : e.shift === shift)
  );

  const mainRec = calculateReconciliation(recCollections, recSales, recExpenses);

  // Cow vs Buffalo separate reconciliation when applicable
  const cowRec = calculateReconciliation(
    recCollections.filter((c) => c.milkType === 'cow'),
    recSales.filter((s) => s.milkType === 'cow'),
    []
  );
  const buffaloRec = calculateReconciliation(
    recCollections.filter((c) => c.milkType === 'buffalo'),
    recSales.filter((s) => s.milkType === 'buffalo'),
    []
  );

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* ========================================================================
          ULTRA-COMPACT TOP WHOLESALE MILK SALE COCKPIT (ABOVE MOBILE KEYBOARD)
          All fields (Buyer, Milk Type, FAT, SNF, Quantity, Rate, Total Amount, Save)
          sit in one compact top block so mobile keyboard never covers them.
         ======================================================================== */}
      <div
        data-testid="sale-top-cockpit"
        className="bg-white border-2 border-blue-600 rounded-2xl p-2.5 sm:p-4 shadow-sm"
      >
        {/* Row 1: Compact Date + Shift Switch + Today's Saved Sale Summary */}
        <div
          data-testid="sale-mobile-keyboard-live-bar"
          className="flex flex-wrap items-center justify-between gap-1.5 pb-2 mb-2 border-b border-slate-100"
        >
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <input
                type="date"
                aria-label={lang === 'hi' ? 'बिक्री की तारीख' : 'Sale Date'}
                value={date}
                onChange={(e) => onChangeDate(e.target.value)}
                className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none tabular-nums w-[108px]"
              />
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeShift('morning')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  shift === 'morning'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sun className="w-3 h-3" />
                {lang === 'hi' ? 'सुबह' : 'AM'}
              </button>
              <button
                type="button"
                onClick={() => onChangeShift('evening')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  shift === 'evening'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="w-3 h-3" />
                {lang === 'hi' ? 'शाम' : 'PM'}
              </button>
            </div>
          </div>

          {/* Right side: Today's saved sale totals */}
          <div className="flex items-center gap-2 text-[11px] bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg tabular-nums">
            <span className="text-slate-600">
              {lang === 'hi' ? 'आज बिक्री:' : 'Sold:'}{' '}
              <strong className="text-slate-900">{formatNumber(saleSummary.totalLiters, 2)}L</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-blue-800 font-bold">
              {formatCurrency(saleSummary.totalNetReceivable)}
            </span>
          </div>
        </div>

        {/* Row 2: ALWAYS-VISIBLE LIVE SALE BAR (FAT, SNF, Qty, Rate/L, Total Amount) */}
        <div
          data-testid="live-sale-preview"
          className="bg-slate-900 text-white rounded-xl p-2 mb-2"
        >
          <div className="grid grid-cols-5 gap-1 text-center items-center tabular-nums">
            <div className="bg-slate-800/90 rounded-lg py-1 px-1">
              <span className="text-[9px] text-slate-400 block leading-tight">
                {milkType === 'cow' ? 'गाय' : milkType === 'buffalo' ? 'भैंस' : 'मिश्रित'} · FAT
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">
                {hasValidFat ? fatNum.toFixed(1) : '—'}
              </span>
            </div>
            <div className="bg-slate-800/90 rounded-lg py-1 px-1">
              <span className="text-[9px] text-slate-400 block leading-tight">SNF</span>
              <span className="text-xs sm:text-sm font-bold text-white">
                {hasValidSnf ? snfNum.toFixed(1) : '—'}
              </span>
            </div>
            <div className="bg-slate-800/90 rounded-lg py-1 px-1">
              <span className="text-[9px] text-slate-400 block leading-tight">
                {lang === 'hi' ? 'मात्रा (L)' : 'Qty (L)'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">
                {hasValidLiters ? formatNumber(litersNum, 3) : '—'}
              </span>
            </div>
            <div className="bg-blue-950/90 border border-blue-700 rounded-lg py-1 px-1">
              <span className="text-[9px] text-blue-300 block leading-tight">
                {lang === 'hi' ? 'रेट / L' : 'Rate/L'}
              </span>
              <span
                data-testid="live-sale-rate-value"
                className="text-xs sm:text-sm font-extrabold text-amber-300"
              >
                {liveRate !== null ? `₹${liveRate.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="bg-emerald-950/90 border border-emerald-600 rounded-lg py-1 px-1">
              <span className="text-[9px] text-emerald-300 block leading-tight">
                {lang === 'hi' ? 'कुल रकम' : 'Total ₹'}
              </span>
              <span
                data-testid="live-sale-total-amount"
                className="text-xs sm:text-sm font-extrabold text-emerald-300"
              >
                {liveNetReceivable !== null ? `₹${liveNetReceivable.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          {!isManualRate && hasValidFat && hasValidSnf && !chartLookup.found && (
            <div className="mt-1.5 px-2 py-1 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              <span className="truncate">
                {lang === 'hi' ? chartLookup.warningHi : chartLookup.warningEn}
              </span>
            </div>
          )}
        </div>

        {/* Row 3 & 4: Compact Sale Entry Form */}
        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Buyer Name + Milk Type side-by-side */}
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-7 sm:col-span-8">
              <label htmlFor="sale-buyer" className="block text-[10px] font-bold text-slate-600 mb-0.5">
                {lang === 'hi' ? 'खरीदार / डेयरी का नाम *' : 'Buyer / Dairy Name *'}
              </label>
              <input
                id="sale-buyer"
                type="text"
                placeholder={lang === 'hi' ? 'जैसे मुख्य चिलिंग प्लांट' : 'e.g. Chilling Plant'}
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="col-span-5 sm:col-span-4">
              <div className="flex items-center justify-between mb-0.5">
                <label htmlFor="sale-milk-type" className="text-[10px] font-bold text-slate-600">
                  {lang === 'hi' ? 'प्रकार' : 'Type'}
                </label>
                <button
                  type="button"
                  onClick={() => setIsManualRate((prev) => !prev)}
                  className="text-[10px] font-bold text-blue-600 hover:underline"
                >
                  {isManualRate
                    ? lang === 'hi'
                      ? 'चार्ट रेट लें'
                      : 'Chart Rate'
                    : lang === 'hi'
                    ? 'Manual रेट'
                    : 'Manual Rate'}
                </button>
              </div>
              <select
                id="sale-milk-type"
                value={milkType}
                onChange={(e) => setMilkType(e.target.value as SaleMilkType)}
                className="w-full h-9 px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="mixed">{lang === 'hi' ? 'मिश्रित (Mixed)' : 'Mixed'}</option>
                <option value="cow">{lang === 'hi' ? 'गाय (Cow)' : 'Cow'}</option>
                <option value="buffalo">{lang === 'hi' ? 'भैंस (Buffalo)' : 'Buffalo'}</option>
              </select>
            </div>
          </div>

          {/* FAT + SNF + Quantity + Rate all side-by-side in ONE row on mobile */}
          <div className="grid grid-cols-4 gap-1.5">
            <div>
              <label htmlFor="sale-fat" className="block text-[10px] font-bold text-slate-700 mb-0.5">
                {lang === 'hi' ? '1. FAT' : '1. FAT'}
              </label>
              <input
                ref={fatInputRef}
                id="sale-fat"
                type="text"
                inputMode="decimal"
                placeholder="45→4.5"
                value={fatStr}
                onChange={handleFatChange}
                className="w-full h-10 px-2 py-1 text-sm font-bold font-mono text-center border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="sale-snf" className="block text-[10px] font-bold text-slate-700 mb-0.5">
                {lang === 'hi' ? '2. SNF' : '2. SNF'}
              </label>
              <input
                ref={snfInputRef}
                id="sale-snf"
                type="text"
                inputMode="decimal"
                placeholder="85→8.5"
                value={snfStr}
                onChange={handleSnfChange}
                className="w-full h-10 px-2 py-1 text-sm font-bold font-mono text-center border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="sale-liters" className="block text-[10px] font-bold text-slate-700 mb-0.5">
                {lang === 'hi' ? '3. मात्रा (L)' : '3. Qty (L)'}
              </label>
              <input
                ref={litersInputRef}
                id="sale-liters"
                type="number"
                step="0.001"
                min="0"
                placeholder="100"
                value={litersStr}
                onChange={(e) => setLitersStr(e.target.value)}
                className="w-full h-10 px-2 py-1 text-sm font-bold font-mono text-center border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="sale-rate" className="block text-[10px] font-bold text-slate-700 mb-0.5">
                {lang === 'hi' ? '4. रेट/L (₹)' : '4. Rate/L'}
              </label>
              {isManualRate ? (
                <input
                  ref={rateInputRef}
                  id="sale-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="45.00"
                  value={manualRateStr}
                  onChange={(e) => setManualRateStr(e.target.value)}
                  className="w-full h-10 px-2 py-1 text-sm font-bold font-mono text-center border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 tabular-nums"
                />
              ) : (
                <div className="w-full h-10 px-2 py-1 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-lg flex items-center justify-center tabular-nums text-blue-800">
                  {liveRate !== null ? `₹${liveRate.toFixed(2)}` : 'चार्ट'}
                </div>
              )}
            </div>
          </div>

          {formError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Action Row: Live Rate/Total pill + Save Button + Options Toggle */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs tabular-nums">
              <div>
                <span className="text-[10px] text-slate-500 block leading-none">
                  {lang === 'hi' ? 'बिक्री रेट/L' : 'Sale Rate'}
                </span>
                <strong className="text-blue-800 text-xs sm:text-sm">
                  {liveRate !== null ? `₹${liveRate.toFixed(2)}` : '—'}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block leading-none">
                  {lang === 'hi' ? 'कुल प्राप्त रकम' : 'Net Amount'}
                </span>
                <strong className="text-emerald-700 text-xs sm:text-sm">
                  {liveNetReceivable !== null ? `₹${liveNetReceivable.toFixed(2)}` : '—'}
                </strong>
              </div>
            </div>

            <button
              type="submit"
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              {editingId
                ? lang === 'hi'
                  ? 'अपडेट करें'
                  : 'Update'
                : lang === 'hi'
                ? 'बिक्री सेव करें'
                : 'Save Sale'}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="h-10 px-2.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shrink-0"
              >
                {lang === 'hi' ? 'रद्द' : 'Cancel'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowExtraSaleFields((p) => !p)}
              title={lang === 'hi' ? 'अन्य खर्च / नोट्स / सेटिंग' : 'Other Charges / Notes'}
              className={`h-10 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1 shrink-0 ${
                showExtraSaleFields || otherChargesNum > 0 || notes
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{lang === 'hi' ? 'विकल्प' : 'More'}</span>
            </button>
          </div>

          {/* Collapsible Extra Sale Options (Other Charges, Notes, Auto-Decimal) */}
          {showExtraSaleFields && (
            <div className="pt-2 mt-1 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="sale-charges" className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    {lang === 'hi' ? 'अन्य खर्च / कटौती (₹)' : 'Other Charges (₹)'}
                  </label>
                  <input
                    id="sale-charges"
                    type="number"
                    step="0.01"
                    min="0"
                    value={otherChargesStr}
                    onChange={(e) => setOtherChargesStr(e.target.value)}
                    className="w-full h-8 px-2 text-xs font-mono border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="sale-notes" className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    {lang === 'hi' ? 'नोट्स / वाहन नं.' : 'Notes / Vehicle'}
                  </label>
                  <input
                    id="sale-notes"
                    type="text"
                    placeholder={lang === 'hi' ? 'वैकल्पिक नोट' : 'Optional note'}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-8 px-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] bg-slate-50 px-2.5 py-1.5 rounded-lg">
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDecimalFatSnf}
                    onChange={(e) => setAutoDecimalFatSnf(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600"
                  />
                  <span>
                    {lang === 'hi' ? 'FAT/SNF ऑटो दशमलव (45→4.5)' : 'Auto-Decimal FAT/SNF'}
                  </span>
                </label>
              </div>
            </div>
          )}
        </form>

        {/* Saved Wholesale Sales Table below form */}
        <div className="mt-6 pt-5 border-t border-slate-100 overflow-x-auto">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            {lang === 'hi'
              ? `इस तारीख की सेव की गई थोक बिक्री (${date})`
              : `Saved Wholesale Sales for ${date}`}
          </h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <th className="py-2.5 px-3 text-left">#</th>
                <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'शिफ्ट' : 'Shift'}</th>
                <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'खरीदार' : 'Buyer'}</th>
                <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'प्रकार' : 'Type'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'लीटर' : 'Liters'}</th>
                <th className="py-2.5 px-3 text-right">FAT / SNF</th>
                <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'रेट' : 'Rate'}</th>
                <th className="py-2.5 px-3 text-right">
                  {lang === 'hi' ? 'अंतिम प्राप्त राशि' : 'Net Amount'}
                </th>
                <th className="py-2.5 px-3 text-center">{lang === 'hi' ? 'कार्य' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {daySales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">
                    {lang === 'hi'
                      ? 'इस तारीख के लिए कोई थोक बिक्री दर्ज नहीं है।'
                      : 'No wholesale sales recorded for this date.'}
                  </td>
                </tr>
              ) : (
                daySales.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">{idx + 1}</td>
                    <td className="py-2.5 px-3">{s.shift === 'morning' ? 'सुबह' : 'शाम'}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{s.buyerName}</td>
                    <td className="py-2.5 px-3">
                      {s.milkType === 'cow' ? 'गाय' : s.milkType === 'buffalo' ? 'भैंस' : 'मिश्रित'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      {formatNumber(s.liters, 3)} L
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatNumber(s.avgFat)} / {formatNumber(s.avgSnf)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatCurrency(s.rate)}{' '}
                      <span className="text-[10px] text-slate-400">
                        ({s.isManualRate ? 'Manual' : 'Chart'})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                      {formatCurrency(s.netReceivable)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(s)}
                          className="min-h-[32px] px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded-lg"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(s.id)}
                          className="min-h-[32px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 tabular-nums">
                <td colSpan={4} className="py-3 px-3">
                  {lang === 'hi'
                    ? `कुल थोक बिक्री योग (${saleSummary.entryCount} एंट्री)`
                    : `Total Wholesale Summary (${saleSummary.entryCount})`}
                </td>
                <td className="py-3 px-3 text-right text-blue-800">
                  {formatNumber(saleSummary.totalLiters, 3)} L
                </td>
                <td className="py-3 px-3 text-right">
                  {formatNumber(saleSummary.avgFat)} / {formatNumber(saleSummary.avgSnf)}
                </td>
                <td className="py-3 px-3 text-right">
                  {saleSummary.avgRate !== null ? formatCurrency(saleSummary.avgRate) : '—'}
                </td>
                <td className="py-3 px-3 text-right text-emerald-700">
                  {formatCurrency(saleSummary.totalNetReceivable)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Section 8: Milk Purchase & Sale Reconciliation (दूध खरीद और बिक्री का मिलान एवं लाभ-हानि) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'दूध खरीद और बिक्री का मिलान (Reconciliation & Profit/Loss)'
                  : 'Milk Purchase & Sale Reconciliation'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'बचे हुए दूध को अपने-आप हानि या लाभ नहीं माना जाता — बेचे गए दूध की आनुपातिक खरीद लागत (COGS) से वास्तविक लाभ/हानि निकलती है'
                  : 'Proportional Cost of Goods Sold (COGS) reconciliation; unsold milk is held as Remaining Stock'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setRecScope('full_day')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg ${
                recScope === 'full_day' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {lang === 'hi' ? `पूरा दिन (${date})` : 'Full Day'}
            </button>
            <button
              type="button"
              onClick={() => setRecScope('shift')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg ${
                recScope === 'shift' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {lang === 'hi'
                ? `केवल ${shift === 'morning' ? 'सुबह' : 'शाम'} की शिफ्ट`
                : `Current Shift Only`}
            </button>
          </div>
        </div>

        {/* Reconciliation Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '1. किसानों से कुल खरीदा दूध' : '1. Total Milk Purchased'}
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
              {formatNumber(mainRec.purchasedLiters, 3)} L
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'खरीद राशि:' : 'Cost:'} {formatCurrency(mainRec.purchaseAmount)}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '2. थोक में कुल बेचा गया दूध' : '2. Total Milk Sold'}
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
              {formatNumber(mainRec.soldLiters, 3)} L
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'शुद्ध बिक्री राशि:' : 'Net Sale:'}{' '}
              {formatCurrency(mainRec.netSaleAmount)}
            </span>
          </div>

          <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-100">
            <span className="text-xs text-blue-900 block">
              {lang === 'hi' ? '3. बचा हुआ दूध (बचा स्टॉक)' : '3. Remaining Milk Stock'}
            </span>
            <span className="text-base font-bold text-blue-900 tabular-nums mt-1 block">
              {mainRec.remainingStockLiters !== null
                ? `${formatNumber(mainRec.remainingStockLiters, 3)} L`
                : lang === 'hi'
                ? 'स्टॉक मिलान बाकी'
                : 'Stock match pending'}
            </span>
            <span className="text-[11px] text-blue-700 tabular-nums">
              {mainRec.remainingStockCostValue !== null
                ? `लागत मूल्य: ${formatCurrency(mainRec.remainingStockCostValue)}`
                : '—'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '4. बेचे गए दूध की वास्तविक लागत' : '4. Cost of Sold Milk (COGS)'}
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
              {mainRec.costOfSoldMilk !== null ? formatCurrency(mainRec.costOfSoldMilk) : '—'}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'सकल लाभ/हानि:' : 'Gross P/L:'}{' '}
              {mainRec.grossProfitLoss !== null ? formatCurrency(mainRec.grossProfitLoss) : '—'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? '5. शुद्ध लाभ / हानि (Net P/L)' : '5. Net Profit / Loss'}
            </span>
            <span
              className={`text-base font-bold tabular-nums mt-1 block ${
                mainRec.status === 'calculated'
                  ? (mainRec.netProfitLoss ?? 0) >= 0
                    ? 'text-emerald-700'
                    : 'text-red-600'
                  : 'text-amber-700'
              }`}
            >
              {mainRec.status === 'calculated'
                ? formatCurrency(mainRec.netProfitLoss)
                : lang === 'hi'
                ? mainRec.statusLabelHi
                : mainRec.statusLabelEn}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'अन्य खर्च:' : 'Expenses:'} {formatCurrency(mainRec.expensesAmount)}
            </span>
          </div>
        </div>

        {/* Accounting Method Explanation Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-800">
              {lang === 'hi' ? 'लागत एवं लाभ-हानि गणना पद्धति:' : 'Accounting Cost Basis:'}
            </strong>{' '}
            {lang === 'hi'
              ? 'बेचे गए दूध की लागत = बेचे गए लीटर × उस शिफ्ट/दिन का भारित औसत खरीद रेट। सकल लाभ/हानि = शुद्ध बिक्री राशि − बेचे गए दूध की लागत। शुद्ध लाभ/हानि = सकल लाभ/हानि − संबंधित खर्च। बचे हुए दूध को बचा हुआ स्टॉक दिखाया जाता है, उसे हानि नहीं माना जाता।'
              : 'Cost of Sold Milk = Sold Liters × Weighted Avg Purchase Rate. Gross Profit/Loss = Net Sale Amount − Cost of Sold Milk. Remaining milk is valued at cost as Remaining Stock.'}
          </div>
        </div>

        {/* Separate Cow vs Buffalo Stock Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-3.5 rounded-xl border border-slate-200 text-xs">
            <h4 className="font-bold text-slate-900 mb-1">
              {lang === 'hi' ? 'गाय के दूध का मिलान (Cow Milk)' : 'Cow Milk Breakdown'}
            </h4>
            <p className="text-slate-600 tabular-nums">
              {lang === 'hi' ? 'कुल खरीदा:' : 'Purchased:'}{' '}
              <strong>{formatNumber(cowRec.purchasedLiters, 3)} L</strong> (
              {formatCurrency(cowRec.purchaseAmount)}) ·{' '}
              {lang === 'hi' ? 'सीधी गाय बिक्री:' : 'Direct Cow Sold:'}{' '}
              <strong>{formatNumber(cowRec.soldLiters, 3)} L</strong>
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 text-xs">
            <h4 className="font-bold text-slate-900 mb-1">
              {lang === 'hi' ? 'भैंस के दूध का मिलान (Buffalo Milk)' : 'Buffalo Milk Breakdown'}
            </h4>
            <p className="text-slate-600 tabular-nums">
              {lang === 'hi' ? 'कुल खरीदा:' : 'Purchased:'}{' '}
              <strong>{formatNumber(buffaloRec.purchasedLiters, 3)} L</strong> (
              {formatCurrency(buffaloRec.purchaseAmount)}) ·{' '}
              {lang === 'hi' ? 'सीधी भैंस बिक्री:' : 'Direct Buffalo Sold:'}{' '}
              <strong>{formatNumber(buffaloRec.soldLiters, 3)} L</strong>
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title={lang === 'hi' ? 'थोक बिक्री रिकॉर्ड हटाएँ?' : 'Delete Wholesale Sale?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस थोक बिक्री एंट्री को हटाना चाहते हैं? इससे लाभ-हानि और मिलान के आँकड़े तुरंत दोबारा गणना हो जाएँगे।'
            : 'Are you sure you want to delete this wholesale sale entry?'
        }
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            onDeleteSale(deleteTargetId);
            if (editingId === deleteTargetId) resetForm();
          }
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
};
