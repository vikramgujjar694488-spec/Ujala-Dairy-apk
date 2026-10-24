import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Milk,
  Plus,
  Scale,
  Smartphone,
  Sun,
  Moon,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { DairyAppState, ShiftType } from '../types/dairy';
import {
  calculateCollectionSummary,
  calculateFarmerLedger,
  calculateReconciliation,
  calculateSaleSummary,
  calculateShiftAttendance,
  formatCurrency,
  formatNumber,
  round2,
  round3,
} from '../utils/dairyCalculations';

import { generateStandaloneHtmlApp } from '../utils/standaloneHtmlGenerator';

interface DashboardViewProps {
  state: DairyAppState;
  onChangeDate: (date: string) => void;
  onChangeShift: (shift: ShiftType) => void;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onChangeDate,
  onChangeShift,
  onNavigate,
}) => {
  const [showShiftComparison, setShowShiftComparison] = useState(false);
  const lang = state.language;
  const date = state.selectedDate;
  const shift = state.selectedShift;

  const handleInstantMobileAppDownload = () => {
    const htmlCode = generateStandaloneHtmlApp(state, true);
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ujalaa_Dairy_Complete_App.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter today's records
  const dayCollections = state.collections.filter((c) => c.date === date);
  const morningCollections = dayCollections.filter((c) => c.shift === 'morning');
  const eveningCollections = dayCollections.filter((c) => c.shift === 'evening');

  const daySales = state.sales.filter((s) => s.date === date);
  const morningSales = daySales.filter((s) => s.shift === 'morning');
  const eveningSales = daySales.filter((s) => s.shift === 'evening');

  // Expenses: shift-specific vs daily general
  const dayExpenses = state.expenses.filter((e) => e.date === date);
  const morningExpenses = dayExpenses.filter((e) => e.shift === 'morning');
  const eveningExpenses = dayExpenses.filter((e) => e.shift === 'evening');

  // Summaries
  const dayColSum = calculateCollectionSummary(dayCollections);
  const mornColSum = calculateCollectionSummary(morningCollections);
  const eveColSum = calculateCollectionSummary(eveningCollections);

  const daySaleSum = calculateSaleSummary(daySales);
  const mornSaleSum = calculateSaleSummary(morningSales);
  const eveSaleSum = calculateSaleSummary(eveningSales);

  // Reconciliations (strictly separate Morning, Evening, and Full Day)
  const dayRec = calculateReconciliation(dayCollections, daySales, dayExpenses);
  const mornRec = calculateReconciliation(morningCollections, morningSales, morningExpenses);
  const eveRec = calculateReconciliation(eveningCollections, eveningSales, eveningExpenses);

  // Shift Attendance
  const mornAtt = calculateShiftAttendance(
    state.farmers,
    state.collections,
    state.leaves,
    date,
    'morning'
  );
  const eveAtt = calculateShiftAttendance(
    state.farmers,
    state.collections,
    state.leaves,
    date,
    'evening'
  );

  // Advances & Feed Deductions Today + Overall Farmer Payable Balance
  const dayAdvances = round2(
    state.advancesAndPayments
      .filter((a) => a.date === date && a.type === 'advance')
      .reduce((s, a) => s + a.amount, 0)
  );
  const dayFeedDeducted = round2(
    state.cattleFeed
      .filter((f) => f.date === date && f.paymentMode === 'deduct_from_milk')
      .reduce((s, f) => s + f.totalAmount, 0)
  );

  const totalFarmerPayableBalance = round2(
    state.farmers.reduce((sum, farmer) => {
      const ledger = calculateFarmerLedger(
        farmer,
        state.collections,
        state.advancesAndPayments,
        state.cattleFeed
      );
      return sum + ledger.closingBalance;
    }, 0)
  );

  const activeShiftColSum = shift === 'morning' ? mornColSum : eveColSum;
  const activeShiftSaleSum = shift === 'morning' ? mornSaleSum : eveSaleSum;
  const activeShiftRec = shift === 'morning' ? mornRec : eveRec;
  const activeShiftAtt = shift === 'morning' ? mornAtt : eveAtt;

  return (
    <div className="space-y-5">
      {/* Top Onboarding / Missing Setup Guidance Banners (Section 24) */}
      {(!state.rateCharts.cow || !state.rateCharts.buffalo) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                {lang === 'hi'
                  ? 'दूध की राशि निकालने के लिए पहले गाय और/या भैंस का रेट चार्ट इंपोर्ट करें।'
                  : 'Please import the Cow and/or Buffalo rate chart first to calculate milk amounts.'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {lang === 'hi'
                  ? `गाय रेट चार्ट: ${state.rateCharts.cow ? 'उपलब्ध है' : 'बाकी है'} · भैंस रेट चार्ट: ${
                      state.rateCharts.buffalo ? 'उपलब्ध है' : 'बाकी है'
                    }`
                  : `Cow Chart: ${state.rateCharts.cow ? 'Ready' : 'Pending'} · Buffalo Chart: ${
                      state.rateCharts.buffalo ? 'Ready' : 'Pending'
                    }`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('ratechart')}
            className="min-h-[44px] px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shrink-0 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {lang === 'hi' ? 'रेट चार्ट इंपोर्ट करें' : 'Import Rate Chart'}
          </button>
        </div>
      )}

      {state.farmers.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-950">
                {lang === 'hi'
                  ? 'अभी कोई किसान नहीं जोड़ा गया है — शुरुआत करने के लिए पहले किसान जोड़ें।'
                  : 'No farmers added yet — add your first farmer to begin milk collection.'}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                {lang === 'hi'
                  ? 'किसान जोड़ते समय सुबह, शाम या दोनों समय का विकल्प चुनें ताकि उपस्थिति अपने-आप ट्रैक हो।'
                  : 'Select Morning, Evening, or Both shifts while adding farmers for automatic attendance tracking.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('farmers')}
            className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {lang === 'hi' ? 'पहला किसान जोड़ें' : 'Add First Farmer'}
          </button>
        </div>
      )}

      {/* Instant Working Mobile App Download + GitHub APK Status Banner */}
      <div
        data-testid="dashboard-apk-banner"
        className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-emerald-950">
              {lang === 'hi'
                ? 'Ujalaa Dairy मोबाइल ऐप डाउनलोड एवं Android APK'
                : 'Ujalaa Dairy Mobile App Download & Android APK'}
            </p>
            <p className="text-[11px] text-emerald-800 mt-0.5">
              {lang === 'hi'
                ? 'तुरंत ऑफलाइन मोबाइल ऐप फ़ाइल डाउनलोड करें या GitHub APK स्टेटस व डाउनलोड विकल्प खोलें'
                : 'Download the instant offline mobile app file or open GitHub APK status & download'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstantMobileAppDownload}
            className="min-h-[38px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {lang === 'hi' ? 'तुरंत मोबाइल ऐप डाउनलोड करें' : 'Instant Mobile App Download'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('backup')}
            className="min-h-[38px] px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-semibold rounded-xl flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {lang === 'hi' ? 'Android APK और GitHub स्टेटस' : 'Android APK & GitHub Status'}
          </button>
        </div>
      </div>

      {/* Date & Live Shift Control Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <span className="block text-xs text-slate-500">
                {lang === 'hi' ? 'चयनित तारीख' : 'Selected Date'}
              </span>
              <input
                type="date"
                aria-label={lang === 'hi' ? 'तारीख चुनें' : 'Select Date'}
                value={date}
                onChange={(e) => onChangeDate(e.target.value)}
                className="text-sm font-bold text-slate-900 bg-transparent border-b border-slate-300 focus:border-blue-600 focus:outline-none py-0.5 tabular-nums"
              />
            </div>
          </div>

          <span className="text-slate-300 hidden sm:inline">·</span>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChangeShift('morning')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                shift === 'morning'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sun className="w-4 h-4" />
              {lang === 'hi' ? 'सुबह की शिफ्ट (Morning)' : 'Morning Shift'}
            </button>
            <button
              type="button"
              onClick={() => onChangeShift('evening')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                shift === 'evening'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Moon className="w-4 h-4" />
              {lang === 'hi' ? 'शाम की शिफ्ट (Evening)' : 'Evening Shift'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowShiftComparison((prev) => !prev)}
            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
          >
            {showShiftComparison
              ? lang === 'hi'
                ? 'तुलना तालिका छुपाएँ'
                : 'Hide Shift Comparison'
              : lang === 'hi'
              ? 'सुबह बनाम शाम की तुलना देखें'
              : 'Compare Morning vs Evening'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('collection')}
            className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Milk className="w-4 h-4" />
            {lang === 'hi'
              ? `${shift === 'morning' ? 'सुबह' : 'शाम'} की दूध एंट्री करें`
              : `Enter ${shift === 'morning' ? 'Morning' : 'Evening'} Milk`}
          </button>
        </div>
      </div>

      {/* Section 3: Live Selected Shift Dashboard Panel */}
      <div className="bg-white border border-blue-200 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
              {shift === 'morning' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>
                {lang === 'hi'
                  ? `वर्तमान लाइव शिफ्ट डैशबोर्ड: ${shift === 'morning' ? 'सुबह (Morning)' : 'शाम (Evening)'}`
                  : `Live Active Shift Dashboard: ${shift === 'morning' ? 'Morning' : 'Evening'}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{date}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {lang === 'hi'
                ? `${shift === 'morning' ? 'सुबह' : 'शाम'} की शिफ्ट का अलग लाइव हिसाब और उपस्थिति`
                : `${shift === 'morning' ? 'Morning' : 'Evening'} Shift Live Accounting & Attendance`}
            </h2>
          </div>

          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span>
              {lang === 'hi' ? 'शिफ्ट उपस्थिति:' : 'Shift Attendance:'}{' '}
              <strong className="text-blue-700 tabular-nums">
                {activeShiftAtt.presentCount}/{activeShiftAtt.totalScheduledCount} (
                {activeShiftAtt.completionPercentage}%)
              </strong>
            </span>
          </div>
        </div>

        {/* 12 Live Shift Metrics Required by Section 3 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '1. कुल दूध एंट्रियाँ' : '1. Total Entries'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {activeShiftColSum.entryCount}
            </span>
          </div>

          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? '2. कुल दूध (लीटर)' : '2. Total Milk (L)'}
            </span>
            <span className="text-lg font-bold text-blue-800 tabular-nums mt-1 block">
              {formatNumber(activeShiftColSum.totalLiters, 3)} L
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '3. औसत FAT' : '3. Avg FAT'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {formatNumber(activeShiftColSum.avgFat, 2)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '4. औसत SNF' : '4. Avg SNF'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {formatNumber(activeShiftColSum.avgSnf, 2)}
            </span>
          </div>

          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? '5. कुल खरीद राशि' : '5. Purchase Amt'}
            </span>
            <span className="text-lg font-bold text-blue-800 tabular-nums mt-1 block">
              {formatCurrency(activeShiftColSum.totalAmount)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '6. औसत खरीद रेट/L' : '6. Avg Buy Rate/L'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {activeShiftColSum.avgRate !== null ? formatCurrency(activeShiftColSum.avgRate) : '—'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '7. कुल बिक्री (लीटर)' : '7. Sold Milk (L)'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {activeShiftSaleSum.entryCount > 0
                ? `${formatNumber(activeShiftSaleSum.totalLiters, 3)} L`
                : '—'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '8. कुल बिक्री राशि' : '8. Sale Amount'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {activeShiftSaleSum.entryCount > 0
                ? formatCurrency(activeShiftSaleSum.totalNetReceivable)
                : '—'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '9. औसत बिक्री रेट' : '9. Avg Sale Rate'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {activeShiftSaleSum.avgRate !== null
                ? formatCurrency(activeShiftSaleSum.avgRate)
                : '—'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '10. शिफ्ट के खर्च' : '10. Shift Expenses'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {formatCurrency(activeShiftRec.expensesAmount)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '11. शिफ्ट का लाभ/हानि' : '11. Shift Profit/Loss'}
            </span>
            <span
              className={`text-sm font-bold tabular-nums mt-1 block ${
                activeShiftRec.status === 'calculated'
                  ? (activeShiftRec.netProfitLoss ?? 0) >= 0
                    ? 'text-emerald-700'
                    : 'text-red-600'
                  : 'text-amber-700'
              }`}
            >
              {activeShiftRec.status === 'calculated'
                ? formatCurrency(activeShiftRec.netProfitLoss)
                : lang === 'hi'
                ? activeShiftRec.statusLabelHi
                : activeShiftRec.statusLabelEn}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500 block">
              {lang === 'hi' ? '12. बचा स्टॉक / अंतर' : '12. Stock / Diff'}
            </span>
            <span className="text-sm font-bold text-slate-900 tabular-nums mt-1 block">
              {activeShiftSaleSum.entryCount > 0 && activeShiftRec.remainingStockLiters !== null
                ? `${formatNumber(activeShiftRec.remainingStockLiters, 3)} L`
                : activeShiftColSum.totalLiters > 0
                ? `${formatNumber(activeShiftColSum.totalLiters, 3)} L (स्टॉक)`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Morning vs Evening Shift Attendance & Summary Cards (Section 2 + Additional Feature #4) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Morning Card */}
        <div
          className={`bg-white rounded-2xl p-5 border transition-colors ${
            shift === 'morning' ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi' ? 'सुबह की शिफ्ट (Morning)' : 'Morning Shift Summary'}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === 'hi'
                    ? 'दूध खरीद और किसानों की शिफ्ट उपस्थिति'
                    : 'Milk collection & farmer shift attendance'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onChangeShift('morning');
                onNavigate('collection');
              }}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1"
            >
              {lang === 'hi' ? 'सुबह कलेक्शन खोलें' : 'Open Morning'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 4 Mandatory Farmer Attendance Numbers for Morning */}
          <div className="mt-3.5 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
              <span>{lang === 'hi' ? 'सुबह किसान उपस्थिति' : 'Morning Farmer Attendance'}</span>
              <span className="text-blue-700 tabular-nums">
                {lang === 'hi'
                  ? `एंट्री पूरी: ${mornAtt.completionPercentage}%`
                  : `Completed: ${mornAtt.completionPercentage}%`}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${mornAtt.completionPercentage}%` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="block text-[11px] text-slate-500">
                  {lang === 'hi' ? 'निर्धारित किसान' : 'Scheduled'}
                </span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {mornAtt.totalScheduledCount}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-emerald-700">
                  {lang === 'hi' ? 'दूध आ गया' : 'Present'}
                </span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">
                  {mornAtt.presentCount}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-amber-700">
                  {lang === 'hi' ? 'दूध आना बाकी' : 'Pending'}
                </span>
                <span className="text-sm font-bold text-amber-700 tabular-nums">
                  {mornAtt.pendingCount}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-blue-700">
                  {lang === 'hi' ? 'प्रतिशत' : 'Percent'}
                </span>
                <span className="text-sm font-bold text-blue-700 tabular-nums">
                  {mornAtt.completionPercentage}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-3 text-xs">
            <div className="p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block">
                {lang === 'hi' ? 'कुल एंट्रियाँ / लीटर' : 'Entries / Liters'}
              </span>
              <span className="font-bold text-slate-900 tabular-nums mt-0.5 block">
                {mornColSum.entryCount} · {formatNumber(mornColSum.totalLiters, 3)} L
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block">
                {lang === 'hi' ? 'औसत FAT / SNF' : 'Avg FAT / SNF'}
              </span>
              <span className="font-bold text-slate-900 tabular-nums mt-0.5 block">
                {formatNumber(mornColSum.avgFat)} / {formatNumber(mornColSum.avgSnf)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block">
                {lang === 'hi' ? 'खरीद राशि' : 'Purchase Amt'}
              </span>
              <span className="font-bold text-blue-700 tabular-nums mt-0.5 block">
                {formatCurrency(mornColSum.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Evening Card */}
        <div
          className={`bg-white rounded-2xl p-5 border transition-colors ${
            shift === 'evening' ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi' ? 'शाम की शिफ्ट (Evening)' : 'Evening Shift Summary'}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === 'hi'
                    ? 'दूध खरीद और किसानों की शिफ्ट उपस्थिति'
                    : 'Milk collection & farmer shift attendance'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onChangeShift('evening');
                onNavigate('collection');
              }}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1"
            >
              {lang === 'hi' ? 'शाम कलेक्शन खोलें' : 'Open Evening'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 4 Mandatory Farmer Attendance Numbers for Evening */}
          <div className="mt-3.5 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
              <span>{lang === 'hi' ? 'शाम किसान उपस्थिति' : 'Evening Farmer Attendance'}</span>
              <span className="text-blue-700 tabular-nums">
                {lang === 'hi'
                  ? `एंट्री पूरी: ${eveAtt.completionPercentage}%`
                  : `Completed: ${eveAtt.completionPercentage}%`}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${eveAtt.completionPercentage}%` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="block text-[11px] text-slate-500">
                  {lang === 'hi' ? 'निर्धारित किसान' : 'Scheduled'}
                </span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {eveAtt.totalScheduledCount}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-emerald-700">
                  {lang === 'hi' ? 'दूध आ गया' : 'Present'}
                </span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">
                  {eveAtt.presentCount}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-amber-700">
                  {lang === 'hi' ? 'दूध आना बाकी' : 'Pending'}
                </span>
                <span className="text-sm font-bold text-amber-700 tabular-nums">
                  {eveAtt.pendingCount}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-blue-700">
                  {lang === 'hi' ? 'प्रतिशत' : 'Percent'}
                </span>
                <span className="text-sm font-bold text-blue-700 tabular-nums">
                  {eveAtt.completionPercentage}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-3 text-xs">
            <div className="p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block">
                {lang === 'hi' ? 'कुल एंट्रियाँ / लीटर' : 'Entries / Liters'}
              </span>
              <span className="font-bold text-slate-900 tabular-nums mt-0.5 block">
                {eveColSum.entryCount} · {formatNumber(eveColSum.totalLiters, 3)} L
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block">
                {lang === 'hi' ? 'औसत FAT / SNF' : 'Avg FAT / SNF'}
              </span>
              <span className="font-bold text-slate-900 tabular-nums mt-0.5 block">
                {formatNumber(eveColSum.avgFat)} / {formatNumber(eveColSum.avgSnf)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100">
              <span className="text-slate-500 block">
                {lang === 'hi' ? 'खरीद राशि' : 'Purchase Amt'}
              </span>
              <span className="font-bold text-blue-700 tabular-nums mt-0.5 block">
                {formatCurrency(eveColSum.totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Optional Morning vs Evening Comparison Table (Section 3) */}
      {showShiftComparison && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
          <h3 className="text-base font-bold text-slate-900 mb-3">
            {lang === 'hi'
              ? `सुबह और शाम की शिफ्ट की विस्तृत तुलना (${date})`
              : `Morning vs Evening Shift Detailed Comparison (${date})`}
          </h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50 text-blue-900 border-b border-blue-100">
                <th className="py-2.5 px-3 text-left font-bold">
                  {lang === 'hi' ? 'विवरण (Metric)' : 'Metric'}
                </th>
                <th className="py-2.5 px-3 text-right font-bold">
                  {lang === 'hi' ? 'सुबह की शिफ्ट' : 'Morning Shift'}
                </th>
                <th className="py-2.5 px-3 text-right font-bold">
                  {lang === 'hi' ? 'शाम की शिफ्ट' : 'Evening Shift'}
                </th>
                <th className="py-2.5 px-3 text-right font-bold">
                  {lang === 'hi' ? 'आज का कुल योग' : 'Full Day Total'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'निर्धारित किसान / दूध आ गया' : 'Scheduled / Present Farmers'}
                </td>
                <td className="py-2 px-3 text-right">
                  {mornAtt.presentCount} / {mornAtt.totalScheduledCount} ({mornAtt.completionPercentage}%)
                </td>
                <td className="py-2 px-3 text-right">
                  {eveAtt.presentCount} / {eveAtt.totalScheduledCount} ({eveAtt.completionPercentage}%)
                </td>
                <td className="py-2 px-3 text-right font-semibold">
                  {mornAtt.presentCount + eveAtt.presentCount} /{' '}
                  {mornAtt.totalScheduledCount + eveAtt.totalScheduledCount}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'कुल दूध एंट्रियाँ' : 'Milk Collection Entries'}
                </td>
                <td className="py-2 px-3 text-right">{mornColSum.entryCount}</td>
                <td className="py-2 px-3 text-right">{eveColSum.entryCount}</td>
                <td className="py-2 px-3 text-right font-semibold">{dayColSum.entryCount}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'कुल दूध खरीद (लीटर)' : 'Total Milk Purchased (L)'}
                </td>
                <td className="py-2 px-3 text-right">{formatNumber(mornColSum.totalLiters, 3)} L</td>
                <td className="py-2 px-3 text-right">{formatNumber(eveColSum.totalLiters, 3)} L</td>
                <td className="py-2 px-3 text-right font-semibold">
                  {formatNumber(dayColSum.totalLiters, 3)} L
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'औसत FAT / औसत SNF' : 'Weighted Avg FAT / SNF'}
                </td>
                <td className="py-2 px-3 text-right">
                  {formatNumber(mornColSum.avgFat)} / {formatNumber(mornColSum.avgSnf)}
                </td>
                <td className="py-2 px-3 text-right">
                  {formatNumber(eveColSum.avgFat)} / {formatNumber(eveColSum.avgSnf)}
                </td>
                <td className="py-2 px-3 text-right font-semibold">
                  {formatNumber(dayColSum.avgFat)} / {formatNumber(dayColSum.avgSnf)}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'कुल खरीद राशि' : 'Total Purchase Amount'}
                </td>
                <td className="py-2 px-3 text-right">{formatCurrency(mornColSum.totalAmount)}</td>
                <td className="py-2 px-3 text-right">{formatCurrency(eveColSum.totalAmount)}</td>
                <td className="py-2 px-3 text-right font-semibold">
                  {formatCurrency(dayColSum.totalAmount)}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'कुल बिक्री राशि' : 'Wholesale Sale Amount'}
                </td>
                <td className="py-2 px-3 text-right">
                  {formatCurrency(mornSaleSum.totalNetReceivable)}
                </td>
                <td className="py-2 px-3 text-right">
                  {formatCurrency(eveSaleSum.totalNetReceivable)}
                </td>
                <td className="py-2 px-3 text-right font-semibold">
                  {formatCurrency(daySaleSum.totalNetReceivable)}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium text-slate-700">
                  {lang === 'hi' ? 'शुद्ध लाभ / हानि' : 'Net Profit / Loss'}
                </td>
                <td className="py-2 px-3 text-right">
                  {mornRec.status === 'calculated'
                    ? formatCurrency(mornRec.netProfitLoss)
                    : mornRec.statusLabelHi}
                </td>
                <td className="py-2 px-3 text-right">
                  {eveRec.status === 'calculated'
                    ? formatCurrency(eveRec.netProfitLoss)
                    : eveRec.statusLabelHi}
                </td>
                <td className="py-2 px-3 text-right font-semibold">
                  {dayRec.status === 'calculated'
                    ? formatCurrency(dayRec.netProfitLoss)
                    : dayRec.statusLabelHi}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Section 2: Full-Day Overall Dairy Accounting Overview */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-base font-bold text-slate-900">
            {lang === 'hi'
              ? `आज का संपूर्ण डेयरी लेखा-जोखा (${date})`
              : `Today's Complete Dairy Accounting Summary (${date})`}
          </h3>
          {daySaleSum.entryCount === 0 && dayColSum.entryCount > 0 && (
            <span className="text-xs text-amber-700 font-medium">
              {lang === 'hi'
                ? 'सूचना: थोक बिक्री का हिसाब अभी दर्ज नहीं हुआ है'
                : 'Note: Wholesale sale not recorded yet'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'आज का कुल दूध (लीटर)' : 'Today Total Milk'}
            </span>
            <span className="text-lg font-bold text-blue-900 tabular-nums mt-1 block">
              {formatNumber(dayColSum.totalLiters, 3)} L
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi'
                ? `सुबह: ${mornColSum.entryCount} · शाम: ${eveColSum.entryCount} एंट्री`
                : `Morn: ${mornColSum.entryCount} · Eve: ${eveColSum.entryCount}`}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'आज की कुल खरीद राशि' : 'Today Milk Purchase'}
            </span>
            <span className="text-lg font-bold text-blue-900 tabular-nums mt-1 block">
              {formatCurrency(dayColSum.totalAmount)}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'औसत खरीद रेट:' : 'Avg Buy Rate:'}{' '}
              {dayColSum.avgRate !== null ? `${formatCurrency(dayColSum.avgRate)}/L` : '—'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'औसत FAT / औसत SNF' : 'Weighted FAT / SNF'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {formatNumber(dayColSum.avgFat)} / {formatNumber(dayColSum.avgSnf)}
            </span>
            <span className="text-[11px] text-slate-500">
              {lang === 'hi' ? 'मात्रा-भारित औसत' : 'Volume-weighted average'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'आज की कुल बिक्री राशि' : 'Today Wholesale Sale'}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums mt-1 block">
              {daySaleSum.entryCount > 0 ? formatCurrency(daySaleSum.totalNetReceivable) : '—'}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'औसत बिक्री रेट:' : 'Avg Sale Rate:'}{' '}
              {daySaleSum.avgRate !== null ? `${formatCurrency(daySaleSum.avgRate)}/L` : '—'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'आज का लाभ या हानि' : "Today's Profit / Loss"}
            </span>
            <span
              className={`text-base font-bold tabular-nums mt-1 block ${
                dayRec.status === 'calculated'
                  ? (dayRec.netProfitLoss ?? 0) >= 0
                    ? 'text-emerald-700'
                    : 'text-red-600'
                  : 'text-amber-700'
              }`}
            >
              {dayRec.status === 'calculated'
                ? formatCurrency(dayRec.netProfitLoss)
                : lang === 'hi'
                ? dayRec.statusLabelHi
                : dayRec.statusLabelEn}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lang === 'hi' ? 'आज का कुल खर्च:' : 'Today Expense:'}{' '}
              {formatCurrency(dayRec.expensesAmount)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'आज दिया गया एडवांस' : 'Advance Given Today'}
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
              {formatCurrency(dayAdvances)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'आज दाना/पशु-आहार कटौती' : 'Cattle Feed Deducted'}
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
              {formatCurrency(dayFeedDeducted)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-600 block">
              {lang === 'hi' ? 'किसानों की कुल बकाया राशि' : 'Total Farmer Payable'}
            </span>
            <span className="text-base font-bold text-blue-800 tabular-nums mt-1 block">
              {formatCurrency(totalFarmerPayableBalance)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-600 block">
                  {lang === 'hi' ? 'खरीद और बिक्री मिलान (बचा स्टॉक)' : 'Remaining Milk Stock'}
                </span>
                <span className="text-base font-bold text-slate-900 tabular-nums mt-1 block">
                  {dayRec.remainingStockLiters !== null
                    ? `${formatNumber(dayRec.remainingStockLiters, 3)} L (${formatCurrency(
                        dayRec.remainingStockCostValue
                      )})`
                    : lang === 'hi'
                    ? 'स्टॉक मिलान बाकी'
                    : 'Stock reconciliation pending'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('sales')}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100/70 hover:bg-blue-100 rounded-lg"
              >
                {lang === 'hi' ? 'मिलान देखें' : 'Reconcile'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Key Transactions List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">
            {lang === 'hi' ? `आज के महत्वपूर्ण लेन-देन (${date})` : `Today's Key Transactions (${date})`}
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {dayCollections.length + daySales.length + dayExpenses.length}{' '}
            {lang === 'hi' ? 'रिकॉर्ड' : 'records'}
          </span>
        </div>

        {dayCollections.length === 0 && daySales.length === 0 && dayExpenses.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            {lang === 'hi'
              ? 'अभी कोई रिकॉर्ड नहीं है — दूध कलेक्शन या थोक बिक्री दर्ज करने पर यहाँ दिखाई देगा।'
              : 'No records yet — transactions for the selected date will appear here.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'प्रकार' : 'Type'}</th>
                  <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'शिफ्ट' : 'Shift'}</th>
                  <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'विवरण' : 'Details'}</th>
                  <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'मात्रा' : 'Qty'}</th>
                  <th className="py-2.5 px-3 text-right">{lang === 'hi' ? 'राशि' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {dayCollections.slice(-8).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-blue-700">
                      {lang === 'hi' ? 'दूध खरीद' : 'Milk Buy'}
                    </td>
                    <td className="py-2 px-3">
                      {c.shift === 'morning'
                        ? lang === 'hi'
                          ? 'सुबह'
                          : 'Morning'
                        : lang === 'hi'
                        ? 'शाम'
                        : 'Evening'}
                    </td>
                    <td className="py-2 px-3">
                      {c.farmerCode} - {c.farmerName} ({c.milkType === 'cow' ? 'गाय' : 'भैंस'} · FAT{' '}
                      {c.fat} · SNF {c.snf})
                    </td>
                    <td className="py-2 px-3 text-right">{formatNumber(c.liters, 3)} L</td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {formatCurrency(c.totalAmount)}
                    </td>
                  </tr>
                ))}
                {daySales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-emerald-700">
                      {lang === 'hi' ? 'थोक बिक्री' : 'Wholesale Sale'}
                    </td>
                    <td className="py-2 px-3">
                      {s.shift === 'morning'
                        ? lang === 'hi'
                          ? 'सुबह'
                          : 'Morning'
                        : lang === 'hi'
                        ? 'शाम'
                        : 'Evening'}
                    </td>
                    <td className="py-2 px-3">{s.buyerName}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(s.liters, 3)} L</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700">
                      {formatCurrency(s.netReceivable)}
                    </td>
                  </tr>
                ))}
                {dayExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-red-600">
                      {lang === 'hi' ? 'खर्च' : 'Expense'}
                    </td>
                    <td className="py-2 px-3">
                      {e.shift === 'morning'
                        ? 'सुबह'
                        : e.shift === 'evening'
                        ? 'शाम'
                        : 'दैनिक/सामान्य'}
                    </td>
                    <td className="py-2 px-3">
                      {e.category} {e.description ? `- ${e.description}` : ''}
                    </td>
                    <td className="py-2 px-3 text-right">—</td>
                    <td className="py-2 px-3 text-right font-semibold text-red-600">
                      {formatCurrency(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
