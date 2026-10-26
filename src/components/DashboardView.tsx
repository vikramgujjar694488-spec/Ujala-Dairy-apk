import React from 'react';
import {
  ArrowRight,
  Calendar,
  Milk,
  Moon,
  Sun,
  TrendingUp,
  Users,
} from 'lucide-react';
import { DairyAppState, ShiftType } from '../types/dairy';
import {
  calculateCollectionSummary,
  calculatePureProfitLoss,
  calculateSaleSummary,
  calculateShiftAttendance,
  formatCurrency,
  formatDateDMY,
  formatNumber,
  formatWholeCurrency,
} from '../utils/dairyCalculations';

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
  const lang = state.language;
  const date = state.selectedDate;
  const shift = state.selectedShift;

  // Filter selected day's records
  const dayCollections = state.collections.filter((c) => c.date === date);
  const morningCollections = dayCollections.filter((c) => c.shift === 'morning');
  const eveningCollections = dayCollections.filter((c) => c.shift === 'evening');

  const daySales = state.sales.filter((s) => s.date === date);
  const morningSales = daySales.filter((s) => s.shift === 'morning');
  const eveningSales = daySales.filter((s) => s.shift === 'evening');

  // Summaries
  const dayColSum = calculateCollectionSummary(dayCollections);
  const mornColSum = calculateCollectionSummary(morningCollections);
  const eveColSum = calculateCollectionSummary(eveningCollections);

  const daySaleSum = calculateSaleSummary(daySales);
  const mornSaleSum = calculateSaleSummary(morningSales);
  const eveSaleSum = calculateSaleSummary(eveningSales);

  // Pure Milk Profit/Loss (Sale Amount - Purchase Amount)
  const mornPL = calculatePureProfitLoss(morningCollections, morningSales);
  const evePL = calculatePureProfitLoss(eveningCollections, eveningSales);
  const dayPL = calculatePureProfitLoss(dayCollections, daySales);

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

  return (
    <div data-testid="clean-dashboard-view" className="space-y-5">
      {/* 1. Date & Shift Selection Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex items-center gap-2 bg-blue-50/70 border border-blue-200 px-3 py-1.5 rounded-xl cursor-pointer">
            <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <span className="block text-[11px] font-bold text-slate-600">
                {lang === 'hi' ? 'चयनित तारीख (दिन-महीना-साल)' : 'Selected Date (DD-MM-YYYY)'}
              </span>
              <span className="block text-sm font-extrabold text-blue-900 tabular-nums whitespace-nowrap">
                {formatDateDMY(date)}
              </span>
            </div>
            <input
              type="date"
              aria-label={lang === 'hi' ? 'तारीख चुनें' : 'Select Date'}
              value={date}
              onChange={(e) => onChangeDate(e.target.value)}
              onClick={(e) => {
                try {
                  (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                } catch {}
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
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
              {lang === 'hi' ? 'सुबह की शिफ्ट' : 'Morning Shift'}
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
              {lang === 'hi' ? 'शाम की शिफ्ट' : 'Evening Shift'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('collection')}
          className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
        >
          <Milk className="w-4 h-4" />
          {lang === 'hi'
            ? `${shift === 'morning' ? 'सुबह' : 'शाम'} की दूध एंट्री करें`
            : `Enter ${shift === 'morning' ? 'Morning' : 'Evening'} Milk`}
        </button>
      </div>

      {/* 2. ONLY the 3 Essential Day Cards: (1) दिन का कुल दूध व अमाउंट, (2) बिक्री दूध व अमाउंट, (3) लाभ-हानि */}
      <div
        data-testid="dashboard-essential-summary-cards"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {/* Card 1: दिन का कुल दूध और खरीद अमाउंट */}
        <div
          data-testid="dashboard-day-milk-purchase-card"
          className="bg-white border border-blue-200 rounded-2xl p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700">
                {lang === 'hi'
                  ? 'दिन का कुल दूध और खरीद अमाउंट'
                  : "Day's Total Milk & Purchase Amount"}
              </span>
              <Milk className="w-5 h-5 text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-slate-900">
                {formatNumber(dayColSum.totalLiters, 3)} L
              </span>
              <span className="text-2xl font-extrabold text-blue-700">
                {formatWholeCurrency(dayColSum.totalAmount)}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span>
              {lang === 'hi' ? 'सुबह:' : 'Morning:'}{' '}
              <strong className="text-slate-900">
                {formatNumber(mornColSum.totalLiters, 3)} L ({formatWholeCurrency(mornColSum.totalAmount)})
              </strong>
            </span>
            <span>
              {lang === 'hi' ? 'शाम:' : 'Evening:'}{' '}
              <strong className="text-slate-900">
                {formatNumber(eveColSum.totalLiters, 3)} L ({formatWholeCurrency(eveColSum.totalAmount)})
              </strong>
            </span>
          </div>
        </div>

        {/* Card 2: बिक्री दूध और बिक्री अमाउंट */}
        <div
          data-testid="dashboard-day-milk-sale-card"
          className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                {lang === 'hi'
                  ? 'बिक्री दूध और बिक्री अमाउंट'
                  : 'Sold Milk & Sale Amount'}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('sales')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                {lang === 'hi' ? 'बिक्री दर्ज करें' : 'Add Sale'}
              </button>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-slate-900">
                {formatNumber(daySaleSum.totalLiters, 3)} L
              </span>
              <span className="text-2xl font-extrabold text-emerald-700">
                {formatCurrency(daySaleSum.totalNetReceivable)}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span>
              {lang === 'hi' ? 'सुबह:' : 'Morning:'}{' '}
              <strong className="text-slate-900">
                {formatNumber(mornSaleSum.totalLiters, 3)} L ({formatCurrency(mornSaleSum.totalNetReceivable)})
              </strong>
            </span>
            <span>
              {lang === 'hi' ? 'शाम:' : 'Evening:'}{' '}
              <strong className="text-slate-900">
                {formatNumber(eveSaleSum.totalLiters, 3)} L ({formatCurrency(eveSaleSum.totalNetReceivable)})
              </strong>
            </span>
          </div>
        </div>

        {/* Card 3: दिन का लाभ / हानि */}
        <div
          data-testid="dashboard-today-profit-loss"
          className={`rounded-2xl p-5 border-2 flex flex-col justify-between ${
            dayPL.isProfit
              ? 'bg-emerald-50/90 border-emerald-400'
              : 'bg-rose-50/90 border-rose-400'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {lang === 'hi' ? 'दिन का लाभ / हानि (बिक्री - खरीद)' : "Day's Profit / Loss"}
              </span>
              <TrendingUp
                className={`w-5 h-5 ${dayPL.isProfit ? 'text-emerald-700' : 'text-rose-700'}`}
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
              <span
                className={`text-2xl font-extrabold ${
                  dayPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {dayPL.netDifference >= 0
                  ? `+${formatCurrency(dayPL.netDifference)}`
                  : formatCurrency(dayPL.netDifference)}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                  dayPL.isProfit
                    ? 'bg-emerald-200/80 text-emerald-900'
                    : 'bg-rose-200/80 text-rose-900'
                }`}
              >
                {dayPL.netDifference >= 0
                  ? lang === 'hi'
                    ? 'लाभ (Profit)'
                    : 'Profit'
                  : lang === 'hi'
                  ? 'हानि (Loss)'
                  : 'Loss'}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-700 tabular-nums">
            <span>
              {lang === 'hi' ? 'सुबह:' : 'AM:'}{' '}
              <strong className={mornPL.isProfit ? 'text-emerald-800' : 'text-rose-800'}>
                {mornPL.netDifference >= 0 ? '+' : ''}
                {formatCurrency(mornPL.netDifference)}
              </strong>
            </span>
            <span>
              {lang === 'hi' ? 'शाम:' : 'PM:'}{' '}
              <strong className={evePL.isProfit ? 'text-emerald-800' : 'text-rose-800'}>
                {evePL.netDifference >= 0 ? '+' : ''}
                {formatCurrency(evePL.netDifference)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Shift-wise Farmer Attendance Cards (सुबह और शाम की शिफ्ट में किसान उपस्थिति) */}
      <div
        data-testid="dashboard-shift-attendance-cards"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* Morning Shift Farmer Attendance */}
        <div
          className={`bg-white rounded-2xl p-5 border transition-colors ${
            shift === 'morning' ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? 'सुबह की शिफ्ट — किसान उपस्थिति'
                    : 'Morning Shift — Farmer Attendance'}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {lang === 'hi'
                    ? `दूध खरीद: ${formatNumber(mornColSum.totalLiters, 3)} L · ${formatWholeCurrency(mornColSum.totalAmount)}`
                    : `Milk: ${formatNumber(mornColSum.totalLiters, 3)} L · ${formatWholeCurrency(mornColSum.totalAmount)}`}
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
              {lang === 'hi' ? 'सुबह कलेक्शन' : 'Open Morning'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3.5 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                {lang === 'hi' ? 'सुबह किसान उपस्थिति' : 'Morning Attendance'}
              </span>
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
                  {lang === 'hi' ? 'आना बाकी' : 'Pending'}
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
        </div>

        {/* Evening Shift Farmer Attendance */}
        <div
          className={`bg-white rounded-2xl p-5 border transition-colors ${
            shift === 'evening' ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? 'शाम की शिफ्ट — किसान उपस्थिति'
                    : 'Evening Shift — Farmer Attendance'}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {lang === 'hi'
                    ? `दूध खरीद: ${formatNumber(eveColSum.totalLiters, 3)} L · ${formatWholeCurrency(eveColSum.totalAmount)}`
                    : `Milk: ${formatNumber(eveColSum.totalLiters, 3)} L · ${formatWholeCurrency(eveColSum.totalAmount)}`}
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
              {lang === 'hi' ? 'शाम कलेक्शन' : 'Open Evening'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3.5 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                {lang === 'hi' ? 'शाम किसान उपस्थिति' : 'Evening Attendance'}
              </span>
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
                  {lang === 'hi' ? 'आना बाकी' : 'Pending'}
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
        </div>
      </div>
    </div>
  );
};
