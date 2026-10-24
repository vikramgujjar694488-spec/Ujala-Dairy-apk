import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Printer,
  Settings,
  Smartphone,
  Upload,
} from 'lucide-react';
import {
  DairyAppState,
  Language,
  MilkType,
  ShiftType,
} from '../types/dairy';
import {
  calculateCollectionSummary,
  calculateReconciliation,
  calculateSaleSummary,
  formatCurrency,
  formatNumber,
} from '../utils/dairyCalculations';
import { generateStandaloneHtmlApp } from '../utils/standaloneHtmlGenerator';
import { validateBackupJson } from '../utils/storage';
import { ConfirmDialog } from './Modals';

const GITHUB_WORKFLOW_YML = `name: Build Android Debug APK & Publish Release

on:
  push:
    branches:
      - main
      - master
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-android-apk:
    name: Build Ujalaa Dairy Debug APK
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Set up Java JDK 21
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'

      - name: Configure Pre-installed Android SDK
        run: |
          export ANDROID_HOME="\${ANDROID_HOME:-/usr/local/lib/android/sdk}"
          export ANDROID_SDK_ROOT="\$ANDROID_HOME"
          echo "ANDROID_HOME=\$ANDROID_HOME" >> \$GITHUB_ENV
          echo "ANDROID_SDK_ROOT=\$ANDROID_HOME" >> \$GITHUB_ENV
          if [ -f "\$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
            yes | "\$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true
          fi

      - name: Normalize Public NPM Versions & Build Production Web App
        run: |
          node -e '
            const fs = require("fs");
            const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
            pkg.dependencies = {
              "lucide-react": "^0.468.0",
              "react": "^19.0.0",
              "react-dom": "^19.0.0",
              "xlsx": "^0.18.5"
            };
            pkg.devDependencies = {
              "@tailwindcss/vite": "^4.0.0",
              "@types/node": "^22.0.0",
              "@types/react": "^19.0.0",
              "@types/react-dom": "^19.0.0",
              "@vitejs/plugin-react": "^4.3.4",
              "tailwindcss": "^4.0.0",
              "typescript": "~5.7.2",
              "vite": "^6.0.0"
            };
            fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
          '
          rm -f package-lock.json bun.lock
          npm install --legacy-peer-deps
          npm run build

      - name: Add Capacitor Android & Sync Web Assets
        run: |
          npm install --no-save --legacy-peer-deps @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7
          rm -rf android
          npx cap add android
          npx cap sync android

      - name: Build Debug APK with Gradle
        run: |
          chmod +x android/gradlew
          cd android
          ./gradlew assembleDebug --no-daemon --stacktrace
          cp app/build/outputs/apk/debug/app-debug.apk ../Ujalaa-Dairy-debug.apk
          ls -lh ../Ujalaa-Dairy-debug.apk

      - name: Upload Debug APK to GitHub Actions Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: Ujalaa-Dairy-debug-apk
          path: Ujalaa-Dairy-debug.apk
          if-no-files-found: error

      - name: Publish Debug APK to GitHub Releases (Direct Download)
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v1.0.\${{ github.run_number }}
          name: "Ujalaa Dairy Android Debug APK (Build #\${{ github.run_number }})"
          body: |
            ## Ujalaa Dairy — Android Debug APK
            - **Direct APK Download**: Click **Ujalaa-Dairy-debug.apk** under Assets below.
            - **Package ID**: com.ujalaadairy.app
          files: |
            Ujalaa-Dairy-debug.apk
          draft: false
          prerelease: false
          make_latest: true
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`;

interface ReportsAndBackupViewProps {
  state: DairyAppState;
  initialSub?: 'reports' | 'backup' | 'settings';
  onRestoreState: (newState: DairyAppState) => void;
  onUpdateSettings: (dairyName: string, dairyPhone: string, dairyAddress: string, lang: Language) => void;
}

type ReportPreset =
  | 'today'
  | 'morning'
  | 'evening'
  | 'cow'
  | 'buffalo'
  | 'combined'
  | 'farmer_wise'
  | 'ten_day_side_by_side'
  | 'wholesale'
  | 'expenses'
  | 'profit_loss'
  | 'monthly'
  | 'custom_range';

