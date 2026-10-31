import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Edit2,
  FileText,
  MessageSquare,
  Moon,
  Package,
  Printer,
  RefreshCw,
  Sun,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from 'lucide-react';
import {
  AdvancePaymentEntry,
  CattleFeedEntry,
  DairyAppState,
  Farmer,
  FarmerShiftSchedule,
  MilkType,
  PaymentMethod,
  TenDayBill,
} from '../types/dairy';
import {
  calculateCollectionSummary,
  calculateFarmerLedger,
  calculatePureProfitLoss,
  calculateSaleSummary,
  computeBillSnapshotHash,
  formatCurrency,
  formatDateDMY,
  formatMonthYear,
  formatNumber,
  formatWholeCurrency,
  generateTenDayBillData,
  getAdvancePaymentEffectiveCycle,
  getCycleFromDate,
  getCycleLabelEn,
  getCycleLabelHi,
  getTenDayCycleDates,
  normalizeFarmerShiftSchedule,
  buildAllFarmersTenDayBillRows,
  round2,
  round3,
  sortFarmersByCode,
  truncatePurchaseAmount,
} from '../utils/dairyCalculations';
import { ConfirmDialog, WhatsAppPreviewModal } from './Modals';

export type FarmerSectionSubTab = 'farmers' | 'ledger' | 'advances' | 'feed' | 'billing';

interface FarmersAndLedgerViewProps {
  state: DairyAppState;
  initialSubTab?: FarmerSectionSubTab;
  onSaveFarmer: (farmer: Farmer, isEdit: boolean) => void;
  onDeleteFarmer: (id: string) => void;
  onSaveAdvancePayment: (entry: AdvancePaymentEntry, isEdit: boolean) => void;
  onDeleteAdvancePayment: (id: string) => void;
  onSaveCattleFeed: (entry: CattleFeedEntry, isEdit: boolean) => void;
  onDeleteCattleFeed: (id: string) => void;
  onSaveBill: (bill: TenDayBill) => void;
  onDeleteBill: (id: string) => void;
}

