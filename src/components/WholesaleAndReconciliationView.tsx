import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Edit2,
  Info,
  MessageSquare,
  Moon,
  Plus,
  Printer,
  Scale,
  Search,
  Settings2,
  Sun,
  Trash2,
  TrendingUp,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Customer,
  DairyAppState,
  MilkType,
  SaleMilkType,
  ShiftType,
  WholesaleSaleEntry,
} from '../types/dairy';
import {
  calculatePureProfitLoss,
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
  onSaveCustomer?: (customer: Customer, isEdit: boolean) => void;
  onDeleteCustomer?: (id: string) => void;
}

export const WholesaleAndReconciliationView: React.FC<
  WholesaleAndReconciliationViewProps
> = ({
  state,
  onChangeDate,
  onChangeShift,
  onSaveSale,
  onDeleteSale,
  onSaveCustomer,
  onDeleteCustomer,
}) => {
  const lang = state.language;
  const date = state.selectedDate;
  const shift = state.selectedShift;

  // Active Sub-view: sale_entry (दूध बिक्री) | customers (ग्राहक सूची) | reconciliation (आवक-जावक मिलान)
  const [activeSubView, setActiveSubView] = useState<'sale_entry' | 'customers' | 'reconciliation'>('sale_entry');

  // Sale Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [buyerName, setBuyerName] = useState<string>('');
  const [milkType, setMilkType] = useState<SaleMilkType>('cow');
  const [litersStr, setLitersStr] = useState<string>('');
  const [fatStr, setFatStr] = useState<string>('');
  const [snfStr, setSnfStr] = useState<string>('');
  // Rate chart active by default!
  const [isManualRate, setIsManualRate] = useState<boolean>(false);
  const [manualRateStr, setManualRateStr] = useState<string>('');
  const [otherChargesStr, setOtherChargesStr] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [showExtraSaleFields, setShowExtraSaleFields] = useState<boolean>(false);
  const [autoDecimalFatSnf, setAutoDecimalFatSnf] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Quick Customer Modal State
  const [showCustomerModal, setShowCustomerModal] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custName, setCustName] = useState<string>('');
  const [custCode, setCustCode] = useState<string>('');
  const [custMobile, setCustMobile] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custMilkType, setCustMilkType] = useState<MilkType | 'mixed'>('cow');
  const [custModalError, setCustModalError] = useState<string | null>(null);
  const [deleteCustId, setDeleteCustId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState<string>('');

  // Sale Slip Modal State
  const [saleSlipEntry, setSaleSlipEntry] = useState<WholesaleSaleEntry | null>(null);

  const fatInputRef = useRef<HTMLInputElement | null>(null);
  const snfInputRef = useRef<HTMLInputElement | null>(null);
  const litersInputRef = useRef<HTMLInputElement | null>(null);
  const rateInputRef = useRef<HTMLInputElement | null>(null);

  // Reconciliation scope
  const [recScope, setRecScope] = useState<'shift' | 'full_day'>('full_day');

  // Customer list from state (defaulting to empty array)
  const customers = state.customers || [];

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

  // Rate chart lookup logic: Cow vs Buffalo rate chart
  const effectiveChartType: 'cow' | 'buffalo' =
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

  // Auto-decimal FAT change with auto-focus jump to SNF
  const handleFatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!autoDecimalFatSnf) {
      setFatStr(raw);
      return;
    }
    const { value, completed } = formatAutoDecimalFatSnf(raw, fatStr);
    setFatStr(value);
    if (completed && snfInputRef.current) {
      snfInputRef.current.focus();
      snfInputRef.current.select();
    }
  };

  // Auto-decimal SNF change with auto-focus jump to Liters
  const handleSnfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!autoDecimalFatSnf) {
      setSnfStr(raw);
      return;
    }
    const { value, completed } = formatAutoDecimalFatSnf(raw, snfStr);
    setSnfStr(value);
    if (completed && litersInputRef.current) {
      litersInputRef.current.focus();
      litersInputRef.current.select();
    }
  };

  // Customer dropdown select
  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    if (!custId) {
      return;
    }
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setBuyerName(cust.name);
      if (cust.defaultMilkType) {
        setMilkType(cust.defaultMilkType);
      }
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setSelectedCustomerId('');
    setBuyerName('');
    setMilkType('cow');
    setLitersStr('');
    setFatStr('');
    setSnfStr('');
    setIsManualRate(false);
    setManualRateStr('');
    setOtherChargesStr('0');
    setNotes('');
    setShowExtraSaleFields(false);
    setFormError(null);
  };

  const handleEdit = (entry: WholesaleSaleEntry) => {
    setEditingId(entry.id);
    setActiveSubView('sale_entry');
    onChangeDate(entry.date);
    onChangeShift(entry.shift);
    setSelectedCustomerId(entry.customerId || '');
    setBuyerName(entry.buyerName);
    setMilkType(entry.milkType);
    setLitersStr(String(entry.liters));
    setFatStr(String(entry.avgFat));
    setSnfStr(String(entry.avgSnf));
    setIsManualRate(entry.isManualRate);
    setManualRateStr(String(entry.rate));
    setOtherChargesStr(String(entry.otherCharges || 0));
    setNotes(entry.notes || '');
    setShowExtraSaleFields((entry.otherCharges || 0) > 0 || Boolean(entry.notes));
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nameToSave = buyerName.trim();
    if (!nameToSave) {
      setFormError(
        lang === 'hi'
          ? 'कृपया ग्राहक या खरीदार का नाम दर्ज करें या चुनें।'
          : 'Please enter or select a customer/buyer name.'
      );
      return;
    }
    if (!hasValidLiters || !hasValidFat || !hasValidSnf) {
      setFormError(
        lang === 'hi'
          ? 'कृपया कुल लीटर, FAT और SNF सही दर्ज करें।'
          : 'Please enter valid Liters, FAT, and SNF.'
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
    const selectedCust = customers.find((c) => c.id === selectedCustomerId);

    const entry: WholesaleSaleEntry = {
      id: editingId || `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date,
      time: existing ? existing.time : now.toTimeString().slice(0, 8),
      shift,
      customerId: selectedCustomerId || undefined,
      customerCode: selectedCust?.code || undefined,
      buyerName: nameToSave,
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

  // Open Add / Edit Customer Modal
  const handleOpenAddCustomerModal = (customerToEdit?: Customer) => {
    if (customerToEdit) {
      setEditingCustomer(customerToEdit);
      setCustName(customerToEdit.name);
      setCustCode(customerToEdit.code);
      setCustMobile(customerToEdit.mobile);
      setCustAddress(customerToEdit.address);
      setCustMilkType(customerToEdit.defaultMilkType || 'cow');
    } else {
      setEditingCustomer(null);
      setCustName(buyerName.trim());
      // Auto suggest next customer code like C01, C02...
      const nextNum = customers.length + 1;
      const suggestedCode = `C${String(nextNum).padStart(2, '0')}`;
      setCustCode(suggestedCode);
      setCustMobile('');
      setCustAddress('');
      setCustMilkType(milkType);
    }
    setCustModalError(null);
    setShowCustomerModal(true);
  };

  const handleSaveCustomerModal = (e: React.FormEvent) => {
    e.preventDefault();
    setCustModalError(null);

    const trimmedName = custName.trim();
    const trimmedCode = custCode.trim();
    if (!trimmedName) {
      setCustModalError(lang === 'hi' ? 'कृपया ग्राहक का नाम दर्ज करें।' : 'Please enter customer name.');
      return;
    }
    if (!trimmedCode) {
      setCustModalError(lang === 'hi' ? 'कृपया ग्राहक कोड/क्रमांक दर्ज करें।' : 'Please enter customer code.');
      return;
    }

    // Check duplicate code
    const isDupCode = customers.some(
      (c) => c.code.toLowerCase() === trimmedCode.toLowerCase() && c.id !== editingCustomer?.id
    );
    if (isDupCode) {
      setCustModalError(
        lang === 'hi'
          ? `ग्राहक कोड "${trimmedCode}" पहले से किसी अन्य ग्राहक के पास है।`
          : `Customer code "${trimmedCode}" is already taken.`
      );
      return;
    }

    const newCustomer: Customer = {
      id: editingCustomer?.id || `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      code: trimmedCode,
      name: trimmedName,
      mobile: custMobile.trim(),
      address: custAddress.trim(),
      defaultMilkType: custMilkType,
      active: true,
      createdAt: editingCustomer?.createdAt || new Date().toISOString(),
    };

    if (onSaveCustomer) {
      onSaveCustomer(newCustomer, Boolean(editingCustomer));
    }

    // Auto-select this newly created/edited customer in the sale form
    setSelectedCustomerId(newCustomer.id);
    setBuyerName(newCustomer.name);
    if (newCustomer.defaultMilkType) {
      setMilkType(newCustomer.defaultMilkType);
    }
    setShowCustomerModal(false);
  };

  // Filtered sales for current date
  const daySales = state.sales.filter((s) => s.date === date);
  const saleSummary = calculateSaleSummary(daySales);

  // Pure profit/loss for today
  const dayCollections = state.collections.filter((c) => c.date === date);
  const pureDayPL = calculatePureProfitLoss(dayCollections, daySales);

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

  // Filtered customers list
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.mobile.includes(q) ||
      c.address.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Top Navigation Tabs inside Milk Sales: 
          1. दूध बिक्री एंट्री (Sale Entry)
          2. ग्राहक सूची (Customer List)
          3. आवक-जावक मिलान (Reconciliation) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubView('sale_entry')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeSubView === 'sale_entry'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Truck className="w-4 h-4" />
            {lang === 'hi' ? 'दूध बिक्री एंट्री (Milk Sale)' : 'Milk Sale Entry'}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('customers')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeSubView === 'customers'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            {lang === 'hi' ? `ग्राहक सूची (${customers.length})` : `Customers (${customers.length})`}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('reconciliation')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeSubView === 'reconciliation'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-4 h-4" />
            {lang === 'hi' ? 'दूध आवक-जावक मिलान' : 'Milk Reconciliation'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleOpenAddCustomerModal()}
          className="min-h-[40px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs"
        >
          <UserPlus className="w-4 h-4" />
          {lang === 'hi' ? '+ नया ग्राहक जोड़ें' : '+ Add Customer'}
        </button>
      </div>

      {/* ========================================================================
          SUBVIEW 1: MILK SALE ENTRY (दूध बिक्री एंट्री)
         ======================================================================== */}
      {activeSubView === 'sale_entry' && (
        <div className="space-y-3 sm:space-y-5">
          {/* ULTRA-COMPACT TOP WHOLESALE MILK SALE COCKPIT (ABOVE MOBILE KEYBOARD) */}
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

              {/* Right side: Today's saved sale totals + Pure Profit/Loss Preview */}
              <div className="flex items-center gap-2 text-[11px] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg tabular-nums">
                <span className="text-slate-600">
                  {lang === 'hi' ? 'आज बिक्री:' : 'Sold:'}{' '}
                  <strong className="text-slate-900">{formatNumber(saleSummary.totalLiters, 2)}L</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-blue-800 font-bold">
                  {formatCurrency(saleSummary.totalNetReceivable)}
                </span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span
                  className={`hidden sm:inline font-bold ${
                    pureDayPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {pureDayPL.isProfit ? 'लाभ' : 'हानि'}:{' '}
                  {pureDayPL.netDifference >= 0
                    ? `+${formatCurrency(pureDayPL.netDifference)}`
                    : formatCurrency(pureDayPL.netDifference)}
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

            {/* Row 3: Compact Sale Entry Form */}
            <form onSubmit={handleSubmit} className="space-y-2">
              {/* Customer Selector & Quick Add Customer Button */}
              <div className="grid grid-cols-12 gap-1.5">
                <div className="col-span-8 sm:col-span-8">
                  <div className="flex items-center justify-between mb-0.5">
                    <label htmlFor="sale-customer-select" className="text-[10px] font-bold text-slate-700">
                      {lang === 'hi' ? 'ग्राहक चुनें या नाम लिखें *' : 'Select Customer or Enter Name *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleOpenAddCustomerModal()}
                      className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      {lang === 'hi' ? 'नया ग्राहक' : 'New Customer'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {customers.length > 0 ? (
                      <select
                        id="sale-customer-select"
                        value={selectedCustomerId}
                        onChange={(e) => handleSelectCustomer(e.target.value)}
                        className="w-1/2 h-9 px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">{lang === 'hi' ? '-- ग्राहक चुनें --' : '-- Select Customer --'}</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name} {c.mobile ? `(${c.mobile})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    <input
                      id="sale-buyer"
                      type="text"
                      placeholder={
                        customers.length > 0
                          ? lang === 'hi'
                            ? 'या अन्य ग्राहक/डेयरी का नाम'
                            : 'Or enter buyer name'
                          : lang === 'hi'
                          ? 'ग्राहक/डेयरी का नाम दर्ज करें'
                          : 'Enter buyer / customer name'
                      }
                      value={buyerName}
                      onChange={(e) => {
                        setBuyerName(e.target.value);
                        if (selectedCustomerId) setSelectedCustomerId('');
                      }}
                      className={`${
                        customers.length > 0 ? 'w-1/2' : 'w-full'
                      } h-9 px-2.5 py-1 text-xs sm:text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600`}
                    />
                  </div>
                </div>

                {/* Milk Type (Cow/Buffalo/Mixed) + Rate Mode (Chart vs Manual) */}
                <div className="col-span-4 sm:col-span-4">
                  <div className="flex items-center justify-between mb-0.5">
                    <label htmlFor="sale-milk-type" className="text-[10px] font-bold text-slate-700">
                      {lang === 'hi' ? 'प्रकार' : 'Type'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManualRate((prev) => !prev)}
                      className={`text-[10px] font-bold ${
                        isManualRate ? 'text-amber-700 underline' : 'text-blue-700 underline'
                      }`}
                    >
                      {isManualRate
                        ? lang === 'hi'
                          ? 'चार्ट रेट लें'
                          : 'Use Chart Rate'
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
                    <option value="cow">{lang === 'hi' ? 'गाय (Cow)' : 'Cow'}</option>
                    <option value="buffalo">{lang === 'hi' ? 'भैंस (Buffalo)' : 'Buffalo'}</option>
                    <option value="mixed">{lang === 'hi' ? 'मिश्रित (Mixed)' : 'Mixed'}</option>
                  </select>
                </div>
              </div>

              {/* FAT + SNF + Quantity + Rate/L: ALL IN ONE ROW (Mobile friendly, never hidden by keyboard) */}
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
                    placeholder="10"
                    value={litersStr}
                    onChange={(e) => setLitersStr(e.target.value)}
                    className="w-full h-10 px-2 py-1 text-sm font-bold font-mono text-center border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="sale-rate" className="block text-[10px] font-bold text-slate-700 mb-0.5">
                    {isManualRate
                      ? lang === 'hi'
                        ? '4. Manual दर'
                        : '4. Manual Rate'
                      : lang === 'hi'
                      ? '4. चार्ट दर (₹)'
                      : '4. Chart Rate'}
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
                      className="w-full h-10 px-2 py-1 text-sm font-bold font-mono text-center border-2 border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-amber-600 tabular-nums"
                    />
                  ) : (
                    <div className="w-full h-10 px-1 py-1 text-xs font-bold font-mono bg-blue-50 border-2 border-blue-300 rounded-lg flex items-center justify-center tabular-nums text-blue-900">
                      {liveRate !== null ? `₹${liveRate.toFixed(2)}` : 'चार्ट से'}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons & Optional Extra Fields */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowExtraSaleFields((prev) => !prev)}
                  className="text-[11px] font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1"
                >
                  <Settings2 className="w-3 h-3" />
                  {showExtraSaleFields
                    ? lang === 'hi'
                      ? 'अतिरिक्त विवरण छुपाएँ'
                      : 'Hide Details'
                    : lang === 'hi'
                    ? '+ छूट/अन्य शुल्क व नोट'
                    : '+ Charges & Note'}
                </button>

                <div className="flex items-center gap-1.5">
                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="min-h-[36px] px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                    >
                      {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                    </button>
                  )}
                  <button
                    data-testid="save-sale-btn"
                    type="submit"
                    className="min-h-[38px] px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {editingId
                      ? lang === 'hi'
                        ? 'बिक्री अपडेट करें'
                        : 'Update Sale'
                      : lang === 'hi'
                      ? 'बिक्री सेव करें'
                      : 'Save Sale'}
                  </button>
                </div>
              </div>

              {formError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Collapsible extra fields */}
              {showExtraSaleFields && (
                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label htmlFor="sale-other-charges" className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      {lang === 'hi' ? 'अन्य शुल्क/छूट (₹)' : 'Other Charges / Deduction (₹)'}
                    </label>
                    <input
                      id="sale-other-charges"
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
              )}
            </form>
          </div>

          {/* Saved Sales Table for selected date */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? `इस तारीख की सेव की गई दूध बिक्री (${date})`
                    : `Saved Milk Sales for ${date}`}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-slate-600">कुल बिक्री:</span>
                <strong className="text-blue-900 font-bold">{formatNumber(saleSummary.totalLiters, 3)} L</strong>
                <span className="text-slate-300">|</span>
                <strong className="text-emerald-700 font-bold">{formatCurrency(saleSummary.totalNetReceivable)}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 text-left">#</th>
                    <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'शिफ्ट' : 'Shift'}</th>
                    <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'ग्राहक / खरीदार' : 'Customer'}</th>
                    <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'प्रकार' : 'Type'}</th>
                    <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'लीटर' : 'Liters'}</th>
                    <th className="py-2.5 px-3 text-right">FAT / SNF</th>
                    <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'दर (Rate)' : 'Rate'}</th>
                    <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'कुल राशि' : 'Total Amount'}</th>
                    <th className="py-2.5 px-3 text-center">{lang === 'hi' ? 'कार्य' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {daySales.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500">
                        {lang === 'hi'
                          ? 'इस तारीख के लिए कोई दूध बिक्री दर्ज नहीं है।'
                          : 'No milk sales recorded for this date.'}
                      </td>
                    </tr>
                  ) : (
                    daySales.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              s.shift === 'morning' ? 'bg-amber-100 text-amber-900' : 'bg-indigo-100 text-indigo-900'
                            }`}
                          >
                            {s.shift === 'morning' ? 'सुबह' : 'शाम'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {s.customerCode ? <span className="font-mono text-blue-700 mr-1.5">{s.customerCode}</span> : null}
                          {s.buyerName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              s.milkType === 'cow'
                                ? 'bg-amber-50 text-amber-900'
                                : s.milkType === 'buffalo'
                                ? 'bg-blue-50 text-blue-900'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {s.milkType === 'cow' ? 'गाय' : s.milkType === 'buffalo' ? 'भैंस' : 'मिश्रित'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
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
                              onClick={() => setSaleSlipEntry(s)}
                              title={lang === 'hi' ? 'बिक्री रसीद प्रिंट' : 'Print Slip'}
                              className="min-h-[30px] px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold flex items-center gap-1"
                            >
                              <Printer className="w-3 h-3" />
                              <span className="hidden sm:inline">पर्ची</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(s)}
                              title={lang === 'hi' ? 'एडिट करें' : 'Edit'}
                              className="min-h-[30px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTargetId(s.id)}
                              title={lang === 'hi' ? 'डिलीट करें' : 'Delete'}
                              className="min-h-[30px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                            >
                              <Trash2 className="w-3 h-3" />
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
                        ? `कुल बिक्री योग (${saleSummary.entryCount} एंट्री)`
                        : `Total Sales Summary (${saleSummary.entryCount})`}
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
        </div>
      )}

      {/* ========================================================================
          SUBVIEW 2: CUSTOMERS LIST & MANAGEMENT (ग्राहक सूची एवं प्रबंधन)
         ======================================================================== */}
      {activeSubView === 'customers' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'hi' ? 'दूध ग्राहक सूची (Customer List)' : 'Milk Customers'}
              </h3>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'डेयरी से दूध खरीदने वाले नियमित ग्राहक, चिलिंग प्लांट या स्वीट हाउस'
                  : 'Manage regular buyers, chilling plants, or sweet shops'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={lang === 'hi' ? 'ग्राहक खोजें...' : 'Search customer...'}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="min-h-[38px] pl-8 pr-3 text-xs border border-slate-300 rounded-xl w-[180px] sm:w-[220px]"
                />
              </div>
              <button
                type="button"
                onClick={() => handleOpenAddCustomerModal()}
                className="min-h-[38px] px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                {lang === 'hi' ? '+ नया ग्राहक' : '+ New Customer'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-left">कोड</th>
                  <th className="py-2.5 px-3 text-left">ग्राहक का नाम</th>
                  <th className="py-2.5 px-3 text-left">मोबाइल नंबर</th>
                  <th className="py-2.5 px-3 text-left">पता / गाँव / डेयरी</th>
                  <th className="py-2.5 px-3 text-left">डिफ़ॉल्ट दूध</th>
                  <th className="py-2.5 px-3 text-right">कुल खरीदा दूध (L)</th>
                  <th className="py-2.5 px-3 text-right">कुल बिक्री राशि (₹)</th>
                  <th className="py-2.5 px-3 text-center">कार्य</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      {customers.length === 0
                        ? lang === 'hi'
                          ? 'अभी कोई ग्राहक नहीं जोड़ा गया है। ऊपर "+ नया ग्राहक जोड़ें" बटन दबाकर ग्राहक जोड़ें।'
                          : 'No customers added yet. Click "+ Add Customer" above to add one.'
                        : lang === 'hi'
                        ? 'कोई ग्राहक नहीं मिला।'
                        : 'No customer matching search.'}
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const custSales = state.sales.filter(
                      (s) => s.customerId === cust.id || s.buyerName.trim() === cust.name.trim()
                    );
                    const totalLiters = round3(custSales.reduce((sum, s) => sum + s.liters, 0));
                    const totalAmount = round2(custSales.reduce((sum, s) => sum + s.netReceivable, 0));

                    return (
                      <tr key={cust.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{cust.code}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{cust.name}</td>
                        <td className="py-2.5 px-3">{cust.mobile || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{cust.address || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100">
                            {cust.defaultMilkType === 'cow'
                              ? 'गाय'
                              : cust.defaultMilkType === 'buffalo'
                              ? 'भैंस'
                              : 'मिश्रित'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatNumber(totalLiters, 3)} L
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                          {formatCurrency(totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(cust.id);
                                setBuyerName(cust.name);
                                if (cust.defaultMilkType) setMilkType(cust.defaultMilkType);
                                setActiveSubView('sale_entry');
                              }}
                              className="min-h-[30px] px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg"
                            >
                              बिक्री करें
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAddCustomerModal(cust)}
                              className="min-h-[30px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteCustId(cust.id)}
                              className="min-h-[30px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================
          SUBVIEW 3: RECONCILIATION & RECONCILIATION CARDS
         ======================================================================== */}
      {activeSubView === 'reconciliation' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? 'दूध खरीद एवं बिक्री आवक-जावक मिलान (Reconciliation)'
                    : 'Milk Collection & Wholesale Sale Reconciliation'}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === 'hi'
                    ? 'दूध की आवक (खरीद), जावक (बिक्री), स्टॉक और लाभ-हानि का सीधा मिलान'
                    : 'Track milk inflow, outflow, remaining stock, and gross margin'}
                </p>
              </div>
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setRecScope('full_day')}
                className={`min-h-[36px] px-3 py-1 rounded-lg font-semibold transition-colors ${
                  recScope === 'full_day' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
                }`}
              >
                {lang === 'hi' ? 'पूरे दिन का मिलान' : 'Full Day'}
              </button>
              <button
                type="button"
                onClick={() => setRecScope('shift')}
                className={`min-h-[36px] px-3 py-1 rounded-lg font-semibold transition-colors ${
                  recScope === 'shift' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
                }`}
              >
                {shift === 'morning'
                  ? lang === 'hi'
                    ? 'केवल सुबह की शिफ्ट'
                    : 'Morning Shift'
                  : lang === 'hi'
                  ? 'केवल शाम की शिफ्ट'
                  : 'Evening Shift'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">
                {lang === 'hi' ? '1. किसानों से कुल खरीदा गया दूध' : '1. Total Purchased Milk'}
              </span>
              <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
                {formatNumber(mainRec.purchasedLiters, 3)} L
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {lang === 'hi' ? 'कुल खरीद लागत:' : 'Total Cost:'}{' '}
                {formatCurrency(mainRec.purchaseAmount)}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">
                {lang === 'hi' ? '2. ग्राहकों को बेचा गया दूध' : '2. Total Milk Sold'}
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
                {lang === 'hi' ? '3. बचा हुआ दूध (स्टॉक)' : '3. Remaining Stock'}
              </span>
              <span className="text-base font-bold text-blue-900 tabular-nums mt-1 block">
                {mainRec.remainingStockLiters !== null
                  ? `${formatNumber(mainRec.remainingStockLiters, 3)} L`
                  : '—'}
              </span>
              <span className="text-[11px] text-blue-700 tabular-nums">
                {mainRec.remainingStockCostValue !== null
                  ? `लागत: ${formatCurrency(mainRec.remainingStockCostValue)}`
                  : '—'}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">
                {lang === 'hi' ? '4. बेचे गए दूध की लागत' : '4. Cost of Sold Milk'}
              </span>
              <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
                {mainRec.costOfSoldMilk !== null ? formatCurrency(mainRec.costOfSoldMilk) : '—'}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {lang === 'hi' ? 'सकल मार्जिन:' : 'Gross Margin:'}{' '}
                {mainRec.grossProfitLoss !== null ? formatCurrency(mainRec.grossProfitLoss) : '—'}
              </span>
            </div>

            <div
              className={`p-3.5 rounded-xl border-2 ${
                pureDayPL.isProfit ? 'bg-emerald-50 border-emerald-400' : 'bg-rose-50 border-rose-400'
              }`}
            >
              <span className="text-xs font-bold text-slate-800 block">
                {lang === 'hi' ? '5. सीधा लाभ/हानि (बिक्री - खरीद)' : '5. Pure P/L (Sale - Purchase)'}
              </span>
              <span
                className={`text-base font-black tabular-nums mt-1 block ${
                  pureDayPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {pureDayPL.netDifference >= 0
                  ? `+${formatCurrency(pureDayPL.netDifference)}`
                  : formatCurrency(pureDayPL.netDifference)}
              </span>
              <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                {pureDayPL.isProfit ? 'शुद्ध लाभ' : 'शुद्ध हानि'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD / EDIT CUSTOMER MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingCustomer
                    ? lang === 'hi'
                      ? 'ग्राहक विवरण एडिट करें'
                      : 'Edit Customer'
                    : lang === 'hi'
                    ? 'नया दूध ग्राहक जोड़ें'
                    : 'Add New Customer'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomerModal} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'ग्राहक कोड *' : 'Customer Code *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="जैसे C01"
                    value={custCode}
                    onChange={(e) => setCustCode(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-mono font-bold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'डिफ़ॉल्ट दूध प्रकार' : 'Default Milk Type'}
                  </label>
                  <select
                    value={custMilkType}
                    onChange={(e) => setCustMilkType(e.target.value as any)}
                    className="w-full h-9 px-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="cow">{lang === 'hi' ? 'गाय (Cow)' : 'Cow'}</option>
                    <option value="buffalo">{lang === 'hi' ? 'भैंस (Buffalo)' : 'Buffalo'}</option>
                    <option value="mixed">{lang === 'hi' ? 'मिश्रित (Mixed)' : 'Mixed'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'ग्राहक / डेयरी का नाम *' : 'Customer / Dairy Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={lang === 'hi' ? 'जैसे राम सिंह (दूध डेयरी)' : 'e.g. Ram Singh Dairy'}
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-semibold border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}
                </label>
                <input
                  type="tel"
                  placeholder="10 अंकों का मोबाइल नंबर"
                  value={custMobile}
                  onChange={(e) => setCustMobile(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'पता / गाँव / प्लांट' : 'Address / Village / Plant'}
                </label>
                <input
                  type="text"
                  placeholder="गाँव या दुकान का पता"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              {custModalError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700">
                  {custModalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  {editingCustomer ? 'अपडेट करें' : 'ग्राहक सेव करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SALE SLIP PRINT MODAL */}
      {saleSlipEntry && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">दूध बिक्री रसीद (Sale Receipt)</h3>
              <button
                type="button"
                onClick={() => setSaleSlipEntry(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs font-mono">
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <strong className="text-sm font-bold block font-sans text-slate-900">
                  {state.dairyName || 'Ujalaa Dairy'}
                </strong>
                <span className="text-[11px] text-slate-600 block">दूध बिक्री रसीद</span>
                <span className="text-[10px] text-slate-500">
                  तारीख: {saleSlipEntry.date} ({saleSlipEntry.shift === 'morning' ? 'सुबह' : 'शाम'})
                </span>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">ग्राहक:</span>
                  <strong className="font-bold text-slate-900">
                    {saleSlipEntry.customerCode ? `[${saleSlipEntry.customerCode}] ` : ''}
                    {saleSlipEntry.buyerName}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">दूध प्रकार:</span>
                  <span>
                    {saleSlipEntry.milkType === 'cow'
                      ? 'गाय (Cow)'
                      : saleSlipEntry.milkType === 'buffalo'
                      ? 'भैंस (Buffalo)'
                      : 'मिश्रित'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">दूध मात्रा (L):</span>
                  <strong className="font-bold text-slate-900">{formatNumber(saleSlipEntry.liters, 3)} L</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">FAT / SNF:</span>
                  <span>
                    {formatNumber(saleSlipEntry.avgFat)} / {formatNumber(saleSlipEntry.avgSnf)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">दर (Rate/L):</span>
                  <span>{formatCurrency(saleSlipEntry.rate)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-dashed border-slate-300 font-bold text-sm text-blue-900">
                  <span>कुल राशि:</span>
                  <span>{formatCurrency(saleSlipEntry.netReceivable)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSaleSlipEntry(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
              >
                बंद करें
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                प्रिंट निकालें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE SALE DIALOG */}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title={lang === 'hi' ? 'दूध बिक्री रिकॉर्ड हटाएँ?' : 'Delete Sale?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस दूध बिक्री एंट्री को हटाना चाहते हैं? इससे लाभ-हानि का हिसाब तुरंत दोबारा गणना हो जाएगा।'
            : 'Are you sure you want to delete this milk sale entry?'
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

      {/* CONFIRM DELETE CUSTOMER DIALOG */}
      <ConfirmDialog
        open={Boolean(deleteCustId)}
        title={lang === 'hi' ? 'ग्राहक रिकॉर्ड हटाएँ?' : 'Delete Customer?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस ग्राहक को सूची से हटाना चाहते हैं? इससे पहले से दर्ज की गई बिक्री सुरक्षित रहेगी।'
            : 'Are you sure you want to delete this customer?'
        }
        onCancel={() => setDeleteCustId(null)}
        onConfirm={() => {
          if (deleteCustId && onDeleteCustomer) {
            onDeleteCustomer(deleteCustId);
            if (selectedCustomerId === deleteCustId) {
              setSelectedCustomerId('');
            }
          }
          setDeleteCustId(null);
        }}
      />
    </div>
  );
};