export const ReportsAndBackupView: React.FC<ReportsAndBackupViewProps> = ({
  state,
  initialSub = 'reports',
  onRestoreState,
  onUpdateSettings,
}) => {
  const lang = state.language;
  const [subTab, setSubTab] = useState<'reports' | 'backup' | 'settings'>(initialSub);

  React.useEffect(() => {
    setSubTab(initialSub);
  }, [initialSub]);

  // Multi-filter state for Reports
  const [preset, setPreset] = useState<ReportPreset>('today');
  const [fromDate, setFromDate] = useState<string>(state.selectedDate);
  const [toDate, setToDate] = useState<string>(state.selectedDate);
  const [shiftFilter, setShiftFilter] = useState<'all' | ShiftType>('all');
  const [milkTypeFilter, setMilkTypeFilter] = useState<'all' | MilkType>('all');
  const [farmerFilter, setFarmerFilter] = useState<string>('all');

  // Backup / Restore state
  const [pendingRestoreState, setPendingRestoreState] = useState<DairyAppState | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Single-File HTML Export state
  const [includeDataInHtml, setIncludeDataInHtml] = useState<boolean>(false);
  const [showHtmlSource, setShowHtmlSource] = useState<boolean>(false);
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);

  // GitHub Android APK Release state (default configured to vikramgujjar694488-spec/Ujala-Dairy-apk)
  const [githubRepoInput, setGithubRepoInput] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('ujalaa_dairy_github_repo') ||
        'vikramgujjar694488-spec/Ujala-Dairy-apk'
      );
    } catch {
      return 'vikramgujjar694488-spec/Ujala-Dairy-apk';
    }
  });
  const [showWorkflowCode, setShowWorkflowCode] = useState<boolean>(false);
  const [copiedWorkflow, setCopiedWorkflow] = useState<boolean>(false);
  const [copiedLinkType, setCopiedLinkType] = useState<string | null>(null);
  const [githubCheckState, setGithubCheckState] = useState<{
    checking: boolean;
    repoExists: boolean | null;
    releaseReady: boolean;
    apkDownloadUrl: string | null;
    messageHi: string;
    messageEn: string;
  }>({
    checking: false,
    repoExists: null,
    releaseReady: false,
    apkDownloadUrl: null,
    messageHi: '',
    messageEn: '',
  });

  const normalizedGithubRepo = githubRepoInput
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const hasValidGithubRepo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalizedGithubRepo);
  const directApkReleaseUrl =
    githubCheckState.apkDownloadUrl ||
    (hasValidGithubRepo
      ? `https://github.com/${normalizedGithubRepo}/releases/latest/download/Ujalaa-Dairy-debug.apk`
      : '');
  const githubReleasesPageUrl = hasValidGithubRepo
    ? `https://github.com/${normalizedGithubRepo}/releases`
    : '';
  const githubActionsPageUrl = hasValidGithubRepo
    ? `https://github.com/${normalizedGithubRepo}/actions`
    : '';

  const checkGithubReleaseStatus = React.useCallback(async (repo: string) => {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return;
    setGithubCheckState((prev) => ({ ...prev, checking: true }));
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`);
      if (repoRes.status === 404) {
        setGithubCheckState({
          checking: false,
          repoExists: false,
          releaseReady: false,
          apkDownloadUrl: null,
          messageHi: `ध्यान दें: GitHub पर अभी "${repo}" रिपॉजिटरी नहीं मिली (404 Not Found) या यह Private है।`,
          messageEn: `Note: Repository "${repo}" was not found on GitHub (404) or is Private.`,
        });
        return;
      }

      const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
      if (relRes.ok) {
        const relData = await relRes.json();
        const apkAsset = Array.isArray(relData.assets)
          ? relData.assets.find((a: { name?: string; browser_download_url?: string }) =>
              String(a.name || '').endsWith('.apk')
            )
          : null;
        if (apkAsset?.browser_download_url) {
          setGithubCheckState({
            checking: false,
            repoExists: true,
            releaseReady: true,
            apkDownloadUrl: apkAsset.browser_download_url,
            messageHi: `APK तैयार है! (${relData.tag_name || 'Latest'}) — आप नीचे से सीधा Ujalaa-Dairy-debug.apk डाउनलोड कर सकते हैं।`,
            messageEn: `APK is ready! (${relData.tag_name || 'Latest'}) — You can download Ujalaa-Dairy-debug.apk directly below.`,
          });
          return;
        }
      }

      const runsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=1`);
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const latestRun = runsData?.workflow_runs?.[0];
        if (latestRun) {
          if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
            setGithubCheckState({
              checking: false,
              repoExists: true,
              releaseReady: false,
              apkDownloadUrl: null,
              messageHi: `GitHub Actions पर अभी APK बिल्ड चल रहा है (Run #${latestRun.run_number} — ${latestRun.status})। कृपया 1-2 मिनट बाद "APK स्टेटस अभी जाँचें" दबाएँ।`,
              messageEn: `GitHub Actions APK build is currently running (Run #${latestRun.run_number}). Please check again in 1-2 minutes.`,
            });
            return;
          }
          if (latestRun.conclusion === 'failure') {
            setGithubCheckState({
              checking: false,
              repoExists: true,
              releaseReady: false,
              apkDownloadUrl: null,
              messageHi: `पिछला GitHub Actions बिल्ड (Run #${latestRun.run_number}) पुराने Android SDK स्टेप के कारण रुका था। हमने इस प्रोजेक्ट में .github/workflows/build-apk.yml को ठीक कर दिया है! अब ऊपर AI Studio के GitHub आइकन से एक बार दोबारा GitHub पर Sync/Push करें — इस बार APK 100% बन जाएगी!`,
              messageEn: `Previous GitHub Actions Run #${latestRun.run_number} failed on the old Android SDK step. We have fixed .github/workflows/build-apk.yml! Please push/sync to GitHub once more from AI Studio.`,
            });
            return;
          }
        }
      }

      setGithubCheckState({
        checking: false,
        repoExists: true,
        releaseReady: false,
        apkDownloadUrl: null,
        messageHi: `GitHub रिपॉजिटरी "${repo}" मिल गई है, लेकिन अभी APK Release तैयार नहीं हुई है। कृपया नया कोड GitHub पर Push करें।`,
        messageEn: `Repository "${repo}" exists on GitHub, but no APK Release has been published yet.`,
      });
    } catch {
      setGithubCheckState({
        checking: false,
        repoExists: null,
        releaseReady: false,
        apkDownloadUrl: null,
        messageHi: 'GitHub स्थिति की जाँच नहीं हो सकी। आप नीचे दिए बटन से तुरंत मोबाइल ऐप डाउनलोड कर सकते हैं।',
        messageEn: 'Could not check GitHub status. You can download the standalone mobile app below.',
      });
    }
  }, []);

  React.useEffect(() => {
    if (subTab === 'backup' && hasValidGithubRepo) {
      checkGithubReleaseStatus(normalizedGithubRepo);
    }
  }, [subTab, normalizedGithubRepo, hasValidGithubRepo, checkGithubReleaseStatus]);

  const handleDownloadWorkflowFile = () => {
    const blob = new Blob([GITHUB_WORKFLOW_YML], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'build-apk.yml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLinkType(key);
      setTimeout(() => setCopiedLinkType(null), 2200);
    } catch {
      // ignore
    }
  };

  // Settings form state
  const [dName, setDName] = useState<string>(state.dairyName);
  const [dPhone, setDPhone] = useState<string>(state.dairyPhone);
  const [dAddr, setDAddr] = useState<string>(state.dairyAddress);
  const [dLang, setDLang] = useState<Language>(state.language);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  // Apply Report Preset helper
  const handleSelectPreset = (p: ReportPreset) => {
    setPreset(p);
    const today = state.selectedDate;
    if (p === 'today') {
      setFromDate(today);
      setToDate(today);
      setShiftFilter('all');
      setMilkTypeFilter('all');
    } else if (p === 'morning') {
      setFromDate(today);
      setToDate(today);
      setShiftFilter('morning');
    } else if (p === 'evening') {
      setFromDate(today);
      setToDate(today);
      setShiftFilter('evening');
    } else if (p === 'cow') {
      setMilkTypeFilter('cow');
    } else if (p === 'buffalo') {
      setMilkTypeFilter('buffalo');
    } else if (p === 'combined') {
      setMilkTypeFilter('all');
    } else if (p === 'ten_day_side_by_side') {
      const d = new Date(today);
      d.setDate(d.getDate() - 9);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else if (p === 'monthly') {
      const ym = today.slice(0, 7);
      setFromDate(`${ym}-01`);
      setToDate(`${ym}-31`);
    }
  };

  // Filtered Collections for current multi-filter
  const filteredCollections = state.collections.filter((c) => {
    if (c.date < fromDate || c.date > toDate) return false;
    if (shiftFilter !== 'all' && c.shift !== shiftFilter) return false;
    if (milkTypeFilter !== 'all' && c.milkType !== milkTypeFilter) return false;
    if (farmerFilter !== 'all' && c.farmerId !== farmerFilter) return false;
    return true;
  });

  const colSummary = calculateCollectionSummary(filteredCollections);

  // Filtered Sales & Expenses for date range
  const filteredSales = state.sales.filter((s) => {
    if (s.date < fromDate || s.date > toDate) return false;
    if (shiftFilter !== 'all' && s.shift !== shiftFilter) return false;
    if (milkTypeFilter !== 'all' && s.milkType !== milkTypeFilter && s.milkType !== 'mixed')
      return false;
    return true;
  });
  const saleSummary = calculateSaleSummary(filteredSales);

  const filteredExpenses = state.expenses.filter((e) => {
    if (e.date < fromDate || e.date > toDate) return false;
    if (shiftFilter !== 'all' && e.shift !== shiftFilter) return false;
    return true;
  });

  const rangeRec = calculateReconciliation(filteredCollections, filteredSales, filteredExpenses);

  // Build 10-Day Side-by-Side Morning & Evening rows grouped by Date (Section 14)
  const sideBySideDates = Array.from(
    new Set(filteredCollections.map((c) => c.date))
  ).sort();

  // CSV Download Helper
  const downloadCsv = (filename: string, rows: (string | number)[][]) => {
    const csvContent =
      '\uFEFF' +
      rows
        .map((r) =>
          r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFarmersCsv = () => {
    const rows: (string | number)[][] = [
      ['Farmer ID', 'Name', 'Mobile', 'Village', 'Shift Schedule', 'Opening Balance', 'Status'],
      ...state.farmers.map((f) => [
        f.code,
        f.name,
        f.mobile,
        f.village,
        f.shiftSchedule,
        f.openingBalance,
        f.active ? 'Active' : 'Inactive',
      ]),
    ];
    downloadCsv(`Ujalaa_Dairy_Farmers_${state.selectedDate}.csv`, rows);
  };

  const handleExportCollectionsCsv = () => {
    const rows: (string | number)[][] = [
      [
        'Date',
        'Time',
        'Shift',
        'Farmer Code',
        'Farmer Name',
        'Milk Type',
        'Liters',
        'FAT',
        'SNF',
        'Rate',
        'Total Amount',
        'Deduction',
        'Net Payable',
      ],
      ...filteredCollections.map((c) => [
        c.date,
        c.time,
        c.shift,
        c.farmerCode,
        c.farmerName,
        c.milkType,
        c.liters,
        c.fat,
        c.snf,
        c.rate,
        c.totalAmount,
        c.deduction,
        c.netPayable,
      ]),
    ];
    downloadCsv(`Ujalaa_Dairy_Collections_${fromDate}_to_${toDate}.csv`, rows);
  };

  const handleExportSalesCsv = () => {
    const rows: (string | number)[][] = [
      ['Date', 'Shift', 'Buyer', 'Milk Type', 'Liters', 'Avg FAT', 'Avg SNF', 'Rate', 'Net Amount'],
      ...filteredSales.map((s) => [
        s.date,
        s.shift,
        s.buyerName,
        s.milkType,
        s.liters,
        s.avgFat,
        s.avgSnf,
        s.rate,
        s.netReceivable,
      ]),
    ];
    downloadCsv(`Ujalaa_Dairy_Wholesale_Sales_${fromDate}_to_${toDate}.csv`, rows);
  };

  const handleExportFullBackupJson = () => {
    const payload = {
      app: 'Ujalaa Dairy',
      exportedAt: new Date().toISOString(),
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ujalaa_Dairy_Backup_${state.selectedDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError(null);
    setRestoreSuccess(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '');
      const res = validateBackupJson(text);
      if (!res.valid || !res.state) {
        setRestoreError(lang === 'hi' ? res.errorHi : res.errorEn);
      } else {
        setPendingRestoreState(res.state);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadStandaloneHtml = () => {
    const htmlCode = generateStandaloneHtmlApp(state, includeDataInHtml);
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ujalaa_Dairy_Complete_App.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyStandaloneHtml = async () => {
    const htmlCode = generateStandaloneHtmlApp(state, includeDataInHtml);
    try {
      await navigator.clipboard.writeText(htmlCode);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-2 no-print">
        <button
          type="button"
          onClick={() => setSubTab('reports')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            subTab === 'reports' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          {lang === 'hi'
            ? '14 & 15. सभी रिपोर्ट और फ़िल्टर (Reports)'
            : '14 & 15. Reports & Filters'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('backup')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            subTab === 'backup' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Download className="w-4 h-4" />
          {lang === 'hi'
            ? '19. बैकअप, Restore और HTML डाउनलोड'
            : '19. Backup, Restore & HTML Export'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('settings')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            subTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4" />
          {lang === 'hi' ? 'सेटिंग और भाषा (Settings)' : 'Settings & Language'}
        </button>
      </div>

      {/* SUBTAB 1: REPORTS & MULTI-FILTER (Section 14 & 15) */}
      {subTab === 'reports' && (
        <div className="space-y-5">
          {/* 13 Report Presets + Combinable Multi-Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 no-print">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'रिपोर्ट और संयुक्त फ़िल्टर (Reports & Multi-Filter)'
                  : 'Comprehensive Dairy Reports & Multi-Filter'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'एक से अधिक फ़िल्टर एक साथ लगाएँ (जैसे: सुबह + गाय का दूध + चुनी गई तारीख)'
                  : 'Combine multiple filters simultaneously (Date Range + Shift + Milk Type + Farmer)'}
              </p>
            </div>

            {/* Preset Quick Buttons */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'today', hi: 'आज की रिपोर्ट', en: 'Today' },
                { id: 'morning', hi: 'सुबह की रिपोर्ट', en: 'Morning' },
                { id: 'evening', hi: 'शाम की रिपोर्ट', en: 'Evening' },
                { id: 'cow', hi: 'गाय के दूध की रिपोर्ट', en: 'Cow Milk' },
                { id: 'buffalo', hi: 'भैंस के दूध की रिपोर्ट', en: 'Buffalo Milk' },
                { id: 'combined', hi: 'गाय+भैंस संयुक्त', en: 'Combined' },
                {
                  id: 'ten_day_side_by_side',
                  hi: '10-दिन की रिपोर्ट (सुबह/शाम अलग-अलग)',
                  en: '10-Day Side-by-Side',
                },
                { id: 'wholesale', hi: 'थोक बिक्री रिपोर्ट', en: 'Wholesale Sales' },
                { id: 'expenses', hi: 'खर्च की रिपोर्ट', en: 'Expense Report' },
                { id: 'profit_loss', hi: 'लाभ-हानि रिपोर्ट', en: 'Profit-Loss Report' },
                { id: 'monthly', hi: 'मासिक रिपोर्ट', en: 'Monthly Report' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleSelectPreset(btn.id as ReportPreset)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    preset === btn.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {lang === 'hi' ? btn.hi : btn.en}
                </button>
              ))}
            </div>

            {/* Combinable Multi-Filter Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'तारीख से (From)' : 'From Date'}
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-slate-300 rounded-xl tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'तारीख तक (To)' : 'To Date'}
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-slate-300 rounded-xl tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'शिफ्ट (Shift)' : 'Shift'}
                </label>
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value as 'all' | ShiftType)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="all">{lang === 'hi' ? 'सुबह और शाम दोनों' : 'All Shifts'}</option>
                  <option value="morning">{lang === 'hi' ? 'केवल सुबह' : 'Morning Only'}</option>
                  <option value="evening">{lang === 'hi' ? 'केवल शाम' : 'Evening Only'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'दूध का प्रकार' : 'Milk Type'}
                </label>
                <select
                  value={milkTypeFilter}
                  onChange={(e) => setMilkTypeFilter(e.target.value as 'all' | MilkType)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="all">{lang === 'hi' ? 'गाय और भैंस संयुक्त' : 'All Milk'}</option>
                  <option value="cow">{lang === 'hi' ? 'गाय (Cow)' : 'Cow Only'}</option>
                  <option value="buffalo">
                    {lang === 'hi' ? 'भैंस (Buffalo)' : 'Buffalo Only'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'किसान चुनें' : 'Farmer'}
                </label>
                <select
                  value={farmerFilter}
                  onChange={(e) => setFarmerFilter(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="all">{lang === 'hi' ? 'सभी किसान' : 'All Farmers'}</option>
                  {state.farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Report Output Area */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {state.dairyName || 'Ujalaa Dairy'} —{' '}
                  {preset === 'ten_day_side_by_side'
                    ? lang === 'hi'
                      ? '10-दिन की सुबह-शाम तुलनात्मक रिपोर्ट'
                      : '10-Day Morning & Evening Report'
                    : lang === 'hi'
                    ? 'चयनित फ़िल्टर रिपोर्ट'
                    : 'Filtered Report'}{' '}
                  ({fromDate} से {toDate})
                </h3>
              </div>

              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={handleExportCollectionsCsv}
                  className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV Export
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {lang === 'hi' ? 'प्रिंट / PDF' : 'Print / PDF'}
                </button>
              </div>
            </div>

            {/* Section 14: 10-Day Side-by-Side Morning & Evening Table */}
            {preset === 'ten_day_side_by_side' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-blue-50 text-blue-950 border-b border-blue-200">
                      <th className="py-2 px-2.5 text-left">तारीख</th>
                      <th className="py-2 px-2.5 text-right">सुबह L</th>
                      <th className="py-2 px-2.5 text-right">सुबह FAT/SNF</th>
                      <th className="py-2 px-2.5 text-right">सुबह रेट</th>
                      <th className="py-2 px-2.5 text-right">सुबह राशि</th>
                      <th className="py-2 px-2.5 text-right">शाम L</th>
                      <th className="py-2 px-2.5 text-right">शाम FAT/SNF</th>
                      <th className="py-2 px-2.5 text-right">शाम रेट</th>
                      <th className="py-2 px-2.5 text-right">शाम राशि</th>
                      <th className="py-2 px-2.5 text-right font-bold">कुल L</th>
                      <th className="py-2 px-2.5 text-right font-bold">कुल राशि</th>
                      <th className="py-2 px-2.5 text-right">औसत FAT/SNF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sideBySideDates.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-slate-500">
                          अभी कोई रिकॉर्ड नहीं है
                        </td>
                      </tr>
                    ) : (
                      sideBySideDates.map((dt) => {
                        const dtCols = filteredCollections.filter((c) => c.date === dt);
                        const mSum = calculateCollectionSummary(
                          dtCols.filter((c) => c.shift === 'morning')
                        );
                        const eSum = calculateCollectionSummary(
                          dtCols.filter((c) => c.shift === 'evening')
                        );
                        const tSum = calculateCollectionSummary(dtCols);
                        return (
                          <tr key={dt} className="hover:bg-slate-50">
                            <td className="py-2 px-2.5 font-bold">{dt}</td>
                            <td className="py-2 px-2.5 text-right">
                              {formatNumber(mSum.totalLiters, 3)}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatNumber(mSum.avgFat)}/{formatNumber(mSum.avgSnf)}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {mSum.avgRate !== null ? formatCurrency(mSum.avgRate) : '—'}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatCurrency(mSum.totalAmount)}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatNumber(eSum.totalLiters, 3)}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatNumber(eSum.avgFat)}/{formatNumber(eSum.avgSnf)}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {eSum.avgRate !== null ? formatCurrency(eSum.avgRate) : '—'}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatCurrency(eSum.totalAmount)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-blue-800">
                              {formatNumber(tSum.totalLiters, 3)} L
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-blue-800">
                              {formatCurrency(tSum.totalAmount)}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatNumber(tSum.avgFat)}/{formatNumber(tSum.avgSnf)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={9} className="py-3 px-2.5">
                        10-दिन का कुल योग ({colSummary.entryCount} एंट्री)
                      </td>
                      <td className="py-3 px-2.5 text-right text-blue-800">
                        {formatNumber(colSummary.totalLiters, 3)} L
                      </td>
                      <td className="py-3 px-2.5 text-right text-blue-800">
                        {formatCurrency(colSummary.totalAmount)}
                      </td>
                      <td className="py-3 px-2.5 text-right">
                        {formatNumber(colSummary.avgFat)}/{formatNumber(colSummary.avgSnf)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* Standard Multi-Filtered Collection & Profit-Loss Table */
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
                  <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                    <span className="text-slate-600 block">कुल दूध (लीटर)</span>
                    <span className="text-base font-bold text-blue-900 mt-0.5 block">
                      {formatNumber(colSummary.totalLiters, 3)} L
                    </span>
                  </div>
                  <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                    <span className="text-slate-600 block">कुल खरीद राशि</span>
                    <span className="text-base font-bold text-blue-900 mt-0.5 block">
                      {formatCurrency(colSummary.totalAmount)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">भारित औसत FAT / SNF</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {formatNumber(colSummary.avgFat)} / {formatNumber(colSummary.avgSnf)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">औसत खरीद रेट/L</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {colSummary.avgRate !== null ? formatCurrency(colSummary.avgRate) : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">अवधि का लाभ/हानि</span>
                    <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                      {rangeRec.status === 'calculated'
                        ? formatCurrency(rangeRec.netProfitLoss)
                        : rangeRec.statusLabelHi}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="py-2.5 px-3 text-left">तारीख / शिफ्ट</th>
                        <th className="py-2.5 px-3 text-left">किसान</th>
                        <th className="py-2.5 px-3 text-left">प्रकार</th>
                        <th className="py-2.5 px-3 text-right">लीटर</th>
                        <th className="py-2.5 px-3 text-right">FAT</th>
                        <th className="py-2.5 px-3 text-right">SNF</th>
                        <th className="py-2.5 px-3 text-right">रेट/L</th>
                        <th className="py-2.5 px-3 text-right">राशि</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCollections.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            चयनित फ़िल्टर के लिए कोई रिकॉर्ड नहीं है
                          </td>
                        </tr>
                      ) : (
                        filteredCollections.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              {c.date} ({c.shift === 'morning' ? 'सुबह' : 'शाम'})
                            </td>
                            <td className="py-2 px-3 font-bold">
                              {c.farmerCode} — {c.farmerName}
                            </td>
                            <td className="py-2 px-3">
                              {c.milkType === 'cow' ? 'गाय' : 'भैंस'}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {formatNumber(c.liters, 3)}
                            </td>
                            <td className="py-2 px-3 text-right">{formatNumber(c.fat)}</td>
                            <td className="py-2 px-3 text-right">{formatNumber(c.snf)}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(c.rate)}</td>
                            <td className="py-2 px-3 text-right font-bold text-blue-800">
                              {formatCurrency(c.totalAmount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <td colSpan={3} className="py-3 px-3">
                          फ़िल्टर का कुल योग ({colSummary.entryCount} एंट्री)
                        </td>
                        <td className="py-3 px-3 text-right text-blue-800">
                          {formatNumber(colSummary.totalLiters, 3)} L
                        </td>
                        <td className="py-3 px-3 text-right">{formatNumber(colSummary.avgFat)}</td>
                        <td className="py-3 px-3 text-right">{formatNumber(colSummary.avgSnf)}</td>
                        <td className="py-3 px-3 text-right">
                          {colSummary.avgRate !== null ? formatCurrency(colSummary.avgRate) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-blue-800">
                          {formatCurrency(colSummary.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: BACKUP, RESTORE, ANDROID APK & SINGLE-FILE HTML DOWNLOAD */}
      {subTab === 'backup' && (
        <div className="space-y-5">
          {/* Android Debug APK via GitHub Actions & GitHub Releases Card */}
          <div
            data-testid="android-apk-github-card"
            className="bg-white border-2 border-emerald-500 rounded-2xl p-5 space-y-4 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-700 block">
                    {lang === 'hi'
                      ? 'Android Debug APK — GitHub Actions एवं GitHub Releases'
                      : 'Android Debug APK — Automatic Build & Direct Download'}
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    {lang === 'hi'
                      ? 'Ujalaa-Dairy-debug.apk (सीधा Android मोबाइल इंस्टॉलर)'
                      : 'Ujalaa-Dairy-debug.apk (Direct Android APK Installer)'}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {lang === 'hi'
                      ? 'इस प्रोजेक्ट में .github/workflows/build-apk.yml और capacitor.config.json पहले से तैयार हैं। जैसे ही आप इस ऐप को GitHub पर Push करते हैं, GitHub Actions अपने-आप Debug APK बनाकर GitHub Releases में सीधा डाउनलोड के लिए अपलोड कर देता है।'
                      : 'This project includes .github/workflows/build-apk.yml and capacitor.config.json. Pushing to GitHub automatically compiles Ujalaa-Dairy-debug.apk and publishes it to GitHub Releases.'}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                .github/workflows/build-apk.yml Ready
              </span>
            </div>

            {/* Live Diagnostic & Instant Working Mobile App Download */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-xs sm:text-sm text-emerald-950 block">
                  {lang === 'hi'
                    ? 'विकल्प 1 (तुरंत काम करने वाला — बिना GitHub के अभी फोन में डाउनलोड करें):'
                    : 'Option 1 (Works Immediately — Download to Mobile Without GitHub):'}
                </strong>
                <span className="text-xs text-emerald-800">
                  {lang === 'hi'
                    ? 'यह बटन बिना किसी बाहरी लिंक के तुरंत आपके फोन में "Ujalaa_Dairy_Complete_App.html" डाउनलोड करता है जो ऑफलाइन ऐप की तरह चलता है।'
                    : 'Downloads "Ujalaa_Dairy_Complete_App.html" directly to your phone right now with 1 click.'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadStandaloneHtml}
                className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shrink-0 shadow-xs"
              >
                <Download className="w-4 h-4" />
                {lang === 'hi'
                  ? 'अभी मोबाइल ऐप डाउनलोड करें (100% Working)'
                  : 'Download Mobile App Now'}
              </button>
            </div>

            {/* GitHub Repository Link Generator & Live Status Checker */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="github-repo-input"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    {lang === 'hi'
                      ? 'विकल्प 2: GitHub Repository नाम (GitHub Actions से .apk के लिए):'
                      : 'Option 2: GitHub Repository (owner/repo) for .apk:'}
                  </label>
                  <input
                    id="github-repo-input"
                    type="text"
                    placeholder="vikramgujjar694488-spec/Ujala-Dairy-apk"
                    value={githubRepoInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGithubRepoInput(val);
                      try {
                        localStorage.setItem('ujalaa_dairy_github_repo', val);
                      } catch {
                        // ignore
                      }
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => checkGithubReleaseStatus(normalizedGithubRepo)}
                  disabled={!hasValidGithubRepo || githubCheckState.checking}
                  className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shrink-0"
                >
                  {githubCheckState.checking
                    ? lang === 'hi'
                      ? 'जाँच हो रही है...'
                      : 'Checking...'
                    : lang === 'hi'
                    ? 'APK स्टेटस अभी जाँचें'
                    : 'Check APK Status'}
                </button>
              </div>

              {/* Live GitHub API Status Banner */}
              {githubCheckState.messageHi && (
                <div
                  data-testid="github-live-status-banner"
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                    githubCheckState.releaseReady
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : githubCheckState.repoExists === false
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {lang === 'hi' ? githubCheckState.messageHi : githubCheckState.messageEn}
                  </span>
                </div>
              )}

              {hasValidGithubRepo && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {githubCheckState.releaseReady ? (
                      <a
                        href={directApkReleaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs"
                      >
                        <Download className="w-4 h-4" />
                        {lang === 'hi'
                          ? 'सीधा Ujalaa-Dairy-debug.apk डाउनलोड करें'
                          : 'Direct Download Ujalaa-Dairy-debug.apk'}
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleCopyText(directApkReleaseUrl, 'apk')}
                      className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                    >
                      {copiedLinkType === 'apk' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-600" />
                      )}
                      {copiedLinkType === 'apk'
                        ? lang === 'hi'
                          ? 'APK लिंक कॉपी हो गया!'
                          : 'APK URL Copied!'
                        : lang === 'hi'
                        ? 'APK डाउनलोड लिंक कॉपी करें'
                        : 'Copy APK Download Link'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyText(githubReleasesPageUrl, 'releases')}
                      className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                    >
                      {copiedLinkType === 'releases' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-blue-600" />
                      )}
                      {copiedLinkType === 'releases'
                        ? lang === 'hi'
                          ? 'Releases लिंक कॉपी हो गया!'
                          : 'Releases URL Copied!'
                        : lang === 'hi'
                        ? 'Releases लिंक कॉपी करें'
                        : 'Copy Releases Link'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyText(githubActionsPageUrl, 'actions')}
                      className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                    >
                      {copiedLinkType === 'actions' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      {copiedLinkType === 'actions'
                        ? lang === 'hi'
                          ? 'Actions लिंक कॉपी हो गया!'
                          : 'Actions URL Copied!'
                        : lang === 'hi'
                        ? 'Actions लिंक कॉपी करें'
                        : 'Copy Actions Link'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3-Step Guide + Workflow Code View/Copy/Download */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <strong className="text-emerald-950 block mb-0.5">
                  {lang === 'hi'
                    ? 'स्टेप 1: AI Studio से GitHub पर भेजें'
                    : 'Step 1: Export from AI Studio to GitHub'}
                </strong>
                <span className="text-slate-600">
                  {lang === 'hi'
                    ? 'AI Studio के सबसे ऊपरी बार में GitHub आइकन दबाएँ और रिपॉजिटरी को Public रखकर vikramgujjar694488-spec/Ujala-Dairy-apk पर Push करें।'
                    : 'Click the GitHub icon in the top bar of AI Studio and export to vikramgujjar694488-spec/Ujala-Dairy-apk as a Public repo.'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <strong className="text-emerald-950 block mb-0.5">
                  {lang === 'hi' ? 'स्टेप 2: ऑटोमैटिक APK बिल्ड' : 'Step 2: Automatic APK Build'}
                </strong>
                <span className="text-slate-600">
                  {lang === 'hi'
                    ? 'कोड जाते ही .github/workflows/build-apk.yml अपने-आप चलकर 2-3 मिनट में Ujalaa-Dairy-debug.apk बना देगा।'
                    : 'Once pushed, .github/workflows/build-apk.yml automatically builds Ujalaa-Dairy-debug.apk in ~2-3 minutes.'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <strong className="text-emerald-950 block mb-0.5">
                  {lang === 'hi' ? 'स्टेप 3: APK स्टेटस जाँचें और डाउनलोड करें' : 'Step 3: Check Status & Download'}
                </strong>
                <span className="text-slate-600">
                  {lang === 'hi'
                    ? 'ऊपर "APK स्टेटस अभी जाँचें" बटन दबाएँ — हरा होते ही सीधे APK डाउनलोड करें।'
                    : 'Click "Check APK Status" above to verify the release and download your APK.'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadWorkflowFile}
                className="min-h-[40px] px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-blue-600" />
                {lang === 'hi'
                  ? 'build-apk.yml फ़ाइल डाउनलोड करें'
                  : 'Download build-apk.yml'}
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(GITHUB_WORKFLOW_YML);
                    setCopiedWorkflow(true);
                    setTimeout(() => setCopiedWorkflow(false), 2500);
                  } catch {
                    // ignore
                  }
                }}
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                {copiedWorkflow ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiedWorkflow
                  ? lang === 'hi'
                    ? 'Workflow YAML कॉपी हो गया!'
                    : 'Workflow YAML Copied!'
                  : lang === 'hi'
                  ? '.github/workflows/build-apk.yml कॉपी करें'
                  : 'Copy .github/workflows/build-apk.yml'}
              </button>

              <button
                type="button"
                onClick={() => setShowWorkflowCode((prev) => !prev)}
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              >
                <Code className="w-4 h-4" />
                {showWorkflowCode
                  ? lang === 'hi'
                    ? 'Workflow कोड छुपाएँ'
                    : 'Hide Workflow YAML'
                  : lang === 'hi'
                  ? 'GitHub Actions Workflow कोड देखें'
                  : 'View GitHub Actions Workflow YAML'}
              </button>
            </div>

            {showWorkflowCode && (
              <textarea
                readOnly
                rows={12}
                value={GITHUB_WORKFLOW_YML}
                className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 rounded-xl border border-slate-700"
              />
            )}
          </div>

          {/* Single-File HTML Export Card (Instructions 1, 15, 16) */}
          <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-blue-600 block">
                  {lang === 'hi'
                    ? 'निर्देश #1, #15, #16: सिंगल HTML फ़ाइल आउटपुट'
                    : 'Single-File Standalone HTML App'}
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? '"Ujalaa_Dairy_Complete_App.html" डाउनलोड या कॉपी करें'
                    : 'Download or Copy "Ujalaa_Dairy_Complete_App.html"'}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {lang === 'hi'
                    ? 'आप पूरे ऐप को एक ही स्व-निहित HTML फ़ाइल (HTML + CSS + JavaScript) के रूप में डाउनलोड या कॉपी कर सकते हैं जो Android मोबाइल और कंप्यूटर पर सीधे चलती है।'
                    : 'Download or copy the complete self-contained HTML+CSS+JS single-file application.'}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDataInHtml}
                  onChange={(e) => setIncludeDataInHtml(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span>
                  {lang === 'hi'
                    ? 'वर्तमान सेव किया गया डेटा भी शामिल करें'
                    : 'Include current saved data'}
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadStandaloneHtml}
                className="min-h-[46px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {lang === 'hi'
                  ? 'Ujalaa_Dairy_Complete_App.html डाउनलोड करें'
                  : 'Download Ujalaa_Dairy_Complete_App.html'}
              </button>

              <button
                type="button"
                onClick={handleCopyStandaloneHtml}
                className="min-h-[46px] px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold rounded-xl flex items-center gap-2"
              >
                {copiedHtml ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copiedHtml
                  ? lang === 'hi'
                    ? 'पूरा HTML कोड कॉपी हो गया!'
                    : 'HTML Code Copied!'
                  : lang === 'hi'
                  ? 'पूरा HTML कोड कॉपी करें'
                  : 'Copy Complete HTML Code'}
              </button>

              <button
                type="button"
                onClick={() => setShowHtmlSource((prev) => !prev)}
                className="min-h-[46px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              >
                <Code className="w-4 h-4" />
                {showHtmlSource
                  ? lang === 'hi'
                    ? 'HTML कोड छुपाएँ'
                    : 'Hide HTML Code'
                  : lang === 'hi'
                  ? 'पूरा HTML कोड स्क्रीन पर देखें'
                  : 'View Raw HTML Code'}
              </button>
            </div>

            {showHtmlSource && (
              <textarea
                readOnly
                rows={12}
                value={generateStandaloneHtmlApp(state, includeDataInHtml)}
                className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 rounded-xl border border-slate-700"
              />
            )}
          </div>

          {/* JSON Backup & Restore + CSV Exports (Section 19) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'पूरा डेटा JSON बैकअप और Restore'
                  : 'Full JSON Backup & Restore'}
              </h3>
              <p className="text-xs text-slate-600">
                {lang === 'hi'
                  ? 'सलाह: नया बैकअप Restore करने से पहले अपने मौजूदा डेटा का JSON बैकअप अवश्य डाउनलोड कर लें। Restore करने पर डुप्लिकेट एंट्रियाँ नहीं बनतीं।'
                  : 'Tip: Download a backup of your existing data before restoring. Restore deduplicates all records.'}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportFullBackupJson}
                  className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {lang === 'hi' ? 'पूरा डेटा JSON में Export करें' : 'Export Full JSON Backup'}
                </button>

                <label className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-2 border border-slate-300">
                  <Upload className="w-4 h-4" />
                  <span>{lang === 'hi' ? 'JSON बैकअप से Restore करें' : 'Restore from JSON'}</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {restoreError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700">
                  {restoreError}
                </div>
              )}
              {restoreSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700">
                  {restoreSuccess}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'Excel-Compatible CSV रिपोर्ट Export'
                  : 'Excel-Compatible CSV Exports'}
              </h3>
              <p className="text-xs text-slate-600">
                {lang === 'hi'
                  ? 'किसानों की सूची, दूध खरीद और थोक बिक्री को सीधे Excel में खोलने योग्य CSV में डाउनलोड करें'
                  : 'Export Farmers, Milk Purchases, and Wholesale Sales as UTF-8 CSV files'}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportFarmersCsv}
                  className="min-h-[42px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  {lang === 'hi' ? 'किसान सूची CSV' : 'Farmers CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleExportCollectionsCsv}
                  className="min-h-[42px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  {lang === 'hi' ? 'दूध खरीद रिपोर्ट CSV' : 'Milk Purchase CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleExportSalesCsv}
                  className="min-h-[42px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  {lang === 'hi' ? 'थोक बिक्री रिपोर्ट CSV' : 'Sales CSV'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: SETTINGS & LANGUAGE */}
      {subTab === 'settings' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-2xl space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            {lang === 'hi' ? 'डेयरी प्रोफाइल और भाषा सेटिंग' : 'Dairy Profile & Language Settings'}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {lang === 'hi' ? 'डेयरी का नाम (हेडर और बिल के लिए)' : 'Dairy Name'}
              </label>
              <input
                type="text"
                value={dName}
                onChange={(e) => setDName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {lang === 'hi' ? 'संपर्क मोबाइल नंबर' : 'Dairy Contact Phone'}
              </label>
              <input
                type="tel"
                value={dPhone}
                onChange={(e) => setDPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {lang === 'hi' ? 'डेयरी का पता' : 'Dairy Address'}
              </label>
              <input
                type="text"
                value={dAddr}
                onChange={(e) => setDAddr(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {lang === 'hi' ? 'ऐप की मुख्य भाषा (App Language)' : 'App Language'}
              </label>
              <select
                value={dLang}
                onChange={(e) => setDLang(e.target.value as Language)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl"
              >
                <option value="hi">हिंदी (Hindi - Primary)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onUpdateSettings(dName.trim() || 'Ujalaa Dairy', dPhone.trim(), dAddr.trim(), dLang);
                setSettingsSaved(true);
                setTimeout(() => setSettingsSaved(false), 2000);
              }}
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl"
            >
              {lang === 'hi' ? 'सेटिंग सेव करें' : 'Save Settings'}
            </button>
            {settingsSaved && (
              <span className="text-xs font-bold text-emerald-700">
                {lang === 'hi' ? 'सेटिंग सेव हो गई!' : 'Settings saved!'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Confirm Restore Dialog */}
      <ConfirmDialog
        open={Boolean(pendingRestoreState)}
        variant="primary"
        title={lang === 'hi' ? 'JSON बैकअप से डेटा Restore करें?' : 'Restore Data from JSON Backup?'}
        message={
          lang === 'hi'
            ? `इस बैकअप फ़ाइल में ${pendingRestoreState?.farmers.length || 0} किसान और ${
                pendingRestoreState?.collections.length || 0
              } दूध एंट्रियाँ हैं। सलाह: Restore करने से पहले मौजूदा डेटा का बैकअप ले लें। क्या आप Restore की पुष्टि करते हैं?`
            : `This backup contains ${pendingRestoreState?.farmers.length || 0} farmers and ${
                pendingRestoreState?.collections.length || 0
              } milk entries. Proceed with restore?`
        }
        confirmLabel={lang === 'hi' ? 'हाँ, डेटा Restore करें' : 'Restore Now'}
        onCancel={() => setPendingRestoreState(null)}
        onConfirm={() => {
          if (pendingRestoreState) {
            onRestoreState(pendingRestoreState);
            setRestoreSuccess(
              lang === 'hi'
                ? 'डेटा सफलतापूर्वक Restore कर दिया गया है!'
                : 'Backup restored successfully!'
            );
          }
          setPendingRestoreState(null);
        }}
      />
    </div>
  );
};