export const FarmersAndLedgerView: React.FC<FarmersAndLedgerViewProps> = ({
  state,
  initialSubTab = 'farmers',
  onSaveFarmer,
  onDeleteFarmer,
  onSaveAdvancePayment,
  onDeleteAdvancePayment,
  onSaveCattleFeed,
  onDeleteCattleFeed,
  onSaveBill,
  onDeleteBill,
}) => {
  const lang = state.language;
  const sortedFarmers = sortFarmersByCode(state.farmers);
  const [subTab, setSubTab] = useState<FarmerSectionSubTab>(initialSubTab);

  // Sync if parent switches tab
  React.useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // 1. Farmer Form State
  const [editingFarmerId, setEditingFarmerId] = useState<string | null>(null);
  const [fCode, setFCode] = useState<string>('');
  const [fName, setFName] = useState<string>('');
  const [fMobile, setFMobile] = useState<string>('');
  const [fVillage, setFVillage] = useState<string>('');
  const [fMilkType, setFMilkType] = useState<MilkType>('cow');
  const [fSchedule, setFSchedule] = useState<FarmerShiftSchedule>('both');
  const [fOpeningBal, setFOpeningBal] = useState<string>('0');
  const [fNotes, setFNotes] = useState<string>('');
  const [farmerError, setFarmerError] = useState<string | null>(null);
  const [deleteFarmerTarget, setDeleteFarmerTarget] = useState<Farmer | null>(null);

  // 2. Selected Farmer for Ledger
  const [ledgerFarmerId, setLedgerFarmerId] = useState<string>(
    state.farmers[0]?.id || ''
  );
  const [ledgerShiftFilter, setLedgerShiftFilter] = useState<'all' | 'morning' | 'evening'>('all');

  // 3. Advance / Payment Form State
  const [editingAdvId, setEditingAdvId] = useState<string | null>(null);
  const [advDate, setAdvDate] = useState<string>(state.selectedDate);
  const [advFarmerId, setAdvFarmerId] = useState<string>('');
  const [advType, setAdvType] = useState<'advance' | 'payment'>('payment');
  const [advBillingYearMonth, setAdvBillingYearMonth] = useState<string>(
    state.selectedDate.slice(0, 7)
  );
  const [advBillingCycle, setAdvBillingCycle] = useState<1 | 2 | 3>(
    getCycleFromDate(state.selectedDate).cycle
  );
  const [advTxnCode, setAdvTxnCode] = useState<string>('');
  const [advAmount, setAdvAmount] = useState<string>('');
  const [advMethod, setAdvMethod] = useState<PaymentMethod>('cash');
  const [advNotes, setAdvNotes] = useState<string>('');
  const [advError, setAdvError] = useState<string | null>(null);
  const [deleteAdvId, setDeleteAdvId] = useState<string | null>(null);

  // 4. Cattle Feed Form State
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [feedDate, setFeedDate] = useState<string>(state.selectedDate);
  const [feedFarmerId, setFeedFarmerId] = useState<string>('');
  const [feedItemName, setFeedItemName] = useState<string>('');
  const [feedQty, setFeedQty] = useState<string>('1');
  const [feedUnitPrice, setFeedUnitPrice] = useState<string>('');
  const [feedMode, setFeedMode] = useState<'deduct_from_milk' | 'cash_paid'>('deduct_from_milk');
  const [feedNotes, setFeedNotes] = useState<string>('');
  const [feedError, setFeedError] = useState<string | null>(null);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);

  // 5. 10-Day Billing & Clean Reports State (Only 4 Reports: सुबह, शाम, 10-दिन सुबह-शाम, लाभ-हानि)
  const [billFarmerId, setBillFarmerId] = useState<string>(state.farmers[0]?.id || '');
  const [billYearMonth, setBillYearMonth] = useState<string>(state.selectedDate.slice(0, 7));
  const [billCycle, setBillCycle] = useState<1 | 2 | 3>(
    getCycleFromDate(state.selectedDate).cycle
  );
  const [activeBill, setActiveBill] = useState<TenDayBill | null>(null);
  const [quickBillPayAmount, setQuickBillPayAmount] = useState<string>('');
  const [quickBillPayMethod, setQuickBillPayMethod] = useState<PaymentMethod>('cash');
  const [quickBillPayNotes, setQuickBillPayNotes] = useState<string>('');
  const [quickPaySuccessNotice, setQuickPaySuccessNotice] = useState<string | null>(null);
  const [activeCleanReport, setActiveCleanReport] = useState<
    'morning' | 'evening' | 'tenday' | 'profit_loss'
  >('tenday');
  const [reportSingleDate, setReportSingleDate] = useState<string>(state.selectedDate);
  const [reportFarmerFilter, setReportFarmerFilter] = useState<string>('all');

  // WhatsApp Preview Modal
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; message: string }>({
    open: false,
    phone: '',
    message: '',
  });

  const scheduleLabel = (sched: FarmerShiftSchedule) => {
    const norm = normalizeFarmerShiftSchedule(sched);
    if (norm === 'morning') return lang === 'hi' ? 'केवल सुबह' : 'Morning Only';
    if (norm === 'evening') return lang === 'hi' ? 'केवल शाम' : 'Evening Only';
    return lang === 'hi' ? 'सुबह और शाम दोनों समय' : 'Morning & Evening';
  };

  // --- Farmer Handlers ---
  const resetFarmerForm = () => {
    setEditingFarmerId(null);
    setFCode('');
    setFName('');
    setFMobile('');
    setFVillage('');
    setFMilkType('cow');
    setFSchedule('both');
    setFOpeningBal('0');
    setFNotes('');
    setFarmerError(null);
  };

  const handleEditFarmer = (f: Farmer) => {
    setEditingFarmerId(f.id);
    setFCode(f.code);
    setFName(f.name);
    setFMobile(f.mobile);
    setFVillage(f.village);
    setFMilkType(f.defaultMilkType || 'cow');
    setFSchedule(normalizeFarmerShiftSchedule(f.shiftSchedule));
    setFOpeningBal(String(f.openingBalance || 0));
    setFNotes(f.notes || '');
    setFarmerError(null);
  };

  const handleSaveFarmerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFarmerError(null);
    const code = fCode.trim();
    const name = fName.trim();
    if (!code || !name) {
      setFarmerError(
        lang === 'hi'
          ? 'कृपया किसान ID और किसान का नाम अनिवार्य रूप से भरें।'
          : 'Farmer ID and Farmer Name are required.'
      );
      return;
    }

    // Duplicate ID check
    const duplicate = state.farmers.find(
      (f) => f.code.toLowerCase() === code.toLowerCase() && f.id !== editingFarmerId
    );
    if (duplicate) {
      setFarmerError(
        lang === 'hi'
          ? `डुप्लिकेट किसान ID चेतावनी: ID "${code}" पहले से किसान "${duplicate.name}" के लिए मौजूद है!`
          : `Duplicate Farmer ID: "${code}" already exists for "${duplicate.name}"!`
      );
      return;
    }

    const existing = editingFarmerId
      ? state.farmers.find((f) => f.id === editingFarmerId)
      : undefined;

    const farmerObj: Farmer = {
      id: editingFarmerId || `farmer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      code,
      name,
      mobile: fMobile.trim(),
      village: fVillage.trim(),
      defaultMilkType: fMilkType,
      shiftSchedule: normalizeFarmerShiftSchedule(fSchedule),
      openingBalance: truncatePurchaseAmount(Number(fOpeningBal) || 0),
      notes: fNotes.trim(),
      active: existing ? existing.active !== false : true,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };

    onSaveFarmer(farmerObj, Boolean(editingFarmerId));
    if (!ledgerFarmerId) setLedgerFarmerId(farmerObj.id);
    if (!billFarmerId) setBillFarmerId(farmerObj.id);
    resetFarmerForm();
  };

  const farmerHasHistory = (fId: string) => {
    return (
      state.collections.some((c) => c.farmerId === fId) ||
      state.advancesAndPayments.some((a) => a.farmerId === fId) ||
      state.cattleFeed.some((cf) => cf.farmerId === fId)
    );
  };

  // --- Advance / Payment Handlers ---
  const handleSaveAdvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdvError(null);
    const farmer = state.farmers.find((f) => f.id === advFarmerId);
    const amt = Number(advAmount);
    const code =
      advTxnCode.trim() ||
      `${advType === 'advance' ? 'ADV' : 'PAY'}-${Date.now().toString().slice(-5)}`;

    if (!farmer) {
      setAdvError(lang === 'hi' ? 'कृपया किसान चुनें।' : 'Please select a farmer.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setAdvError(
        lang === 'hi' ? 'कृपया वैध राशि (₹ > 0) दर्ज करें।' : 'Please enter a valid amount.'
      );
      return;
    }

    // Prevent duplicate transaction ID (TEST 21)
    const dupTxn = state.advancesAndPayments.find(
      (a) =>
        a.id !== editingAdvId &&
        (a.txnCode.toLowerCase() === code.toLowerCase() ||
          (a.farmerId === farmer.id &&
            a.date === advDate &&
            a.type === advType &&
            a.amount === round2(amt) &&
            a.notes === advNotes.trim() &&
            advTxnCode.trim() !== ''))
    );
    if (dupTxn) {
      setAdvError(
        lang === 'hi'
          ? `डुप्लिकेट लेन-देन चेतावनी: यूनिक ID "${code}" पहले से दर्ज है! एक ही एडवांस/भुगतान दो बार नहीं जोड़ा जा सकता।`
          : `Duplicate transaction ID "${code}" detected!`
      );
      return;
    }

    const entry: AdvancePaymentEntry = {
      id: editingAdvId || `adv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      txnCode: code,
      date: advDate,
      farmerId: farmer.id,
      farmerName: farmer.name,
      type: advType,
      amount: round2(amt),
      paymentMethod: advMethod,
      billingYearMonth: advBillingYearMonth || advDate.slice(0, 7),
      billingCycle: advBillingCycle,
      notes: advNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    onSaveAdvancePayment(entry, Boolean(editingAdvId));
    setEditingAdvId(null);
    setAdvTxnCode('');
    setAdvAmount('');
    setAdvNotes('');
  };

  // --- Cattle Feed Handlers ---
  const liveFeedTotal = round2((Number(feedQty) || 0) * (Number(feedUnitPrice) || 0));

  const handleSaveFeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedError(null);
    const farmer = state.farmers.find((f) => f.id === feedFarmerId);
    const q = Number(feedQty);
    const p = Number(feedUnitPrice);

    if (!farmer || !feedItemName.trim() || !Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p <= 0) {
      setFeedError(
        lang === 'hi'
          ? 'कृपया किसान, सामग्री का नाम, मात्रा और प्रति यूनिट कीमत सही भरें।'
          : 'Please fill farmer, item name, quantity, and unit price.'
      );
      return;
    }

    const entry: CattleFeedEntry = {
      id: editingFeedId || `feed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      txnCode: `FD-${Date.now().toString().slice(-5)}`,
      date: feedDate,
      farmerId: farmer.id,
      farmerName: farmer.name,
      itemName: feedItemName.trim(),
      quantity: round2(q),
      unitPrice: round2(p),
      totalAmount: liveFeedTotal,
      paymentMode: feedMode,
      notes: feedNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    onSaveCattleFeed(entry, Boolean(editingFeedId));
    setEditingFeedId(null);
    setFeedItemName('');
    setFeedQty('1');
    setFeedUnitPrice('');
    setFeedNotes('');
  };

  // Auto-sync activeBill when billFarmerId, billYearMonth, or billCycle changes
  React.useEffect(() => {
    const farmer = state.farmers.find((f) => f.id === billFarmerId);
    if (!farmer) return;
    const existingSaved = state.bills.find(
      (b) => b.farmerId === farmer.id && b.yearMonth === billYearMonth && b.cycle === billCycle
    );
    if (existingSaved) {
      setActiveBill(existingSaved);
      return;
    }
    const data = generateTenDayBillData(
      farmer,
      billYearMonth,
      billCycle,
      state.collections,
      state.advancesAndPayments,
      state.cattleFeed
    );
    setActiveBill({
      ...data,
      id: `bill_preview_${farmer.id}_${billYearMonth}_${billCycle}`,
      billNumber: `UD-${billYearMonth.replace('-', '')}-C${billCycle}-${farmer.code}`,
      createdAt: new Date().toISOString(),
    });
  }, [billFarmerId, billYearMonth, billCycle]);

  // --- 10-Day Bill Generation ---
  const handleCreateOrUpdateBill = () => {
    const farmer = state.farmers.find((f) => f.id === billFarmerId);
    if (!farmer) return;
    const data = generateTenDayBillData(
      farmer,
      billYearMonth,
      billCycle,
      state.collections,
      state.advancesAndPayments,
      state.cattleFeed
    );

    const existingBill = state.bills.find(
      (b) =>
        b.farmerId === farmer.id &&
        b.yearMonth === billYearMonth &&
        b.cycle === billCycle
    );

    const newBill: TenDayBill = {
      ...data,
      id: existingBill ? existingBill.id : `bill_${Date.now()}`,
      billNumber: existingBill
        ? existingBill.billNumber
        : `UD-${billYearMonth.replace('-', '')}-C${billCycle}-${farmer.code}`,
      createdAt: new Date().toISOString(),
    };

    onSaveBill(newBill);
    setActiveBill(newBill);
  };

  const executeInlineCyclePayment = (
    targetFarmer: Farmer,
    targetYearMonth: string,
    targetCycle: 1 | 2 | 3,
    existingBillId?: string,
    existingBillNum?: string
  ) => {
    const amt = Number(quickBillPayAmount);
    if (!targetFarmer || !Number.isFinite(amt) || amt <= 0) return;

    const cycleLabel = getCycleLabelHi(targetCycle);
    const entry: AdvancePaymentEntry = {
      id: `adv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      txnCode: `PAY-${Date.now().toString().slice(-5)}`,
      date: state.selectedDate,
      farmerId: targetFarmer.id,
      farmerName: targetFarmer.name,
      type: 'payment',
      amount: round2(amt),
      paymentMethod: quickBillPayMethod,
      billingYearMonth: targetYearMonth,
      billingCycle: targetCycle,
      notes: quickBillPayNotes.trim() || `बिल भुगतान (${cycleLabel})`,
      createdAt: new Date().toISOString(),
    };

    const nextAdvances = [entry, ...state.advancesAndPayments];
    onSaveAdvancePayment(entry, false);

    // Immediately recalculate and save the updated bill
    const updatedData = generateTenDayBillData(
      targetFarmer,
      targetYearMonth,
      targetCycle,
      state.collections,
      nextAdvances,
      state.cattleFeed
    );
    const updatedBill: TenDayBill = {
      ...updatedData,
      id: existingBillId || `bill_${Date.now()}`,
      billNumber:
        existingBillNum ||
        `UD-${targetYearMonth.replace('-', '')}-C${targetCycle}-${targetFarmer.code}`,
      createdAt: new Date().toISOString(),
    };
    onSaveBill(updatedBill);
    setActiveBill(updatedBill);
    setQuickBillPayAmount('');
    setQuickBillPayNotes('');
    setQuickPaySuccessNotice(
      lang === 'hi'
        ? `${targetFarmer.name} का ₹${round2(amt)} भुगतान दर्ज हो गया और बिल अपडेट हो गया!`
        : `Payment of ₹${round2(amt)} saved for ${targetFarmer.name}!`
    );
    setTimeout(() => setQuickPaySuccessNotice(null), 5000);
  };

  const openBillWhatsApp = (bill: TenDayBill) => {
    const farmer = state.farmers.find((f) => f.id === bill.farmerId);
    const cycleLabel = getCycleLabelHi(bill.cycle);
    const payableBeforePayment =
      bill.billPayableBeforePayment ?? bill.netPayable + bill.paymentsInPeriod;
    const prevAdjLine =
      bill.previousBalance > 0
        ? `पिछली अवधि का कम भुगतान / बकाया (+): +${formatWholeCurrency(bill.previousBalance)}`
        : bill.previousBalance < 0
        ? `पिछली अवधि का ज्यादा भुगतान समायोजन (-): -${formatWholeCurrency(Math.abs(bill.previousBalance))}`
        : `पिछला बकाया / समायोजन: ₹0`;
    const carryForwardLine =
      bill.netPayable > 0
        ? `*शेष देय राशि (अगली अवधि में जुड़ेगा): ${formatWholeCurrency(bill.netPayable)}*`
        : bill.netPayable < 0
        ? `*अतिरिक्त/ज्यादा भुगतान (अगली अवधि से कटेगा): -${formatWholeCurrency(Math.abs(bill.netPayable))}*`
        : `*अंतिम देय राशि: ₹0 (चुकता)*`;

    const shiftLines: string[] = [];
    if (bill.morningLiters > 0 || bill.eveningLiters === 0) {
      shiftLines.push(
        `सुबह का दूध: ${formatNumber(bill.morningLiters, 2)} L (${formatWholeCurrency(bill.morningAmount)})`
      );
    }
    if (bill.eveningLiters > 0) {
      shiftLines.push(
        `शाम का दूध: ${formatNumber(bill.eveningLiters, 2)} L (${formatWholeCurrency(bill.eveningAmount)})`
      );
    }

    const msg = [
      `*${state.dairyName || 'Ujalaa Dairy'} — 10-दिन का दूध बिल*`,
      `बिल नं: ${bill.billNumber}`,
      `किसान: ${bill.farmerCode} - ${bill.farmerName}`,
      `अवधि: ${cycleLabel} (${formatDateDMY(bill.fromDate)} से ${formatDateDMY(bill.toDate)})`,
      `--------------------------------`,
      ...shiftLines,
      `कुल दूध: ${formatNumber(bill.totalLiters, 2)} L`,
      `औसत FAT: ${formatNumber(bill.avgFat, 1)} | औसत SNF: ${formatNumber(bill.avgSnf, 1)}`,
      `कुल दूध राशि: ${formatWholeCurrency(bill.totalMilkAmount)}`,
      prevAdjLine,
      `एडवांस कटौती (-): ${formatWholeCurrency(bill.advancesInPeriod)}`,
      `दाना/पशु-आहार कटौती (-): ${formatWholeCurrency(bill.feedDeductionsInPeriod)}`,
      `कुल देय बिल राशि: ${formatWholeCurrency(payableBeforePayment)}`,
      `इस अवधि में भुगतान (-): ${formatWholeCurrency(bill.paymentsInPeriod)}`,
      `--------------------------------`,
      carryForwardLine,
    ].join('\n');

    setWaModal({
      open: true,
      phone: farmer?.mobile || '',
      message: msg,
    });
  };

  const activeLedgerFarmer =
    state.farmers.find((f) => f.id === ledgerFarmerId) || state.farmers[0] || null;
  const ledgerData = activeLedgerFarmer
    ? calculateFarmerLedger(
        activeLedgerFarmer,
        state.collections,
        state.advancesAndPayments,
        state.cattleFeed
      )
    : null;

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar for Farmer & Accounting Modules */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-1.5 no-print">
        <button
          type="button"
          onClick={() => setSubTab('farmers')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'farmers'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          {lang === 'hi' ? 'किसान प्रबंधन' : 'Farmers'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('ledger')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'ledger'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {lang === 'hi' ? 'किसान का खाता (Ledger)' : 'Farmer Ledger'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('advances')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'advances'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wallet className="w-4 h-4" />
          {lang === 'hi' ? 'एडवांस और भुगतान' : 'Advance & Payments'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('feed')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'feed'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          {lang === 'hi' ? 'दाना और पशु-आहार' : 'Cattle Feed'}
        </button>

        <button
          type="button"
          data-testid="subtab-billing-reports-btn"
          onClick={() => setSubTab('billing')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'billing'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          {lang === 'hi' ? '10-दिन बिलिंग व रिपोर्ट' : '10-Day Billing & Reports'}
        </button>
      </div>

      {/* SUBTAB 1: FARMER MANAGEMENT (Section 9 + Additional Feature #1) */}
      {subTab === 'farmers' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingFarmerId
                      ? lang === 'hi'
                        ? 'किसान प्रोफाइल एडिट करें'
                        : 'Edit Farmer Profile'
                      : lang === 'hi'
                      ? 'नया किसान जोड़ें (Add Farmer)'
                      : 'Add New Farmer'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {lang === 'hi'
                      ? 'किसान का दूध आने का निर्धारित समय चुनें (केवल सुबह, केवल शाम, या सुबह और शाम दोनों समय)'
                      : 'Choose the farmer shift schedule (Morning only, Evening only, or Both)'}
                  </p>
                </div>
              </div>
              {editingFarmerId && (
                <button
                  type="button"
                  onClick={resetFarmerForm}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg"
                >
                  {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                </button>
              )}
            </div>

            <form onSubmit={handleSaveFarmerSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="f-code" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान ID / कोड *' : 'Farmer ID / Code *'}
                  </label>
                  <input
                    id="f-code"
                    type="text"
                    placeholder="जैसे 101"
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="f-name" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान का नाम *' : 'Farmer Name *'}
                  </label>
                  <input
                    id="f-name"
                    type="text"
                    placeholder={lang === 'hi' ? 'जैसे रामलाल' : 'e.g. Ramlal'}
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="f-schedule"
                    className="block text-xs font-bold text-blue-900 mb-1"
                  >
                    {lang === 'hi'
                      ? 'यह किसान किस समय दूध लाता है? *'
                      : 'When does this farmer bring milk? *'}
                  </label>
                  <select
                    id="f-schedule"
                    value={fSchedule}
                    onChange={(e) => setFSchedule(e.target.value as FarmerShiftSchedule)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-semibold bg-blue-50/60 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="morning">
                      {lang === 'hi' ? '1. केवल सुबह (Morning Only)' : '1. Morning Only'}
                    </option>
                    <option value="evening">
                      {lang === 'hi' ? '2. केवल शाम (Evening Only)' : '2. Evening Only'}
                    </option>
                    <option value="both">
                      {lang === 'hi'
                        ? '3. सुबह और शाम दोनों समय (Both Shifts)'
                        : '3. Both Morning & Evening'}
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="f-mobile" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}
                  </label>
                  <input
                    id="f-mobile"
                    type="tel"
                    placeholder="9876543210"
                    value={fMobile}
                    onChange={(e) => setFMobile(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="f-village"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    {lang === 'hi' ? 'गाँव / पता' : 'Village / Address'}
                  </label>
                  <input
                    id="f-village"
                    type="text"
                    placeholder={lang === 'hi' ? 'गाँव का नाम' : 'Village'}
                    value={fVillage}
                    onChange={(e) => setFVillage(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="f-opening"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    {lang === 'hi' ? 'शुरुआती बकाया (₹)' : 'Opening Balance (₹)'}
                  </label>
                  <input
                    id="f-opening"
                    type="number"
                    step="0.01"
                    value={fOpeningBal}
                    onChange={(e) => setFOpeningBal(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="f-notes" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'टिप्पणी' : 'Notes'}
                  </label>
                  <input
                    id="f-notes"
                    type="text"
                    value={fNotes}
                    onChange={(e) => setFNotes(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {farmerError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{farmerError}</span>
                </div>
              )}

              <button
                type="submit"
                className="min-h-[46px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {editingFarmerId
                  ? lang === 'hi'
                    ? 'किसान जानकारी अपडेट करें'
                    : 'Update Farmer'
                  : lang === 'hi'
                  ? 'किसान सेव करें'
                  : 'Save Farmer'}
              </button>
            </form>
          </div>

          {/* Farmers Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-2.5">
              {lang === 'hi'
                ? `पंजीकृत किसानों की सूची (${state.farmers.length}) — नाम पर क्लिक कर खाता देखें`
                : `Registered Farmers (${state.farmers.length}) — Click name to open Ledger`}
            </h3>
            <div>
              <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                <thead>
                  <tr className="bg-blue-50 text-blue-950">
                    <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                      {lang === 'hi' ? 'किसान (ID व नाम)' : 'Farmer (ID & Name)'}
                    </th>
                    <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                      {lang === 'hi' ? 'कुल दूध' : 'Milk'}
                    </th>
                    <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                      {lang === 'hi' ? 'शेष बकाया' : 'Balance'}
                    </th>
                    <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                      {lang === 'hi' ? 'कार्य' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.farmers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                        {lang === 'hi'
                          ? 'अभी कोई किसान नहीं जोड़ा गया है।'
                          : 'No farmers added yet.'}
                      </td>
                    </tr>
                  ) : (
                    state.farmers.map((f) => {
                      const ledger = calculateFarmerLedger(
                        f,
                        state.collections,
                        state.advancesAndPayments,
                        state.cattleFeed
                      );
                      return (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                            <button
                              type="button"
                              onClick={() => {
                                setLedgerFarmerId(f.id);
                                setSubTab('ledger');
                              }}
                              className="text-left font-bold text-blue-700 hover:underline leading-tight block"
                            >
                              <span className="text-slate-800">{f.code}</span> — {f.name}
                            </button>
                            <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                              {scheduleLabel(f.shiftSchedule)}
                              {f.mobile ? ` · ${f.mobile}` : ''}
                              {f.village ? ` · ${f.village}` : ''}
                            </span>
                          </td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right font-bold whitespace-nowrap border border-slate-300">
                            {formatNumber(ledger.totalLiters, 2)} L
                          </td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                            <span className="font-bold text-blue-900 block">
                              {formatWholeCurrency(ledger.closingBalance)}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSaveFarmer({ ...f, active: !f.active }, true)}
                              className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold inline-block ${
                                f.active
                                  ? 'text-emerald-700 bg-emerald-50'
                                  : 'text-slate-500 bg-slate-100'
                              }`}
                            >
                              {f.active
                                ? lang === 'hi'
                                  ? 'सक्रिय'
                                  : 'Active'
                                : lang === 'hi'
                                ? 'निष्क्रिय'
                                : 'Inactive'}
                            </button>
                          </td>
                          <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditFarmer(f)}
                                aria-label={`Edit ${f.name}`}
                                className="min-h-[28px] px-1.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded-lg font-semibold flex items-center gap-0.5"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteFarmerTarget(f)}
                                aria-label={`Delete ${f.name}`}
                                className="min-h-[28px] px-1.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold flex items-center gap-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Delete</span>
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
        </div>
      )}

      {/* SUBTAB 2: INDIVIDUAL FARMER LEDGER / PASSBOOK (Section 10) */}
      {subTab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'प्रत्येक किसान का अलग खाता / लेजर (Individual Farmer Passbook)'
                  : 'Individual Farmer Ledger & Passbook'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'दूध खरीद, एडवांस, दाना कटौती, भुगतान और शेष बकाया का पूरा कालानुक्रमिक विवरण'
                  : 'Complete chronological account of milk, advances, cattle feed deductions, and payments'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={lang === 'hi' ? 'किसान चुनें' : 'Select Farmer'}
                value={activeLedgerFarmer?.id || ''}
                onChange={(e) => setLedgerFarmerId(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200 rounded-xl"
              >
                {sortedFarmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.name} ({scheduleLabel(f.shiftSchedule)})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setLedgerShiftFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    ledgerShiftFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'सभी' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerShiftFilter('morning')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    ledgerShiftFilter === 'morning'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'सुबह' : 'Morning'}
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerShiftFilter('evening')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    ledgerShiftFilter === 'evening'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'शाम' : 'Evening'}
                </button>
              </div>
            </div>
          </div>

          {!ledgerData ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {lang === 'hi'
                ? 'खाता देखने के लिए पहले किसान जोड़ें।'
                : 'Add a farmer first to view their ledger.'}
            </div>
          ) : (
            <>
              {/* Farmer Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल दूध (L)' : 'Total Liters'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatNumber(ledgerData.totalLiters, 3)} L
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'औसत FAT / SNF' : 'Avg FAT / SNF'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatNumber(ledgerData.avgFat)} / {formatNumber(ledgerData.avgSnf)}
                  </span>
                </div>
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                  <span className="text-blue-900 block">
                    {lang === 'hi' ? 'कुल दूध राशि' : 'Milk Amount'}
                  </span>
                  <span className="font-bold text-blue-800 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.totalMilkAmount)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल एडवांस' : 'Total Advance'}
                  </span>
                  <span className="font-bold text-amber-700 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.totalAdvances)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'दाना/अन्य कटौती' : 'Feed/Deductions'}
                  </span>
                  <span className="font-bold text-red-600 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(
                      ledgerData.totalFeedDeductions + ledgerData.totalInlineDeductions
                    )}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल भुगतान किया' : 'Total Paid'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.totalPayments)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200">
                  <span className="text-emerald-900 font-semibold block">
                    {lang === 'hi' ? 'शेष बकाया (Balance)' : 'Closing Balance'}
                  </span>
                  <span className="font-bold text-emerald-800 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.closingBalance)}
                  </span>
                </div>
              </div>

              {/* Ledger Table */}
              <div>
                <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 text-slate-800">
                      <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">
                        {lang === 'hi' ? 'तारीख / शिफ्ट' : 'Date / Shift'}
                      </th>
                      <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">
                        {lang === 'hi' ? 'विवरण · लीटर | FAT | SNF | रेट' : 'Particulars · L | FAT | SNF | Rate'}
                      </th>
                      <th className="py-2 px-1 sm:px-2 text-right border border-slate-300">
                        {lang === 'hi' ? 'जमा(+) / नामे(-)' : 'Cr(+) / Dr(-)'}
                      </th>
                      <th className="py-2 px-1 sm:px-2 text-right border border-slate-300">
                        {lang === 'hi' ? 'बाकी बकाया' : 'Balance'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.rows
                      .filter(
                        (r) =>
                          ledgerShiftFilter === 'all' ||
                          !r.shift ||
                          r.shift === ledgerShiftFilter
                      )
                      .map((row) => {
                        const debitTotal =
                          row.advanceAmount +
                          row.feedAmount +
                          row.otherDeduction +
                          row.paymentAmount;
                        return (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="py-2 px-1 sm:px-2.5 whitespace-nowrap border border-slate-300">
                              <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm block leading-tight">
                                {formatDateDMY(row.date)}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500 block leading-tight mt-0.5">
                                {row.shift === 'morning'
                                  ? 'सुबह'
                                  : row.shift === 'evening'
                                  ? 'शाम'
                                  : '—'}
                              </span>
                            </td>
                            <td className="py-2 px-1 sm:px-2.5 border border-slate-300">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm block leading-tight">
                                {lang === 'hi' ? row.descriptionHi : row.descriptionEn}
                              </span>
                              {row.liters ? (
                                <div className="mt-1 inline-grid grid-cols-4 divide-x divide-slate-300 border border-slate-300 rounded bg-slate-50 text-xs font-extrabold tabular-nums">
                                  <span className="px-1 sm:px-1.5 py-0.5 text-slate-900">
                                    {formatNumber(row.liters, 2)}L
                                  </span>
                                  <span className="px-1 sm:px-1.5 py-0.5 text-amber-950 bg-amber-50/70">
                                    F:{formatNumber(row.fat, 1)}
                                  </span>
                                  <span className="px-1 sm:px-1.5 py-0.5 text-indigo-950 bg-indigo-50/70">
                                    S:{formatNumber(row.snf, 1)}
                                  </span>
                                  <span className="px-1 sm:px-1.5 py-0.5 text-blue-900">
                                    ₹{formatNumber(row.rate, 2)}
                                  </span>
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-right whitespace-nowrap border border-slate-300">
                              {row.milkAmount > 0 && (
                                <span className="font-extrabold text-blue-800 text-xs sm:text-sm block">
                                  +{formatWholeCurrency(row.milkAmount)}
                                </span>
                              )}
                              {debitTotal > 0 && (
                                <span className="font-extrabold text-red-600 text-xs sm:text-sm block">
                                  -{formatWholeCurrency(debitTotal)}
                                </span>
                              )}
                              {row.milkAmount === 0 && debitTotal === 0 && '—'}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-right font-extrabold text-slate-900 text-xs sm:text-sm whitespace-nowrap border border-slate-300">
                              {formatWholeCurrency(row.runningBalance)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* SUBTAB 3: ADVANCES & PAYMENTS (Section 11) */}
      {subTab === 'advances' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi'
                ? 'किसान एडवांस और 10-दिन अवधि भुगतान एंट्री (Advance & Period Payment)'
                : 'Farmer Advance & 10-Day Period Settlement Payment'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'चुनें कि यह भुगतान 1 से 10 तारीख, 11 से 20 तारीख या 21 से महीने के अंत में से किस अवधि का हो रहा है। कम या ज्यादा भुगतान होने पर अंतर अगली अवधि के बिल में स्वतः जुड़ या कट जाएगा।'
                : 'Select which 10-day period (1–10, 11–20, or 21–End of Month) is being paid. Any short or excess payment automatically adjusts in the next period bill.'}
            </p>

            <form onSubmit={handleSaveAdvSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi'
                      ? `भुगतान की तारीख (${formatDateDMY(advDate)}) *`
                      : `Payment Date (${formatDateDMY(advDate)}) *`}
                  </label>
                  <input
                    type="date"
                    value={advDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdvDate(val);
                      if (val && val.length >= 10) {
                        const info = getCycleFromDate(val);
                        setAdvBillingYearMonth(info.yearMonth);
                        setAdvBillingCycle(info.cycle);
                      }
                    }}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                  </label>
                  <select
                    data-testid="adv-farmer-select"
                    value={advFarmerId}
                    onChange={(e) => setAdvFarmerId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="">{lang === 'hi' ? '-- किसान चुनें --' : '-- Select --'}</option>
                    {sortedFarmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'लेन-देन का प्रकार *' : 'Transaction Type *'}
                  </label>
                  <select
                    data-testid="adv-type-select"
                    value={advType}
                    onChange={(e) => setAdvType(e.target.value as 'advance' | 'payment')}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="payment">
                      {lang === 'hi' ? 'बिल भुगतान किया (Settlement Payment)' : 'Bill Payment'}
                    </option>
                    <option value="advance">
                      {lang === 'hi' ? 'एडवांस दिया (Advance Given)' : 'Advance Given'}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'यूनिक रसीद/लेन-देन ID' : 'Unique Txn ID'}
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'स्वतः या कस्टम (जैसे PAY-101)' : 'Auto or custom'}
                    value={advTxnCode}
                    onChange={(e) => setAdvTxnCode(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* 10-Day Billing Period Selection Box */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-blue-950 block">
                      {lang === 'hi'
                        ? 'यह भुगतान / एडवांस किस 10-दिन की अवधि का हो रहा है? *'
                        : 'Which 10-Day Billing Period is this payment for? *'}
                    </span>
                    <span className="text-[11px] text-blue-800">
                      {lang === 'hi'
                        ? 'कम भुगतान होने पर बकाया अगली अवधि में जुड़ जाएगा और ज्यादा भुगतान होने पर अगली अवधि से कट जाएगा'
                        : 'Underpayment adds to next period; overpayment deducts from next period'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-blue-900">
                      {lang === 'hi' ? 'महीना:' : 'Month:'}
                    </label>
                    <input
                      type="month"
                      data-testid="adv-billing-month-input"
                      value={advBillingYearMonth}
                      onChange={(e) => setAdvBillingYearMonth(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white border border-blue-300 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <div
                  data-testid="adv-billing-cycle-selector"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  {([1, 2, 3] as const).map((c) => {
                    const active = advBillingCycle === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        data-testid={`adv-cycle-btn-${c}`}
                        onClick={() => setAdvBillingCycle(c)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold border text-left flex items-center justify-between ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-blue-50'
                        }`}
                      >
                        <span>
                          {lang === 'hi'
                            ? `अवधि ${c}: ${getCycleLabelHi(c)}`
                            : `Cycle ${c}: ${getCycleLabelEn(c)}`}
                        </span>
                        {active && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Live Period Bill & Carry-Forward Adjustment Preview */}
                {(() => {
                  const selFarmer = state.farmers.find((f) => f.id === advFarmerId);
                  if (!selFarmer || !advBillingYearMonth) return null;
                  const periodBill = generateTenDayBillData(
                    selFarmer,
                    advBillingYearMonth,
                    advBillingCycle,
                    state.collections,
                    state.advancesAndPayments,
                    state.cattleFeed
                  );
                  const enteredAmt = truncatePurchaseAmount(Number(advAmount) || 0);
                  const projectedNetAfterThisEntry = periodBill.netPayable - enteredAmt;
                  const payableBeforePay =
                    periodBill.billPayableBeforePayment ??
                    periodBill.netPayable + periodBill.paymentsInPeriod;

                  return (
                    <div
                      data-testid="adv-period-live-summary"
                      className="p-3 bg-white border border-blue-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs tabular-nums"
                    >
                      <div>
                        <span className="text-slate-500 block">
                          {getCycleLabelHi(advBillingCycle)} का कुल बिल
                        </span>
                        <span className="font-bold text-slate-900">
                          {formatWholeCurrency(payableBeforePay)}
                        </span>
                        {periodBill.previousBalance !== 0 && (
                          <span className="text-[11px] text-slate-500 block">
                            (पिछला समायोजन:{' '}
                            {periodBill.previousBalance > 0
                              ? `+${formatWholeCurrency(periodBill.previousBalance)}`
                              : `-${formatWholeCurrency(Math.abs(periodBill.previousBalance))}`}
                            )
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 block">पहले से भुगतान / अभी शेष</span>
                        <span className="font-bold text-slate-900">
                          {formatWholeCurrency(periodBill.paymentsInPeriod)} /{' '}
                          {formatWholeCurrency(periodBill.netPayable)}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 block">
                          इस भुगतान के बाद अगली अवधि में समायोजन:
                        </span>
                        {projectedNetAfterThisEntry > 0 ? (
                          <span className="font-bold text-amber-800 block">
                            कम भुगतान बकाया: +{formatWholeCurrency(projectedNetAfterThisEntry)} (अगली अवधि के बिल में जुड़ेगा)
                          </span>
                        ) : projectedNetAfterThisEntry < 0 ? (
                          <span className="font-bold text-indigo-700 block">
                            ज्यादा/अतिरिक्त भुगतान: -{formatWholeCurrency(Math.abs(projectedNetAfterThisEntry))} (अगली अवधि के बिल से कटेगा)
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 block">
                            ₹0 — इस अवधि का बिल पूरा चुकता (बराबर)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'भुगतान राशि (₹) *' : 'Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="adv-amount-input"
                    placeholder="500"
                    value={advAmount}
                    onChange={(e) => setAdvAmount(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'भुगतान का तरीका *' : 'Payment Mode *'}
                  </label>
                  <select
                    value={advMethod}
                    onChange={(e) => setAdvMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="cash">{lang === 'hi' ? 'नकद (Cash)' : 'Cash'}</option>
                    <option value="bank">{lang === 'hi' ? 'बैंक (Bank)' : 'Bank'}</option>
                    <option value="upi">UPI</option>
                    <option value="other">{lang === 'hi' ? 'अन्य (Other)' : 'Other'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'टिप्पणी' : 'Notes'}
                  </label>
                  <input
                    type="text"
                    value={advNotes}
                    onChange={(e) => setAdvNotes(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {advError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                  {advError}
                </div>
              )}

              <button
                type="submit"
                data-testid="save-adv-payment-btn"
                className="min-h-[46px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
              >
                {editingAdvId
                  ? lang === 'hi'
                    ? 'अपडेट करें'
                    : 'Update'
                  : lang === 'hi'
                  ? 'एडवांस / भुगतान सेव करें'
                  : 'Save Entry'}
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-2.5">
              {lang === 'hi' ? 'एडवांस और भुगतान सूची' : 'Advances & Payments History'}
            </h3>
            <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
              <thead>
                <tr className="bg-slate-50">
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'तारीख / किसान' : 'Date / Farmer'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'अवधि व प्रकार' : 'Period & Type'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                    {lang === 'hi' ? 'राशि' : 'Amount'}
                  </th>
                  <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                    {lang === 'hi' ? 'कार्य' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.advancesAndPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                      {lang === 'hi' ? 'अभी कोई रिकॉर्ड नहीं है' : 'No records yet'}
                    </td>
                  </tr>
                ) : (
                  state.advancesAndPayments.map((a) => {
                    const eff = getAdvancePaymentEffectiveCycle(a);
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                          <span className="font-bold text-slate-900 block leading-tight">
                            {a.farmerName}
                          </span>
                          <span className="text-[11px] text-slate-600 font-mono font-semibold block leading-tight mt-0.5">
                            {formatDateDMY(a.date)} · {a.txnCode}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[11px] font-semibold inline-block">
                            {getCycleLabelHi(eff.cycle, eff.yearMonth)}
                          </span>
                          <span className="text-[11px] text-slate-600 block mt-0.5">
                            {a.type === 'advance' ? 'एडवांस' : 'भुगतान'} · {a.paymentMethod.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 sm:px-2.5 text-right font-bold whitespace-nowrap border border-slate-300">
                          {formatCurrency(a.amount)}
                        </td>
                        <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setDeleteAdvId(a.id)}
                            className="px-1.5 py-1 bg-red-50 text-red-600 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* SUBTAB 4: CATTLE FEED & SUPPLEMENTS (Section 12) */}
      {subTab === 'feed' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi'
                ? 'दाना और पशु-आहार का हिसाब (Cattle Feed & Supplements)'
                : 'Cattle Feed & Supplements Deduction'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'किसान को दिए गए पशु-आहार का रिकॉर्ड रखें और उसे दूध बिल से ऑटोमैटिक घटाएँ'
                : 'Record cattle feed supplied to farmers and link to their ledger'}
            </p>

            <form onSubmit={handleSaveFeedSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi'
                      ? `तारीख (${formatDateDMY(feedDate)}) *`
                      : `Date (${formatDateDMY(feedDate)}) *`}
                  </label>
                  <input
                    type="date"
                    value={feedDate}
                    onChange={(e) => setFeedDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                  </label>
                  <select
                    value={feedFarmerId}
                    onChange={(e) => setFeedFarmerId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="">{lang === 'hi' ? '-- किसान चुनें --' : '-- Select --'}</option>
                    {sortedFarmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'सामग्री का नाम (दाना/खल/चूरी) *' : 'Item Name *'}
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'जैसे पशु-आहार बोरी 50Kg' : 'Cattle Feed 50kg'}
                    value={feedItemName}
                    onChange={(e) => setFeedItemName(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'कटौती का प्रकार *' : 'Payment / Deduction Mode *'}
                  </label>
                  <select
                    value={feedMode}
                    onChange={(e) =>
                      setFeedMode(e.target.value as 'deduct_from_milk' | 'cash_paid')
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="deduct_from_milk">
                      {lang === 'hi'
                        ? 'दूध के खाते से काटना है (Deduct from Milk Bill)'
                        : 'Deduct from Milk Bill'}
                    </option>
                    <option value="cash_paid">
                      {lang === 'hi' ? 'तुरंत नकद प्राप्त (Paid Cash)' : 'Paid Cash Immediately'}
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'मात्रा (Quantity) *' : 'Quantity *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feedQty}
                    onChange={(e) => setFeedQty(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'प्रति यूनिट कीमत (₹) *' : 'Unit Price (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="1250"
                    value={feedUnitPrice}
                    onChange={(e) => setFeedUnitPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'कुल कीमत (₹)' : 'Total Price (₹)'}
                  </label>
                  <div className="w-full min-h-[44px] px-3 py-2.5 text-sm font-bold font-mono bg-blue-50 text-blue-900 border border-blue-200 rounded-xl tabular-nums">
                    {formatCurrency(liveFeedTotal)}
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
                  >
                    {lang === 'hi' ? 'दाना एंट्री सेव करें' : 'Save Cattle Feed'}
                  </button>
                </div>
              </div>

              {feedError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                  {feedError}
                </div>
              )}
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-2.5">
              {lang === 'hi' ? 'दाना और पशु-आहार रिकॉर्ड सूची' : 'Cattle Feed Records'}
            </h3>
            <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
              <thead>
                <tr className="bg-slate-50">
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'तारीख / किसान' : 'Date / Farmer'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'सामग्री व मात्रा' : 'Item & Qty'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                    {lang === 'hi' ? 'कुल कीमत' : 'Total'}
                  </th>
                  <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                    {lang === 'hi' ? 'कार्य' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.cattleFeed.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                      {lang === 'hi' ? 'अभी कोई रिकॉर्ड नहीं है' : 'No records yet'}
                    </td>
                  </tr>
                ) : (
                  state.cattleFeed.map((cf) => (
                    <tr key={cf.id} className="hover:bg-slate-50">
                      <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                        <span className="font-bold text-slate-900 block leading-tight">
                          {cf.farmerName}
                        </span>
                        <span className="text-[11px] text-slate-600 font-mono font-semibold block leading-tight mt-0.5">
                          {formatDateDMY(cf.date)}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                        <span className="font-medium text-slate-900 block leading-tight">
                          {cf.itemName}
                        </span>
                        <span className="text-[11px] text-slate-500 block leading-tight">
                          {cf.quantity} × {formatCurrency(cf.unitPrice)}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                        <span className="font-bold text-slate-900 block">
                          {formatCurrency(cf.totalAmount)}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {cf.paymentMode === 'deduct_from_milk' ? 'दूध से कटौती' : 'नकद'}
                        </span>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                        <button
                          type="button"
                          onClick={() => setDeleteFeedId(cf.id)}
                          className="px-1.5 py-1 bg-red-50 text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 5: 10-DAY BILLING & CLEAN REPORTS (केवल 4 रिपोर्ट: सुबह, शाम, 10-दिन सुबह-शाम, लाभ-हानि) */}
      {subTab === 'billing' && (
        <div className="space-y-5">
          {/* CLEAN 4-REPORTS CARD INSIDE 10-DAY BILLING SECTION */}
          <div
            data-testid="ten-day-billing-reports-section"
            className="bg-white border border-slate-200 rounded-2xl p-2 sm:p-5 space-y-3.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5 no-print">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? '10-दिन की डेयरी रिपोर्ट्स (सुबह · शाम · सुबह-शाम · लाभ-हानि)'
                    : '10-Day Dairy Reports (Morning · Evening · Morning-Evening · Profit & Loss)'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'hi'
                    ? 'केवल आवश्यक 4 साफ-सुथरी 10-दिन की रिपोर्ट — किसी भी रिपोर्ट पर क्लिक करके देखें व प्रिंट करें'
                    : 'Clean 4 essential 10-day reports inside 10-Day Billing'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Printer className="w-4 h-4" />
                {lang === 'hi' ? 'रिपोर्ट प्रिंट करें' : 'Print Report'}
              </button>
            </div>

            {/* ONLY 4 REPORT OPTIONS AS REQUESTED */}
            <div
              data-testid="clean-four-report-tabs"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 no-print"
            >
              <button
                type="button"
                data-testid="report-btn-morning"
                onClick={() => setActiveCleanReport('morning')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'morning'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Sun className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? '10 दिन की सुबह की रिपोर्ट' : '10-Day Morning Report'}</span>
              </button>

              <button
                type="button"
                data-testid="report-btn-evening"
                onClick={() => setActiveCleanReport('evening')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'evening'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Moon className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? '10 दिन की शाम की रिपोर्ट' : '10-Day Evening Report'}</span>
              </button>

              <button
                type="button"
                data-testid="report-btn-tenday"
                onClick={() => setActiveCleanReport('tenday')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'tenday'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'hi' ? '10 दिन की सुबह-शाम की रिपोर्ट' : '10-Day Morning-Evening'}
                </span>
              </button>

              <button
                type="button"
                data-testid="report-btn-profit-loss"
                onClick={() => setActiveCleanReport('profit_loss')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'profit_loss'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? 'लाभ-हानि रिपोर्ट' : 'Profit & Loss Report'}</span>
              </button>
            </div>

            {/* REPORT 1 & 2: सुबह के 10 दिन का बिल (10-Day Morning Bill) & शाम के 10 दिन का बिल (10-Day Evening Bill) */}
            {(activeCleanReport === 'morning' || activeCleanReport === 'evening') &&
              (() => {
                const shiftType = activeCleanReport === 'morning' ? 'morning' : 'evening';
                const { fromDate, toDate } = getTenDayCycleDates(billYearMonth, billCycle);
                const billReport = buildAllFarmersTenDayBillRows(
                  sortedFarmers,
                  state.collections,
                  fromDate,
                  toDate,
                  shiftType
                );

                // Single farmer day-by-day entries when a specific farmer is selected
                const singleFarmerEntries =
                  reportFarmerFilter !== 'all'
                    ? state.collections
                        .filter(
                          (c) =>
                            c.date >= fromDate &&
                            c.date <= toDate &&
                            c.shift === shiftType &&
                            c.farmerId === reportFarmerFilter
                        )
                        .sort((a, b) => a.date.localeCompare(b.date))
                    : [];
                const singleFarmerSum = calculateCollectionSummary(singleFarmerEntries);
                const activeSum =
                  reportFarmerFilter === 'all' ? billReport.overallSummary : singleFarmerSum;

                return (
                  <div
                    data-testid={`clean-report-view-${shiftType}`}
                    className="space-y-3 pt-2 border-t border-slate-100"
                  >
                    {/* Filter Controls: Month, 10-Day Period, Farmer Filter */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 no-print">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'महीना चुनें' : 'Month'}
                        </label>
                        <input
                          type="month"
                          value={billYearMonth}
                          onChange={(e) => setBillYearMonth(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? '10-दिन की अवधि' : '10-Day Period'}
                        </label>
                        <select
                          value={billCycle}
                          onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value={1}>1 से 10 तारीख (Cycle 1)</option>
                          <option value={2}>11 से 20 तारीख (Cycle 2)</option>
                          <option value={3}>21 से महीने के अंत तक (Cycle 3)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'किसान चुनें (कोड क्रमानुसार)' : 'Select Farmer'}
                        </label>
                        <select
                          value={reportFarmerFilter}
                          onChange={(e) => setReportFarmerFilter(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl font-semibold"
                        >
                          <option value="all">सभी किसान — कोड नं. 1, 2, 3... (All Farmers)</option>
                          {sortedFarmers.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.code} — {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* TOP DATE HEADER & TOTAL AMOUNT BANNER (ऊपर तारीख और कुल रकम साफ दिखे) */}
                    <div
                      data-testid={`${shiftType}-bill-top-date-banner`}
                      className={`rounded-2xl p-3 sm:p-4 border-2 flex flex-wrap items-center justify-between gap-2 tabular-nums ${
                        shiftType === 'morning'
                          ? 'bg-amber-50/90 border-amber-300'
                          : 'bg-indigo-50/90 border-indigo-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
                          <span
                            data-testid={`${shiftType}-bill-date-range-text`}
                            className="text-xs sm:text-sm font-black text-blue-950"
                          >
                            तारीख: {formatDateDMY(fromDate)} से {formatDateDMY(toDate)}
                          </span>
                        </div>
                        <p className="text-xs font-extrabold text-slate-800 mt-0.5">
                          {shiftType === 'morning'
                            ? '☀️ सुबह के 10 दिन का बिल (कोड नं. के हिसाब से)'
                            : '🌙 शाम के 10 दिन का बिल (कोड नं. के हिसाब से)'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-right">
                          <span className="block text-[10px] font-bold text-slate-500">
                            कुल मात्रा (Qty)
                          </span>
                          <strong className="text-xs sm:text-sm font-extrabold text-blue-900">
                            {formatNumber(activeSum.totalLiters, 2)} L
                          </strong>
                        </div>
                        <div className="bg-emerald-600 text-white rounded-xl px-3 py-1 text-right shadow-2xs">
                          <span className="block text-[10px] font-bold text-emerald-100">
                            कुल रकम (Total Amount)
                          </span>
                          <strong
                            data-testid={`${shiftType}-bill-header-total-amount`}
                            className="text-sm sm:text-base font-black"
                          >
                            {formatWholeCurrency(activeSum.totalNetPayable)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* ALL FARMERS CODE-WISE BILL TABLE (पहली लाइन से कोड नं. 1, 2, 3... के हिसाब से) */}
                    {reportFarmerFilter === 'all' ? (
                      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden">
                        <table
                          data-testid={`all-farmers-${shiftType}-bill-table`}
                          className="w-full table-fixed text-[10.5px] sm:text-sm border-collapse tabular-nums"
                        >
                          <colgroup>
                            <col className="w-[9%] sm:w-[8%]" />
                            <col className="w-[25%] sm:w-[28%]" />
                            <col className="w-[10%]" />
                            <col className="w-[10%]" />
                            <col className="w-[13%]" />
                            <col className="w-[13%]" />
                            <col className="w-[20%] sm:w-[18%]" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-900 text-white">
                              <th className="py-2 px-0.5 sm:px-1.5 text-center font-extrabold border border-slate-700">
                                कोड
                              </th>
                              <th className="py-2 px-1 sm:px-2 text-left font-extrabold border border-slate-700">
                                किसान नाम
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-center font-extrabold border border-slate-700 bg-amber-950/80 text-amber-200">
                                FAT
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-center font-extrabold border border-slate-700 bg-indigo-950/80 text-indigo-200">
                                SNF
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-right font-extrabold border border-slate-700 bg-blue-950/80 text-blue-200">
                                रेट
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-right font-extrabold border border-slate-700">
                                लीटर
                              </th>
                              <th className="py-2 px-1 sm:px-2 text-right font-extrabold border border-slate-700 bg-emerald-900 text-emerald-100">
                                कुल रकम ₹
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {billReport.rows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="py-6 text-center text-slate-500 border border-slate-300"
                                >
                                  इस 10-दिन की अवधि में {shiftType === 'morning' ? 'सुबह' : 'शाम'} का कोई दूध रिकॉर्ड नहीं है।
                                </td>
                              </tr>
                            ) : (
                              billReport.rows.map((r, idx) => (
                                <tr
                                  key={r.rowId}
                                  data-testid={`${shiftType}-bill-farmer-row-${idx}`}
                                  className="hover:bg-slate-50"
                                >
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-center font-mono font-black text-blue-900 bg-blue-50/50 border border-slate-300">
                                    {r.farmerCode}
                                  </td>
                                  <td className="py-1.5 px-1 sm:px-2 border border-slate-300 break-words">
                                    <span className="font-extrabold text-slate-900 block leading-tight break-words">
                                      {r.farmerName}
                                    </span>
                                    <span
                                      className={`inline-block mt-0.5 px-1 py-0.2 rounded text-[9px] sm:text-[10px] font-bold ${
                                        r.shift === 'morning'
                                          ? 'bg-amber-100 text-amber-900'
                                          : 'bg-indigo-100 text-indigo-900'
                                      }`}
                                    >
                                      {r.shift === 'morning' ? '☀️ सुबह' : '🌙 शाम'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-center font-extrabold text-amber-950 bg-amber-50/30 border border-slate-300">
                                    {formatNumber(r.avgFat, 1)}
                                  </td>
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-center font-extrabold text-indigo-950 bg-indigo-50/30 border border-slate-300">
                                    {formatNumber(r.avgSnf, 1)}
                                  </td>
                                  <td
                                    data-testid={`${shiftType}-bill-row-rate-${idx}`}
                                    className="py-1.5 px-0.5 sm:px-1.5 text-right font-extrabold text-blue-900 bg-blue-50/30 border border-slate-300"
                                  >
                                    {r.avgRate !== null ? formatNumber(r.avgRate, 2) : '—'}
                                  </td>
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-right font-extrabold text-slate-900 border border-slate-300">
                                    {formatNumber(r.totalLiters, 2)}
                                  </td>
                                  <td
                                    data-testid={`${shiftType}-bill-row-amount-${idx}`}
                                    className="py-1.5 px-1 sm:px-2 text-right font-black text-emerald-900 bg-emerald-50/80 text-[11px] sm:text-sm border border-slate-300"
                                  >
                                    {formatWholeCurrency(r.totalAmount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr
                              data-testid={`${shiftType}-bill-grand-total-row`}
                              className="bg-emerald-100/90 text-slate-950 font-black border-t-2 border-emerald-500"
                            >
                              <td
                                colSpan={2}
                                className="py-2 px-1 sm:px-2 border border-slate-300 text-left"
                              >
                                कुल टोटल ({billReport.rows.length} किसान)
                              </td>
                              <td className="py-2 px-0.5 sm:px-1.5 text-center text-amber-950 border border-slate-300">
                                {formatNumber(billReport.overallSummary.avgFat, 1)}
                              </td>
                              <td className="py-2 px-0.5 sm:px-1.5 text-center text-indigo-950 border border-slate-300">
                                {formatNumber(billReport.overallSummary.avgSnf, 1)}
                              </td>
                              <td
                                data-testid={`${shiftType}-bill-grand-total-rate`}
                                className="py-2 px-0.5 sm:px-1.5 text-right text-blue-950 border border-slate-300"
                              >
                                {billReport.overallSummary.avgRate !== null
                                  ? formatNumber(billReport.overallSummary.avgRate, 2)
                                  : '—'}
                              </td>
                              <td className="py-2 px-0.5 sm:px-1.5 text-right text-slate-950 border border-slate-300">
                                {formatNumber(billReport.overallSummary.totalLiters, 2)}
                              </td>
                              <td
                                data-testid={`${shiftType}-bill-grand-total-amount`}
                                className="py-2 px-1 sm:px-2 text-right text-emerald-950 bg-emerald-200/80 text-xs sm:text-base border border-slate-300"
                              >
                                {formatWholeCurrency(billReport.overallSummary.totalNetPayable)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      /* Single Selected Farmer Day-by-Day Table for Morning or Evening */
                      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden">
                        <table className="w-full text-xs sm:text-sm border-collapse tabular-nums">
                          <thead>
                            <tr className="bg-slate-900 text-white">
                              <th className="py-2 px-1.5 text-left border border-slate-700">तारीख</th>
                              <th className="py-2 px-1 text-center border border-slate-700">FAT</th>
                              <th className="py-2 px-1 text-center border border-slate-700">SNF</th>
                              <th className="py-2 px-1 text-right border border-slate-700">रेट</th>
                              <th className="py-2 px-1 text-right border border-slate-700">मात्रा (L)</th>
                              <th className="py-2 px-1.5 text-right border border-slate-700">कुल रकम</th>
                            </tr>
                          </thead>
                          <tbody>
                            {singleFarmerEntries.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-slate-500 border border-slate-300">
                                  इस किसान की कोई एंट्री नहीं है।
                                </td>
                              </tr>
                            ) : (
                              singleFarmerEntries.map((ce) => (
                                <tr key={ce.id} className="hover:bg-slate-50">
                                  <td className="py-1.5 px-1.5 font-mono font-bold border border-slate-300">
                                    {formatDateDMY(ce.date)}
                                  </td>
                                  <td className="py-1.5 px-1 text-center font-bold text-amber-900 border border-slate-300">
                                    {formatNumber(ce.fat, 1)}
                                  </td>
                                  <td className="py-1.5 px-1 text-center font-bold text-indigo-900 border border-slate-300">
                                    {formatNumber(ce.snf, 1)}
                                  </td>
                                  <td className="py-1.5 px-1 text-right font-bold text-blue-900 border border-slate-300">
                                    ₹{formatNumber(ce.rate, 2)}
                                  </td>
                                  <td className="py-1.5 px-1 text-right font-bold text-slate-900 border border-slate-300">
                                    {formatNumber(ce.liters, 2)}
                                  </td>
                                  <td className="py-1.5 px-1.5 text-right font-black text-emerald-800 border border-slate-300">
                                    {formatWholeCurrency(ce.totalAmount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-emerald-100 font-black">
                              <td className="py-2 px-1.5 border border-slate-300">
                                कुल टोटल ({singleFarmerEntries.length})
                              </td>
                              <td className="py-2 px-1 text-center border border-slate-300">
                                {formatNumber(singleFarmerSum.avgFat, 1)}
                              </td>
                              <td className="py-2 px-1 text-center border border-slate-300">
                                {formatNumber(singleFarmerSum.avgSnf, 1)}
                              </td>
                              <td className="py-2 px-1 text-right text-blue-950 border border-slate-300">
                                {singleFarmerSum.avgRate !== null
                                  ? `₹${formatNumber(singleFarmerSum.avgRate, 2)}`
                                  : '—'}
                              </td>
                              <td className="py-2 px-1 text-right border border-slate-300">
                                {formatNumber(singleFarmerSum.totalLiters, 2)} L
                              </td>
                              <td className="py-2 px-1.5 text-right text-emerald-900 border border-slate-300">
                                {formatWholeCurrency(singleFarmerSum.totalNetPayable)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* REPORT 3: 10 दिन की सुबह-शाम (दोनों शिफ्ट) की रिपोर्ट एवं बिल (10-Day Morning-Evening Bill) */}
            {activeCleanReport === 'tenday' &&
              (() => {
                const { fromDate, toDate } = getTenDayCycleDates(billYearMonth, billCycle);
                const allFarmersBothBill = buildAllFarmersTenDayBillRows(
                  sortedFarmers,
                  state.collections,
                  fromDate,
                  toDate,
                  'both'
                );

                const periodEntries = state.collections
                  .filter(
                    (c) =>
                      c.date >= fromDate &&
                      c.date <= toDate &&
                      (reportFarmerFilter === 'all' || c.farmerId === reportFarmerFilter)
                  )
                  .sort((a, b) => a.date.localeCompare(b.date));

                const mornEntries = periodEntries.filter((c) => c.shift === 'morning');
                const eveEntries = periodEntries.filter((c) => c.shift === 'evening');
                const mornSum = calculateCollectionSummary(mornEntries);
                const eveSum = calculateCollectionSummary(eveEntries);
                const totalSum = calculateCollectionSummary(periodEntries);

                const selectedReportFarmer =
                  reportFarmerFilter !== 'all'
                    ? sortedFarmers.find((f) => f.id === reportFarmerFilter) || null
                    : null;
                const farmerSched = selectedReportFarmer
                  ? normalizeFarmerShiftSchedule(selectedReportFarmer.shiftSchedule)
                  : 'both';

                // Rule for single-farmer view: If a farmer only brings milk in Morning (or only Evening), ONLY show that shift's box & table; hide empty shift boxes!
                const showMorningSection =
                  mornEntries.length > 0 ||
                  (mornEntries.length === 0 &&
                    eveEntries.length === 0 &&
                    farmerSched !== 'evening');
                const showEveningSection =
                  eveEntries.length > 0 ||
                  (mornEntries.length === 0 &&
                    eveEntries.length === 0 &&
                    farmerSched === 'evening');

                // Farmer for inline accounting (Advance / Previous Balance / Inline Payment)
                const accountingFarmer =
                  selectedReportFarmer ||
                  sortedFarmers.find((f) => f.id === billFarmerId) ||
                  sortedFarmers[0] ||
                  null;
                const liveFarmerBillData = accountingFarmer
                  ? generateTenDayBillData(
                      accountingFarmer,
                      billYearMonth,
                      billCycle,
                      state.collections,
                      state.advancesAndPayments,
                      state.cattleFeed
                    )
                  : null;

                return (
                  <div
                    data-testid="clean-report-view-tenday"
                    className="space-y-3.5 pt-2 border-t border-slate-100"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 no-print">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'महीना चुनें' : 'Month'}
                        </label>
                        <input
                          type="month"
                          value={billYearMonth}
                          onChange={(e) => setBillYearMonth(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? '10-दिन की अवधि' : '10-Day Period'}
                        </label>
                        <select
                          value={billCycle}
                          onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value={1}>1 से 10 तारीख (Cycle 1)</option>
                          <option value={2}>11 से 20 तारीख (Cycle 2)</option>
                          <option value={3}>21 से महीने के अंत तक (Cycle 3)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'किसान चुनें (कोड क्रमानुसार)' : 'Select Farmer'}
                        </label>
                        <select
                          data-testid="tenday-report-farmer-select"
                          value={reportFarmerFilter}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReportFarmerFilter(val);
                            if (val !== 'all') {
                              setBillFarmerId(val);
                            }
                          }}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl font-semibold"
                        >
                          <option value="all">सभी किसान — कोड नं. 1, 2, 3... (All Farmers)</option>
                          {sortedFarmers.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.code} — {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* TOP DATE HEADER & TOTAL AMOUNT BANNER (ऊपर तो तारीख आ जाए और कुल रकम दिखे) */}
                    <div
                      data-testid="tenday-bill-top-date-banner"
                      className="rounded-2xl p-3 sm:p-4 bg-blue-50/90 border-2 border-blue-300 flex flex-wrap items-center justify-between gap-2 tabular-nums"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
                          <span
                            data-testid="tenday-bill-date-range-text"
                            className="text-xs sm:text-sm font-black text-blue-950"
                          >
                            तारीख: {formatDateDMY(fromDate)} से {formatDateDMY(toDate)}
                          </span>
                        </div>
                        <p className="text-xs font-extrabold text-slate-800 mt-0.5">
                          {reportFarmerFilter === 'all'
                            ? '☀️🌙 सभी किसानों का सुबह-शाम (दोनों शिफ्ट) का 10-दिन बिल — कोड नं. 1, 2, 3... के हिसाब से'
                            : `किसान: ${selectedReportFarmer?.code} — ${selectedReportFarmer?.name} का 10-दिन का बिल`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="bg-white border border-blue-200 rounded-xl px-2.5 py-1 text-right">
                          <span className="block text-[10px] font-bold text-slate-500">
                            कुल मात्रा (Qty)
                          </span>
                          <strong className="text-xs sm:text-sm font-extrabold text-blue-900">
                            {formatNumber(totalSum.totalLiters, 2)} L
                          </strong>
                        </div>
                        <div className="bg-emerald-600 text-white rounded-xl px-3 py-1 text-right shadow-2xs">
                          <span className="block text-[10px] font-bold text-emerald-100">
                            कुल रकम (Total Amount)
                          </span>
                          <strong
                            data-testid="tenday-bill-header-total-amount"
                            className="text-sm sm:text-base font-black"
                          >
                            {formatWholeCurrency(totalSum.totalNetPayable)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Top Summary Cards — Hide empty Evening (or Morning) box when single farmer only has one shift */}
                    <div
                      className={`grid grid-cols-2 ${
                        showMorningSection && showEveningSection
                          ? 'sm:grid-cols-4'
                          : 'sm:grid-cols-3'
                      } gap-2 text-xs tabular-nums`}
                    >
                      {showMorningSection && (
                        <div
                          data-testid="tenday-report-morning-summary-box"
                          className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200"
                        >
                          <span className="text-amber-950 font-semibold block">
                            ☀️ 10-दिन सुबह का दूध / टोटल
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">
                            {formatNumber(mornSum.totalLiters, 2)} L ·{' '}
                            {formatWholeCurrency(mornSum.totalAmount)}
                          </span>
                        </div>
                      )}
                      {showEveningSection && (
                        <div
                          data-testid="tenday-report-evening-summary-box"
                          className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200"
                        >
                          <span className="text-indigo-950 font-semibold block">
                            🌙 10-दिन शाम का दूध / टोटल
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">
                            {formatNumber(eveSum.totalLiters, 2)} L ·{' '}
                            {formatWholeCurrency(eveSum.totalAmount)}
                          </span>
                        </div>
                      )}
                      <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200">
                        <span className="text-blue-900 font-semibold block">
                          10-दिन कुल दूध · FAT/SNF
                        </span>
                        <span className="text-sm font-bold text-blue-900 mt-0.5 block">
                          {formatNumber(totalSum.totalLiters, 2)} L ·{' '}
                          {formatNumber(totalSum.avgFat, 1)}/{formatNumber(totalSum.avgSnf, 1)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-emerald-900 font-semibold block">
                          10-दिन कुल दूध राशि
                        </span>
                        <span className="text-base font-extrabold text-emerald-800 mt-0.5 block">
                          {formatWholeCurrency(totalSum.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {/* WHEN ALL FARMERS SELECTED: Show Code-Wise Table (1, 2, 3...) where Dual-Shift Farmers Have 2 Lines (सुबह and शाम) */}
                    {reportFarmerFilter === 'all' ? (
                      <div className="bg-white border-2 border-slate-300 rounded-2xl overflow-hidden">
                        <table
                          data-testid="all-farmers-both-bill-table"
                          className="w-full table-fixed text-[10.5px] sm:text-sm border-collapse tabular-nums"
                        >
                          <colgroup>
                            <col className="w-[9%] sm:w-[8%]" />
                            <col className="w-[25%] sm:w-[28%]" />
                            <col className="w-[10%]" />
                            <col className="w-[10%]" />
                            <col className="w-[13%]" />
                            <col className="w-[13%]" />
                            <col className="w-[20%] sm:w-[18%]" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-900 text-white">
                              <th className="py-2 px-0.5 sm:px-1.5 text-center font-extrabold border border-slate-700">
                                कोड
                              </th>
                              <th className="py-2 px-1 sm:px-2 text-left font-extrabold border border-slate-700">
                                किसान (शिफ्ट)
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-center font-extrabold border border-slate-700 bg-amber-950/80 text-amber-200">
                                FAT
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-center font-extrabold border border-slate-700 bg-indigo-950/80 text-indigo-200">
                                SNF
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-right font-extrabold border border-slate-700 bg-blue-950/80 text-blue-200">
                                रेट
                              </th>
                              <th className="py-2 px-0.5 sm:px-1.5 text-right font-extrabold border border-slate-700">
                                लीटर
                              </th>
                              <th className="py-2 px-1 sm:px-2 text-right font-extrabold border border-slate-700 bg-emerald-900 text-emerald-100">
                                कुल रकम ₹
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {allFarmersBothBill.rows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="py-6 text-center text-slate-500 border border-slate-300"
                                >
                                  इस 10-दिन की अवधि में कोई दूध रिकॉर्ड नहीं है।
                                </td>
                              </tr>
                            ) : (
                              allFarmersBothBill.rows.map((r, idx) => (
                                <tr
                                  key={r.rowId}
                                  data-testid={`both-bill-farmer-row-${idx}`}
                                  className={`${
                                    r.shift === 'morning'
                                      ? 'bg-amber-50/20 hover:bg-amber-50/50'
                                      : 'bg-indigo-50/20 hover:bg-indigo-50/50'
                                  } ${
                                    r.isDualShiftFarmer && r.shiftRowIndex === 2
                                      ? 'border-b-2 border-slate-400'
                                      : ''
                                  }`}
                                >
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-center font-mono font-black text-blue-900 bg-blue-50/60 border border-slate-300">
                                    {r.farmerCode}
                                  </td>
                                  <td className="py-1.5 px-1 sm:px-2 border border-slate-300 break-words">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBillFarmerId(r.farmerId);
                                        setReportFarmerFilter(r.farmerId);
                                      }}
                                      className="text-left font-extrabold text-slate-900 hover:text-blue-700 block leading-tight break-words"
                                    >
                                      {r.farmerName}
                                    </button>
                                    <div className="flex flex-wrap items-center gap-0.5 mt-0.5">
                                      <span
                                        className={`inline-block px-1 py-0.2 rounded text-[9px] sm:text-[10px] font-extrabold ${
                                          r.shift === 'morning'
                                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                            : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                        }`}
                                      >
                                        {r.shift === 'morning' ? '☀️ सुबह' : '🌙 शाम'}
                                      </span>
                                      {r.isDualShiftFarmer && r.shiftRowIndex === 2 && (
                                        <span className="text-[9px] sm:text-[10px] font-extrabold text-emerald-800 bg-emerald-50 px-1 rounded border border-emerald-200 leading-tight">
                                          दोनों: {formatWholeCurrency(r.farmerCombinedAmount)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-center font-extrabold text-amber-950 bg-amber-50/30 border border-slate-300">
                                    {formatNumber(r.avgFat, 1)}
                                  </td>
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-center font-extrabold text-indigo-950 bg-indigo-50/30 border border-slate-300">
                                    {formatNumber(r.avgSnf, 1)}
                                  </td>
                                  <td
                                    data-testid={`both-bill-row-rate-${idx}`}
                                    className="py-1.5 px-0.5 sm:px-1.5 text-right font-extrabold text-blue-900 bg-blue-50/30 border border-slate-300"
                                  >
                                    {r.avgRate !== null ? formatNumber(r.avgRate, 2) : '—'}
                                  </td>
                                  <td className="py-1.5 px-0.5 sm:px-1.5 text-right font-extrabold text-slate-900 border border-slate-300">
                                    {formatNumber(r.totalLiters, 2)}
                                  </td>
                                  <td
                                    data-testid={`both-bill-row-amount-${idx}`}
                                    className="py-1.5 px-1 sm:px-2 text-right font-black text-emerald-900 bg-emerald-50/80 text-[11px] sm:text-sm border border-slate-300"
                                  >
                                    {formatWholeCurrency(r.totalAmount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-amber-50/90 text-amber-950 font-extrabold">
                              <td colSpan={2} className="py-1.5 px-1 sm:px-2 border border-slate-300">
                                ☀️ सुबह टोटल
                              </td>
                              <td className="py-1.5 px-0.5 text-center border border-slate-300">
                                {formatNumber(allFarmersBothBill.morningSummary.avgFat, 1)}
                              </td>
                              <td className="py-1.5 px-0.5 text-center border border-slate-300">
                                {formatNumber(allFarmersBothBill.morningSummary.avgSnf, 1)}
                              </td>
                              <td className="py-1.5 px-0.5 text-right text-blue-950 border border-slate-300">
                                {allFarmersBothBill.morningSummary.avgRate !== null
                                  ? formatNumber(allFarmersBothBill.morningSummary.avgRate, 2)
                                  : '—'}
                              </td>
                              <td className="py-1.5 px-0.5 text-right border border-slate-300">
                                {formatNumber(allFarmersBothBill.morningSummary.totalLiters, 2)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-black text-emerald-900 bg-emerald-50/60 border border-slate-300">
                                {formatWholeCurrency(allFarmersBothBill.morningSummary.totalNetPayable)}
                              </td>
                            </tr>
                            <tr className="bg-indigo-50/90 text-indigo-950 font-extrabold">
                              <td colSpan={2} className="py-1.5 px-1 sm:px-2 border border-slate-300">
                                🌙 शाम टोटल
                              </td>
                              <td className="py-1.5 px-0.5 text-center border border-slate-300">
                                {formatNumber(allFarmersBothBill.eveningSummary.avgFat, 1)}
                              </td>
                              <td className="py-1.5 px-0.5 text-center border border-slate-300">
                                {formatNumber(allFarmersBothBill.eveningSummary.avgSnf, 1)}
                              </td>
                              <td className="py-1.5 px-0.5 text-right text-blue-950 border border-slate-300">
                                {allFarmersBothBill.eveningSummary.avgRate !== null
                                  ? formatNumber(allFarmersBothBill.eveningSummary.avgRate, 2)
                                  : '—'}
                              </td>
                              <td className="py-1.5 px-0.5 text-right border border-slate-300">
                                {formatNumber(allFarmersBothBill.eveningSummary.totalLiters, 2)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-black text-emerald-900 bg-emerald-50/60 border border-slate-300">
                                {formatWholeCurrency(allFarmersBothBill.eveningSummary.totalNetPayable)}
                              </td>
                            </tr>
                            <tr
                              data-testid="both-bill-grand-total-row"
                              className="bg-emerald-100 text-slate-950 font-black border-t-2 border-emerald-500"
                            >
                              <td colSpan={2} className="py-2 px-1 sm:px-2 border border-slate-300">
                                कुल टोटल रकम ({allFarmersBothBill.distinctFarmerCount} किसान)
                              </td>
                              <td className="py-2 px-0.5 text-center text-amber-950 border border-slate-300">
                                {formatNumber(allFarmersBothBill.overallSummary.avgFat, 1)}
                              </td>
                              <td className="py-2 px-0.5 text-center text-indigo-950 border border-slate-300">
                                {formatNumber(allFarmersBothBill.overallSummary.avgSnf, 1)}
                              </td>
                              <td
                                data-testid="both-bill-grand-total-rate"
                                className="py-2 px-0.5 text-right text-blue-950 border border-slate-300"
                              >
                                {allFarmersBothBill.overallSummary.avgRate !== null
                                  ? formatNumber(allFarmersBothBill.overallSummary.avgRate, 2)
                                  : '—'}
                              </td>
                              <td className="py-2 px-0.5 text-right text-slate-950 border border-slate-300">
                                {formatNumber(allFarmersBothBill.overallSummary.totalLiters, 2)}
                              </td>
                              <td
                                data-testid="both-bill-grand-total-amount"
                                className="py-2 px-1 sm:px-2 text-right text-emerald-950 bg-emerald-200/80 text-xs sm:text-base border border-slate-300"
                              >
                                {formatWholeCurrency(allFarmersBothBill.overallSummary.totalNetPayable)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <>
                        {/* SINGLE FARMER VIEW: TABLE 1 सुबह का रिकॉर्ड & TABLE 2 शाम का रिकॉर्ड */}
                        {showMorningSection && (
                          <div
                            data-testid="tenday-morning-records-block"
                            className="bg-white border-2 border-amber-200 rounded-2xl overflow-hidden"
                          >
                            <div className="bg-amber-50 px-3 py-2 border-b border-amber-200 flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-extrabold text-amber-950 flex items-center gap-1.5">
                                <Sun className="w-4 h-4 text-amber-600 shrink-0" />
                                सुबह का दूध रिकॉर्ड ({formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-white border border-amber-300 text-[11px] font-extrabold text-amber-900 tabular-nums">
                                सुबह टोटल: {formatNumber(mornSum.totalLiters, 2)} L · {formatWholeCurrency(mornSum.totalAmount)}
                              </span>
                            </div>

                            <table className="w-full text-xs sm:text-sm border-collapse tabular-nums">
                              <thead>
                                <tr className="bg-slate-50 text-slate-800 border-b border-slate-300">
                                  <th className="py-1.5 px-1 sm:px-2 text-left font-extrabold border border-slate-300">तारीख</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-right font-extrabold border border-slate-300">लीटर</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-center font-extrabold border border-slate-300 bg-amber-50/60 text-amber-950">FAT</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-center font-extrabold border border-slate-300 bg-indigo-50/60 text-indigo-950">SNF</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-right font-extrabold border border-slate-300">रेट</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-right font-extrabold border border-slate-300">कुल रकम</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mornEntries.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="py-4 text-center text-slate-500 border border-slate-300">
                                      इस अवधि में सुबह की कोई दूध एंट्री नहीं है।
                                    </td>
                                  </tr>
                                ) : (
                                  mornEntries.map((ce) => (
                                    <tr key={ce.id} className="hover:bg-amber-50/20">
                                      <td className="py-1.5 px-1 sm:px-2 border border-slate-300 whitespace-nowrap font-mono font-bold text-slate-900">
                                        {formatDateDMY(ce.date)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-slate-900 whitespace-nowrap border border-slate-300">
                                        {formatNumber(ce.liters, 2)} L
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-amber-900 bg-amber-50/30 whitespace-nowrap border border-slate-300">
                                        {formatNumber(ce.fat, 1)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-indigo-900 bg-indigo-50/30 whitespace-nowrap border border-slate-300">
                                        {formatNumber(ce.snf, 1)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-right font-bold text-blue-900 whitespace-nowrap border border-slate-300">
                                        ₹{formatNumber(ce.rate, 2)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-emerald-800 whitespace-nowrap border border-slate-300">
                                        {formatWholeCurrency(ce.totalAmount)}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              <tfoot>
                                <tr
                                  data-testid="tenday-morning-total-row"
                                  className="bg-amber-100/90 text-slate-950 font-extrabold border-t-2 border-amber-400"
                                >
                                  <td className="py-2 px-1 sm:px-2 border border-slate-300">
                                    सुबह का टोटल ({mornEntries.length})
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-right text-blue-950 whitespace-nowrap border border-slate-300">
                                    {formatNumber(mornSum.totalLiters, 2)} L
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-center text-amber-950 whitespace-nowrap border border-slate-300">
                                    {formatNumber(mornSum.avgFat, 1)}
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-center text-indigo-950 whitespace-nowrap border border-slate-300">
                                    {formatNumber(mornSum.avgSnf, 1)}
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-right text-blue-950 whitespace-nowrap border border-slate-300">
                                    {mornSum.avgRate !== null ? `₹${formatNumber(mornSum.avgRate, 2)}` : '—'}
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-right text-emerald-900 whitespace-nowrap border border-slate-300">
                                    {formatWholeCurrency(mornSum.totalAmount)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}

                        {showEveningSection && (
                          <div
                            data-testid="tenday-evening-records-block"
                            className="bg-white border-2 border-indigo-200 rounded-2xl overflow-hidden"
                          >
                            <div className="bg-indigo-50 px-3 py-2 border-b border-indigo-200 flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-extrabold text-indigo-950 flex items-center gap-1.5">
                                <Moon className="w-4 h-4 text-indigo-600 shrink-0" />
                                शाम का दूध रिकॉर्ड ({formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-white border border-indigo-300 text-[11px] font-extrabold text-indigo-900 tabular-nums">
                                शाम टोटल: {formatNumber(eveSum.totalLiters, 2)} L · {formatWholeCurrency(eveSum.totalAmount)}
                              </span>
                            </div>

                            <table className="w-full text-xs sm:text-sm border-collapse tabular-nums">
                              <thead>
                                <tr className="bg-slate-50 text-slate-800 border-b border-slate-300">
                                  <th className="py-1.5 px-1 sm:px-2 text-left font-extrabold border border-slate-300">तारीख</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-right font-extrabold border border-slate-300">लीटर</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-center font-extrabold border border-slate-300 bg-amber-50/60 text-amber-950">FAT</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-center font-extrabold border border-slate-300 bg-indigo-50/60 text-indigo-950">SNF</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-right font-extrabold border border-slate-300">रेट</th>
                                  <th className="py-1.5 px-1 sm:px-2 text-right font-extrabold border border-slate-300">कुल रकम</th>
                                </tr>
                              </thead>
                              <tbody>
                                {eveEntries.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="py-4 text-center text-slate-500 border border-slate-300">
                                      इस अवधि में शाम की कोई दूध एंट्री नहीं है।
                                    </td>
                                  </tr>
                                ) : (
                                  eveEntries.map((ce) => (
                                    <tr key={ce.id} className="hover:bg-indigo-50/20">
                                      <td className="py-1.5 px-1 sm:px-2 border border-slate-300 whitespace-nowrap font-mono font-bold text-slate-900">
                                        {formatDateDMY(ce.date)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-slate-900 whitespace-nowrap border border-slate-300">
                                        {formatNumber(ce.liters, 2)} L
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-amber-900 bg-amber-50/30 whitespace-nowrap border border-slate-300">
                                        {formatNumber(ce.fat, 1)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-indigo-900 bg-indigo-50/30 whitespace-nowrap border border-slate-300">
                                        {formatNumber(ce.snf, 1)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-right font-bold text-blue-900 whitespace-nowrap border border-slate-300">
                                        ₹{formatNumber(ce.rate, 2)}
                                      </td>
                                      <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-emerald-800 whitespace-nowrap border border-slate-300">
                                        {formatWholeCurrency(ce.totalAmount)}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              <tfoot>
                                <tr
                                  data-testid="tenday-evening-total-row"
                                  className="bg-indigo-100/90 text-slate-950 font-extrabold border-t-2 border-indigo-400"
                                >
                                  <td className="py-2 px-1 sm:px-2 border border-slate-300">
                                    शाम का टोटल ({eveEntries.length})
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-right text-blue-950 whitespace-nowrap border border-slate-300">
                                    {formatNumber(eveSum.totalLiters, 2)} L
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-center text-amber-950 whitespace-nowrap border border-slate-300">
                                    {formatNumber(eveSum.avgFat, 1)}
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-center text-indigo-950 whitespace-nowrap border border-slate-300">
                                    {formatNumber(eveSum.avgSnf, 1)}
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-right text-blue-950 whitespace-nowrap border border-slate-300">
                                    {eveSum.avgRate !== null ? `₹${formatNumber(eveSum.avgRate, 2)}` : '—'}
                                  </td>
                                  <td className="py-2 px-1 sm:px-2 text-right text-emerald-900 whitespace-nowrap border border-slate-300">
                                    {formatWholeCurrency(eveSum.totalAmount)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </>
                    )}

                    {/* COMBINED MORNING + EVENING TOTAL + ADVANCE/BALANCE ADJUSTMENT + INLINE PAYMENT */}
                    <div
                      data-testid="tenday-combined-accounting-card"
                      className="bg-blue-50/70 border-2 border-blue-300 rounded-2xl p-3.5 sm:p-4 space-y-3 tabular-nums"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 pb-2.5">
                        <div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-blue-950">
                            सुबह + शाम का टोटल एवं एडवांस / बकाया जोड़-घटाव व भुगतान
                          </h4>
                          {accountingFarmer && (
                            <p className="text-xs font-bold text-slate-700 mt-0.5">
                              किसान: {accountingFarmer.code} — {accountingFarmer.name} (
                              {formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 no-print">
                          {sortedFarmers.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-blue-900">
                                भुगतान हेतु किसान:
                              </span>
                              <select
                                value={accountingFarmer?.id || ''}
                                onChange={(e) => {
                                  setBillFarmerId(e.target.value);
                                }}
                                className="h-8 px-2 text-xs font-bold bg-white border border-blue-300 rounded-lg"
                              >
                                {sortedFarmers.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.code} — {f.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {accountingFarmer && liveFarmerBillData && (
                            <button
                              type="button"
                              onClick={() =>
                                openBillWhatsApp({
                                  ...liveFarmerBillData,
                                  id:
                                    activeBill?.farmerId === accountingFarmer.id
                                      ? activeBill.id
                                      : `bill_${accountingFarmer.id}_${billYearMonth}_${billCycle}`,
                                  billNumber:
                                    activeBill?.farmerId === accountingFarmer.id
                                      ? activeBill.billNumber
                                      : `UD-${billYearMonth.replace('-', '')}-C${billCycle}-${accountingFarmer.code}`,
                                  createdAt: new Date().toISOString(),
                                })
                              }
                              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-2xs"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>{lang === 'hi' ? 'WhatsApp बिल भेजें' : 'WhatsApp Bill'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {liveFarmerBillData && (
                        <>
                          <div className="bg-white border border-blue-200 rounded-xl divide-y divide-slate-200 text-xs sm:text-sm">
                            <div className="px-3 py-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700">
                                सुबह का टोटल ({formatNumber(liveFarmerBillData.morningLiters, 2)} L) + शाम का टोटल ({formatNumber(liveFarmerBillData.eveningLiters, 2)} L)
                              </span>
                              <span className="font-bold text-slate-900">
                                {formatWholeCurrency(liveFarmerBillData.morningAmount)} + {formatWholeCurrency(liveFarmerBillData.eveningAmount)}
                              </span>
                            </div>

                            <div className="px-3 py-2 flex items-center justify-between gap-2 bg-blue-50/50">
                              <span className="font-extrabold text-blue-950">
                                सुबह-शाम का कुल दूध टोटल ({formatNumber(liveFarmerBillData.totalLiters, 2)} L)
                              </span>
                              <span
                                data-testid="bill-total-milk-amount"
                                className="font-extrabold text-blue-950 text-sm sm:text-base"
                              >
                                {formatWholeCurrency(liveFarmerBillData.totalMilkAmount)}
                              </span>
                            </div>

                            <div className="px-3 py-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700">
                                पिछला बकाया / अतिरिक्त भुगतान का जोड़ या घटाव
                              </span>
                              <span
                                data-testid="bill-previous-balance"
                                className={`font-extrabold ${
                                  liveFarmerBillData.previousBalance > 0
                                    ? 'text-amber-800'
                                    : liveFarmerBillData.previousBalance < 0
                                    ? 'text-indigo-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {liveFarmerBillData.previousBalance > 0
                                  ? `+${formatWholeCurrency(liveFarmerBillData.previousBalance)} (बकाया जुड़ा)`
                                  : liveFarmerBillData.previousBalance < 0
                                  ? `-${formatWholeCurrency(Math.abs(liveFarmerBillData.previousBalance))} (अतिरिक्त घटा)`
                                  : '₹0'}
                              </span>
                            </div>

                            <div className="px-3 py-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700">
                                एडवांस और दाना/पशु-आहार रकम का घटाव (-)
                              </span>
                              <span className="font-extrabold text-red-600">
                                -
                                {formatWholeCurrency(
                                  liveFarmerBillData.advancesInPeriod +
                                    liveFarmerBillData.feedDeductionsInPeriod +
                                    liveFarmerBillData.inlineDeductions
                                )}
                              </span>
                            </div>

                            <div className="px-3 py-2 flex items-center justify-between gap-2 bg-slate-50">
                              <span className="font-extrabold text-slate-900">
                                जोड़-घटाव के बाद कुल देय बिल रकम
                              </span>
                              <span
                                data-testid="bill-payable-before-payment"
                                className="font-extrabold text-blue-900"
                              >
                                {formatWholeCurrency(
                                  liveFarmerBillData.billPayableBeforePayment ??
                                    liveFarmerBillData.netPayable +
                                      liveFarmerBillData.paymentsInPeriod
                                )}
                              </span>
                            </div>

                            <div className="px-3 py-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700">
                                इस अवधि में किया गया भुगतान (-)
                              </span>
                              <span
                                data-testid="bill-payments-in-period"
                                className="font-extrabold text-emerald-700"
                              >
                                -{formatWholeCurrency(liveFarmerBillData.paymentsInPeriod)}
                              </span>
                            </div>

                            <div className="px-3 py-2.5 flex items-center justify-between gap-2 bg-emerald-50">
                              <span className="font-extrabold text-emerald-950 text-xs sm:text-sm">
                                अंतिम शेष देय / बकाया रकम
                              </span>
                              <span
                                data-testid="bill-net-payable"
                                className="font-extrabold text-emerald-800 text-base sm:text-lg"
                              >
                                {liveFarmerBillData.netPayable < 0
                                  ? `-${formatWholeCurrency(Math.abs(liveFarmerBillData.netPayable))}`
                                  : formatWholeCurrency(liveFarmerBillData.netPayable)}
                              </span>
                            </div>
                          </div>

                          {/* Inline Payment Right Inside the 10-Day Morning-Evening Bill */}
                          {accountingFarmer && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                executeInlineCyclePayment(
                                  accountingFarmer,
                                  billYearMonth,
                                  billCycle,
                                  activeBill?.farmerId === accountingFarmer.id
                                    ? activeBill.id
                                    : undefined,
                                  activeBill?.farmerId === accountingFarmer.id
                                    ? activeBill.billNumber
                                    : undefined
                                );
                              }}
                              className="bg-white border border-blue-300 rounded-xl p-3 space-y-2.5 no-print"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-extrabold text-blue-950">
                                  💳 यहीं पर भुगतान करें ({accountingFarmer.code} — {accountingFarmer.name})
                                </span>
                                {liveFarmerBillData.netPayable > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setQuickBillPayAmount(String(liveFarmerBillData.netPayable))
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-extrabold"
                                  >
                                    पूरा बकाया भरें ({formatWholeCurrency(liveFarmerBillData.netPayable)})
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                    भुगतान रकम (₹)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    data-testid="quick-bill-pay-amount"
                                    placeholder={`जैसे ${Math.max(0, liveFarmerBillData.netPayable)}`}
                                    value={quickBillPayAmount}
                                    onChange={(e) => setQuickBillPayAmount(e.target.value)}
                                    className="w-full h-9 px-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg tabular-nums"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                    भुगतान का तरीका
                                  </label>
                                  <select
                                    value={quickBillPayMethod}
                                    onChange={(e) =>
                                      setQuickBillPayMethod(e.target.value as PaymentMethod)
                                    }
                                    className="w-full h-9 px-2.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                                  >
                                    <option value="cash">नकद (Cash)</option>
                                    <option value="upi">UPI</option>
                                    <option value="bank">बैंक (Bank)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                    टिप्पणी (वैकल्पिक)
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="भुगतान नोट..."
                                    value={quickBillPayNotes}
                                    onChange={(e) => setQuickBillPayNotes(e.target.value)}
                                    className="w-full h-9 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  data-testid="quick-bill-pay-submit-btn"
                                  className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg shadow-2xs"
                                >
                                  यहीं भुगतान सेव करें
                                </button>
                              </div>

                              {quickPaySuccessNotice && (
                                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>{quickPaySuccessNotice}</span>
                                </div>
                              )}
                            </form>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* REPORT 4: लाभ-हानि रिपोर्ट (Profit & Loss Report) */}
            {activeCleanReport === 'profit_loss' &&
              (() => {
                const { fromDate, toDate } = getTenDayCycleDates(billYearMonth, billCycle);
                const periodCollections = state.collections.filter(
                  (c) => c.date >= fromDate && c.date <= toDate
                );
                const periodSales = state.sales.filter(
                  (s) => s.date >= fromDate && s.date <= toDate
                );
                const mornPL = calculatePureProfitLoss(
                  periodCollections.filter((c) => c.shift === 'morning'),
                  periodSales.filter((s) => s.shift === 'morning')
                );
                const evePL = calculatePureProfitLoss(
                  periodCollections.filter((c) => c.shift === 'evening'),
                  periodSales.filter((s) => s.shift === 'evening')
                );
                const totalPL = calculatePureProfitLoss(periodCollections, periodSales);

                const startDay = Number(fromDate.slice(8, 10));
                const endDay = Number(toDate.slice(8, 10));
                const plRows: Array<{
                  date: string;
                  buyLiters: number;
                  buyAmt: number;
                  saleLiters: number;
                  saleAmt: number;
                  netDiff: number;
                  isProfit: boolean;
                }> = [];

                for (let d = startDay; d <= endDay; d++) {
                  const dStr = `${billYearMonth}-${String(d).padStart(2, '0')}`;
                  const dCol = periodCollections.filter((c) => c.date === dStr);
                  const dSal = periodSales.filter((s) => s.date === dStr);
                  const dPL = calculatePureProfitLoss(dCol, dSal);
                  plRows.push({
                    date: dStr,
                    buyLiters: dPL.purchasedLiters,
                    buyAmt: dPL.purchaseAmount,
                    saleLiters: dPL.soldLiters,
                    saleAmt: dPL.saleAmount,
                    netDiff: dPL.netDifference,
                    isProfit: dPL.isProfit,
                  });
                }

                return (
                  <div
                    data-testid="clean-report-view-profit-loss"
                    className="space-y-4 pt-2 border-t border-slate-100"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 no-print">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'महीना चुनें' : 'Month'}
                        </label>
                        <input
                          type="month"
                          value={billYearMonth}
                          onChange={(e) => setBillYearMonth(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? '10-दिन की अवधि' : '10-Day Period'}
                        </label>
                        <select
                          value={billCycle}
                          onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value={1}>1 से 10 तारीख (Cycle 1)</option>
                          <option value={2}>11 से 20 तारीख (Cycle 2)</option>
                          <option value={3}>21 से महीने के अंत तक (Cycle 3)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                        <span className="text-blue-900 font-semibold block">
                          कुल दूध खरीद (Purchase)
                        </span>
                        <span className="text-sm font-bold text-blue-900 mt-0.5 block">
                          {formatNumber(totalPL.purchasedLiters, 3)} L ·{' '}
                          {formatWholeCurrency(totalPL.purchaseAmount)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-700 font-semibold block">
                          कुल दूध बिक्री (Wholesale Sale)
                        </span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                          {formatNumber(totalPL.soldLiters, 3)} L ·{' '}
                          {formatCurrency(totalPL.saleAmount)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-600 block">सुबह व शाम का लाभ/हानि</span>
                        <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                          सुबह: {mornPL.netDifference >= 0 ? '+' : ''}
                          {formatCurrency(mornPL.netDifference)} | शाम:{' '}
                          {evePL.netDifference >= 0 ? '+' : ''}
                          {formatCurrency(evePL.netDifference)}
                        </span>
                      </div>
                      <div
                        data-testid="clean-report-pl-net-card"
                        className={`p-3 rounded-xl border-2 ${
                          totalPL.isProfit
                            ? 'bg-emerald-50 border-emerald-400'
                            : 'bg-rose-50 border-rose-400'
                        }`}
                      >
                        <span className="text-slate-800 font-bold block">
                          शुद्ध लाभ / हानि (बिक्री - खरीद)
                        </span>
                        <span
                          className={`text-base font-extrabold mt-0.5 block ${
                            totalPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {totalPL.netDifference >= 0
                            ? `+${formatCurrency(totalPL.netDifference)} (लाभ)`
                            : `${formatCurrency(totalPL.netDifference)} (हानि)`}
                        </span>
                      </div>
                    </div>

                    <div>
                      <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">तारीख</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">खरीद (L / ₹)</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">बिक्री (L / ₹)</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">लाभ / हानि</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plRows.map((r) => (
                            <tr key={r.date} className="hover:bg-slate-50">
                              <td className="py-1.5 px-1.5 sm:px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap border border-slate-300">
                                {formatDateDMY(r.date)}
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-bold text-slate-900 leading-tight">
                                  {formatNumber(r.buyLiters, 2)} L
                                </span>
                                <span className="block text-xs font-semibold text-slate-600 leading-tight">
                                  {formatWholeCurrency(r.buyAmt)}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-bold text-slate-900 leading-tight">
                                  {formatNumber(r.saleLiters, 2)} L
                                </span>
                                <span className="block text-xs font-semibold text-slate-600 leading-tight">
                                  {formatCurrency(r.saleAmt)}
                                </span>
                              </td>
                              <td
                                className={`py-1.5 px-1.5 sm:px-2.5 text-right font-extrabold whitespace-nowrap border border-slate-300 ${
                                  r.isProfit ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {r.netDiff >= 0
                                  ? `+${formatCurrency(r.netDiff)}`
                                  : formatCurrency(r.netDiff)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50/80 font-extrabold tabular-nums">
                            <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                              कुल ({formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block leading-tight">
                                {formatNumber(totalPL.purchasedLiters, 2)} L
                              </span>
                              <span className="block text-xs text-slate-700 leading-tight">
                                {formatWholeCurrency(totalPL.purchaseAmount)}
                              </span>
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block leading-tight">
                                {formatNumber(totalPL.soldLiters, 2)} L
                              </span>
                              <span className="block text-xs text-slate-700 leading-tight">
                                {formatCurrency(totalPL.saleAmount)}
                              </span>
                            </td>
                            <td
                              className={`py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300 ${
                                totalPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {totalPL.netDifference >= 0
                                ? `+${formatCurrency(totalPL.netDifference)}`
                                : formatCurrency(totalPL.netDifference)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
          </div>
        </div>
      )}

      {/* Delete Farmer Confirmation Modal (Protects Historical Records - Rule 9) */}
      <ConfirmDialog
        open={Boolean(deleteFarmerTarget)}
        title={
          deleteFarmerTarget && farmerHasHistory(deleteFarmerTarget.id)
            ? lang === 'hi'
              ? 'किसान के पुराने रिकॉर्ड मौजूद हैं — निष्क्रिय (Inactive) करें?'
              : 'Farmer Has Historical Records — Mark Inactive?'
            : lang === 'hi'
            ? 'किसान प्रोफाइल हटाएँ?'
            : 'Delete Farmer Profile?'
        }
        message={
          deleteFarmerTarget && farmerHasHistory(deleteFarmerTarget.id)
            ? lang === 'hi'
              ? `किसान "${deleteFarmerTarget.name}" की पुरानी दूध/खाता एंट्रियाँ मौजूद हैं। पुराने रिकॉर्ड नष्ट न हों, इसके लिए इस किसान को स्थायी रूप से हटाने के बजाय "Inactive (निष्क्रिय)" किया जाएगा।`
              : `Farmer "${deleteFarmerTarget.name}" has historical records. To protect past accounting, they will be marked Inactive instead of deleting past records.`
            : lang === 'hi'
            ? `क्या आप वाकई किसान "${deleteFarmerTarget?.name}" को हटाना चाहते हैं?`
            : `Are you sure you want to delete farmer "${deleteFarmerTarget?.name}"?`
        }
        confirmLabel={
          deleteFarmerTarget && farmerHasHistory(deleteFarmerTarget.id)
            ? lang === 'hi'
              ? 'हाँ, Inactive करें'
              : 'Mark Inactive'
            : lang === 'hi'
            ? 'हाँ, हटाएँ'
            : 'Delete'
        }
        onCancel={() => setDeleteFarmerTarget(null)}
        onConfirm={() => {
          if (deleteFarmerTarget) {
            if (farmerHasHistory(deleteFarmerTarget.id)) {
              onSaveFarmer({ ...deleteFarmerTarget, active: false }, true);
            } else {
              onDeleteFarmer(deleteFarmerTarget.id);
            }
          }
          setDeleteFarmerTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteAdvId)}
        title={lang === 'hi' ? 'एडवांस/भुगतान हटाएँ?' : 'Delete Advance/Payment?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस एडवांस/भुगतान रिकॉर्ड को हटाना चाहते हैं? किसान का बकाया बैलेंस तुरंत अपडेट हो जाएगा।'
            : 'Delete this transaction? Farmer balance will recalculate automatically.'
        }
        onCancel={() => setDeleteAdvId(null)}
        onConfirm={() => {
          if (deleteAdvId) onDeleteAdvancePayment(deleteAdvId);
          setDeleteAdvId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteFeedId)}
        title={lang === 'hi' ? 'दाना/पशु-आहार एंट्री हटाएँ?' : 'Delete Cattle Feed Entry?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस दाना/पशु-आहार रिकॉर्ड को हटाना चाहते हैं?'
            : 'Delete this cattle feed entry?'
        }
        onCancel={() => setDeleteFeedId(null)}
        onConfirm={() => {
          if (deleteFeedId) onDeleteCattleFeed(deleteFeedId);
          setDeleteFeedId(null);
        }}
      />

      <WhatsAppPreviewModal
        open={waModal.open}
        title={lang === 'hi' ? '10-दिन का बिल WhatsApp पर भेजें' : 'Share 10-Day Bill on WhatsApp'}
        phone={waModal.phone}
        message={waModal.message}
        lang={lang}
        onClose={() => setWaModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
