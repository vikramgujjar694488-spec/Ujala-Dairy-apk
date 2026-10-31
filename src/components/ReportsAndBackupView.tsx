import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Code,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  MessageSquare,
  Printer,
  Settings,
  Share2,
  Smartphone,
  Trash2,
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
  calculatePureProfitLoss,
  calculateReconciliation,
  calculateSaleSummary,
  formatCurrency,
  formatNumber,
  formatWholeCurrency,
  generateTenDaySaleBillData,
  getTenDayCycleDates,
  round2,
  round3,
} from '../utils/dairyCalculations';
import { generateStandaloneHtmlApp } from '../utils/standaloneHtmlGenerator';
import {
  deleteBackupSnapshot,
  loadBackupSnapshots,
  LocalBackupSnapshot,
  mergeDairyStates,
  saveBackupSnapshot,
  serializeBackupPayload,
  triggerReliableFileDownload,
  validateBackupJson,
} from '../utils/storage';
import { ConfirmDialog, WhatsAppPreviewModal } from './Modals';

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
              "tesseract.js": "^5.1.1",
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
  initialSub = 'backup',
  onRestoreState,
  onUpdateSettings,
}) => {
  const lang = state.language;
  const [subTab, setSubTab] = useState<'reports' | 'backup' | 'settings'>(
    initialSub === 'settings' ? 'settings' : 'backup'
  );

  React.useEffect(() => {
    setSubTab(initialSub === 'settings' ? 'settings' : 'backup');
  }, [initialSub]);

  // Multi-filter state for Reports
  const [preset, setPreset] = useState<ReportPreset>('today');
  const [fromDate, setFromDate] = useState<string>(state.selectedDate);
  const [toDate, setToDate] = useState<string>(state.selectedDate);
  const [shiftFilter, setShiftFilter] = useState<'all' | ShiftType>('all');
  const [milkTypeFilter, setMilkTypeFilter] = useState<'all' | MilkType>('all');
  const [farmerFilter, setFarmerFilter] = useState<string>('all');

  // Dedicated Profit-Loss Horizons: shift | daily | 10days | monthly | custom
  const [plHorizon, setPlHorizon] = useState<'shift' | 'daily' | '10days' | 'monthly' | 'custom'>('daily');
  const [pl10DayCycle, setPl10DayCycle] = useState<'c1' | 'c2' | 'c3' | 'last10'>('last10');
  const [plMonth, setPlMonth] = useState<string>(() => state.selectedDate.slice(0, 7));

  // 10-Day Side-by-Side & Wholesale Sale Bill Report State
  const [tenDayReportMode, setTenDayReportMode] = useState<'collection' | 'sale'>('collection');
  const [saleCustomerFilter, setSaleCustomerFilter] = useState<string>('all');
  const [saleReportCycle, setSaleReportCycle] = useState<1 | 2 | 3 | 'custom'>(() => {
    const dy = Number(state.selectedDate.slice(8, 10)) || 1;
    return dy <= 10 ? 1 : dy <= 20 ? 2 : 3;
  });
  const [saleReportMonth, setSaleReportMonth] = useState<string>(() =>
    state.selectedDate.slice(0, 7)
  );
  const [saleWaModal, setSaleWaModal] = useState<{ open: boolean; phone: string; message: string }>({
    open: false,
    phone: '',
    message: '',
  });

  // Backup / Restore state (works across Web, Installed PWA, Standalone HTML & Android APK)
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestoreState, setPendingRestoreState] = useState<DairyAppState | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [instantRestoreOnSelect, setInstantRestoreOnSelect] = useState<boolean>(true);
  const [pasteBackupText, setPasteBackupText] = useState<string>('');
  const [copiedBackupJson, setCopiedBackupJson] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<LocalBackupSnapshot[]>(() => loadBackupSnapshots());
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Single-File HTML Export state
  const [includeDataInHtml, setIncludeDataInHtml] = useState<boolean>(true);
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

      const relRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`);
      if (relRes.ok) {
        const relList = await relRes.json();
        const relData = Array.isArray(relList) ? relList[0] : relList;
        const apkAsset = Array.isArray(relData?.assets)
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
            messageHi: `APK तैयार है! (${relData.tag_name || 'Latest'} · ${relData.name || ''}) — आप नीचे से सीधा Ujalaa-Dairy-debug.apk डाउनलोड कर सकते हैं।`,
            messageEn: `APK is ready! (${relData.tag_name || 'Latest'} · ${relData.name || ''}) — You can download Ujalaa-Dairy-debug.apk directly below.`,
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
      const ym = today.slice(0, 7);
      const dy = Number(today.slice(8, 10)) || 1;
      const cyc: 1 | 2 | 3 = dy <= 10 ? 1 : dy <= 20 ? 2 : 3;
      const range = getTenDayCycleDates(ym, cyc);
      setSaleReportMonth(ym);
      setSaleReportCycle(cyc);
      setFromDate(range.fromDate);
      setToDate(range.toDate);
    } else if (p === 'wholesale') {
      const ym = today.slice(0, 7);
      const dy = Number(today.slice(8, 10)) || 1;
      const cyc: 1 | 2 | 3 = dy <= 10 ? 1 : dy <= 20 ? 2 : 3;
      const range = getTenDayCycleDates(ym, cyc);
      setSaleReportMonth(ym);
      setSaleReportCycle(cyc);
      setFromDate(range.fromDate);
      setToDate(range.toDate);
      setTenDayReportMode('sale');
    } else if (p === 'monthly') {
      const ym = today.slice(0, 7);
      setFromDate(`${ym}-01`);
      setToDate(`${ym}-31`);
    } else if (p === 'profit_loss') {
      setFromDate(today);
      setToDate(today);
      setShiftFilter('all');
      setMilkTypeFilter('all');
      setFarmerFilter('all');
      setPlHorizon('daily');
    }
  };

  const handleSetPlHorizon = (h: 'shift' | 'daily' | '10days' | 'monthly' | 'custom') => {
    setPlHorizon(h);
    const today = state.selectedDate;
    const ym = today.slice(0, 7);
    if (h === 'shift') {
      setFromDate(today);
      setToDate(today);
    } else if (h === 'daily') {
      setFromDate(today);
      setToDate(today);
      setShiftFilter('all');
    } else if (h === '10days') {
      handleSetPl10DayCycle(pl10DayCycle);
    } else if (h === 'monthly') {
      handleSetPlMonth(plMonth || ym);
    }
  };

  const handleSetPl10DayCycle = (cycle: 'c1' | 'c2' | 'c3' | 'last10') => {
    setPl10DayCycle(cycle);
    const today = state.selectedDate;
    const ym = today.slice(0, 7);
    if (cycle === 'c1') {
      setFromDate(`${ym}-01`);
      setToDate(`${ym}-10`);
    } else if (cycle === 'c2') {
      setFromDate(`${ym}-11`);
      setToDate(`${ym}-20`);
    } else if (cycle === 'c3') {
      setFromDate(`${ym}-21`);
      setToDate(`${ym}-31`);
    } else {
      const d = new Date(today);
      d.setDate(d.getDate() - 9);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    }
  };

  const handleSetPlMonth = (selectedYearMonth: string) => {
    setPlMonth(selectedYearMonth);
    setFromDate(`${selectedYearMonth}-01`);
    setToDate(`${selectedYearMonth}-31`);
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

  // Pure Profit & Loss: केवल कुल बिक्री - कुल खरीद (कोई खर्च नहीं जोड़ा जाता)
  const purePL = calculatePureProfitLoss(filteredCollections, filteredSales);

  // Build Day/Shift breakdown rows for Profit & Loss
  interface PlRow {
    date: string;
    shift: ShiftType;
    buyLiters: number;
    buyAmount: number;
    buyFat: number | null;
    buySnf: number | null;
    buyRate: number | null;
    saleLiters: number;
    saleAmount: number;
    saleFat: number | null;
    saleSnf: number | null;
    saleRate: number | null;
    difference: number;
    diffLiters: number;
  }

  const allPlDates = Array.from(
    new Set([
      ...filteredCollections.map((c) => c.date),
      ...filteredSales.map((s) => s.date),
    ])
  ).sort();

  const plGroupedRows: PlRow[] = [];
  for (const dt of allPlDates) {
    const shiftsToInspect: ShiftType[] =
      shiftFilter === 'morning'
        ? ['morning']
        : shiftFilter === 'evening'
        ? ['evening']
        : ['morning', 'evening'];

    for (const sh of shiftsToInspect) {
      const cList = filteredCollections.filter((c) => c.date === dt && c.shift === sh);
      const sList = filteredSales.filter((s) => s.date === dt && s.shift === sh);
      if (cList.length === 0 && sList.length === 0) continue;

      const cSum = calculateCollectionSummary(cList);
      const sSum = calculateSaleSummary(sList);
      const diff = round2(sSum.totalNetReceivable - cSum.totalAmount);
      const diffL = round3(sSum.totalLiters - cSum.totalLiters);

      plGroupedRows.push({
        date: dt,
        shift: sh,
        buyLiters: cSum.totalLiters,
        buyAmount: cSum.totalAmount,
        buyFat: cSum.avgFat,
        buySnf: cSum.avgSnf,
        buyRate: cSum.avgRate,
        saleLiters: sSum.totalLiters,
        saleAmount: sSum.totalNetReceivable,
        saleFat: sSum.avgFat,
        saleSnf: sSum.avgSnf,
        saleRate: sSum.avgRate,
        difference: diff,
        diffLiters: diffL,
      });
    }
  }

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

  const handleExportProfitLossCsv = () => {
    const rows: (string | number)[][] = [
      [
        'तारीख (Date)',
        'शिफ्ट (Shift)',
        'खरीद दूध (Liters)',
        'खरीद औसत FAT',
        'खरीद औसत SNF',
        'खरीद औसत दर (Rate/L)',
        'कुल खरीद रकम (Buy Rs)',
        'बिक्री दूध (Liters)',
        'बिक्री औसत FAT',
        'बिक्री औसत SNF',
        'बिक्री औसत दर (Rate/L)',
        'कुल बिक्री रकम (Sale Rs)',
        'लाभ/हानि अंतर (Sale - Buy Rs)',
        'मात्रा अंतर (Sale - Buy L)',
        'स्थिति (Status)',
      ],
      ...plGroupedRows.map((r) => [
        r.date,
        r.shift === 'morning' ? 'सुबह (AM)' : 'शाम (PM)',
        r.buyLiters,
        r.buyFat ?? '',
        r.buySnf ?? '',
        r.buyRate ?? '',
        r.buyAmount,
        r.saleLiters,
        r.saleFat ?? '',
        r.saleSnf ?? '',
        r.saleRate ?? '',
        r.saleAmount,
        r.difference,
        r.diffLiters,
        r.difference >= 0 ? 'लाभ (Profit)' : 'हानि (Loss)',
      ]),
      [
        'कुल योग (GRAND TOTAL)',
        '',
        purePL.purchasedLiters,
        purePL.avgPurchaseFat ?? '',
        purePL.avgPurchaseSnf ?? '',
        purePL.avgPurchaseRate ?? '',
        purePL.purchaseAmount,
        purePL.soldLiters,
        purePL.avgSaleFat ?? '',
        purePL.avgSaleSnf ?? '',
        purePL.avgSaleRate ?? '',
        purePL.saleAmount,
        purePL.netDifference,
        purePL.litersDifference,
        purePL.isProfit ? 'शुद्ध लाभ' : 'शुद्ध हानि',
      ],
    ];
    downloadCsv(`Ujalaa_Dairy_Profit_Loss_${fromDate}_to_${toDate}.csv`, rows);
  };

  const applyIncomingRestoreState = (incomingState: DairyAppState) => {
    // Save an automatic safety snapshot of existing data if non-empty before restoring
    if (
      state.farmers.length > 0 ||
      state.collections.length > 0 ||
      state.sales.length > 0 ||
      (state.customers || []).length > 0
    ) {
      const updatedSnaps = saveBackupSnapshot(
        state,
        lang === 'hi' ? 'Restore से पहले ऑटो-सेव' : 'Auto-saved before Restore'
      );
      setSnapshots(updatedSnaps);
    }

    const finalState =
      restoreMode === 'merge' ? mergeDairyStates(state, incomingState) : incomingState;
    onRestoreState(finalState);
    setRestoreError(null);
    setRestoreSuccess(
      lang === 'hi'
        ? `डेटा सफलतापूर्वक Restore हो गया! (किसान: ${finalState.farmers.length}, दूध खरीद: ${finalState.collections.length}, बिक्री: ${finalState.sales.length})`
        : `Backup restored successfully! (Farmers: ${finalState.farmers.length}, Collections: ${finalState.collections.length}, Sales: ${finalState.sales.length})`
    );
  };

  const handleExportFullBackupJson = () => {
    const jsonStr = serializeBackupPayload(state);
    const filename = `Ujalaa_Dairy_Backup_${state.selectedDate}.json`;
    const ok = triggerReliableFileDownload(filename, jsonStr, 'application/json;charset=utf-8');
    if (ok) {
      setRestoreError(null);
      setRestoreSuccess(
        lang === 'hi'
          ? `बैकअप फ़ाइल (${filename}) डाउनलोड हो गई है!`
          : `Backup file (${filename}) downloaded!`
      );
    }
  };

  const handleShareBackupFile = async () => {
    const jsonStr = serializeBackupPayload(state);
    const filename = `Ujalaa_Dairy_Backup_${state.selectedDate}.json`;
    try {
      const nav = window.navigator as any;
      if (nav && typeof nav.share === 'function') {
        const file = new File([jsonStr], filename, { type: 'application/json' });
        if (nav.canShare && nav.canShare({ files: [file] })) {
          await nav.share({
            title: `${state.dairyName || 'Ujalaa Dairy'} Backup`,
            text: `Ujalaa Dairy डेटा बैकअप (${state.selectedDate})`,
            files: [file],
          });
          return;
        }
        await nav.share({
          title: `${state.dairyName || 'Ujalaa Dairy'} Backup`,
          text: jsonStr,
        });
        return;
      }
    } catch {
      // Fallback to copy + download
    }
    handleExportFullBackupJson();
  };

  const handleCopyBackupCode = async () => {
    const jsonStr = serializeBackupPayload(state);
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopiedBackupJson(true);
      setRestoreError(null);
      setRestoreSuccess(
        lang === 'hi'
          ? 'पूरा बैकअप कोड Copy हो गया है! आप इसे WhatsApp/Notes में सुरक्षित रख सकते हैं या नीचे पेस्ट करके Restore कर सकते हैं।'
          : 'Backup code copied to clipboard!'
      );
      setTimeout(() => setCopiedBackupJson(false), 3000);
    } catch {
      setPasteBackupText(jsonStr);
      setRestoreSuccess(
        lang === 'hi'
          ? 'बैकअप कोड नीचे बॉक्स में डाल दिया गया है — आप इसे कॉपी कर सकते हैं।'
          : 'Backup code placed in the text box below.'
      );
    }
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
      } else if (instantRestoreOnSelect) {
        applyIncomingRestoreState(res.state);
      } else {
        setPendingRestoreState(res.state);
      }
    };
    reader.onerror = () => {
      setRestoreError(
        lang === 'hi'
          ? 'फ़ाइल पढ़ने में समस्या आई। कृपया नीचे बैकअप कोड पेस्ट करके Restore करें।'
          : 'Failed to read file. Please paste backup code below to restore.'
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreFromPastedText = () => {
    setRestoreError(null);
    setRestoreSuccess(null);
    const res = validateBackupJson(pasteBackupText);
    if (!res.valid || !res.state) {
      setRestoreError(lang === 'hi' ? res.errorHi : res.errorEn);
      return;
    }
    applyIncomingRestoreState(res.state);
    setPasteBackupText('');
  };

  const handleSaveLocalSnapshot = () => {
    const updated = saveBackupSnapshot(state);
    setSnapshots(updated);
    setRestoreError(null);
    setRestoreSuccess(
      lang === 'hi'
        ? 'लोकल बैकअप स्नैपशॉट ऐप में सुरक्षित कर लिया गया है! आप जब चाहें 1-Click में Restore कर सकते हैं।'
        : 'Local backup snapshot saved! You can restore it anytime with 1 click.'
    );
  };

  const handleDownloadStandaloneHtml = () => {
    const htmlCode = generateStandaloneHtmlApp(state, includeDataInHtml);
    triggerReliableFileDownload(
      'Ujalaa_Dairy_Complete_App.html',
      htmlCode,
      'text/html;charset=utf-8'
    );
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
      {/* Sub-navigation bar (Clean Backup & Settings only) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-2 no-print">
        <button
          type="button"
          onClick={() => setSubTab('backup')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            subTab === 'backup' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Download className="w-4 h-4" />
          {lang === 'hi'
            ? 'बैकअप, Restore और APK/HTML डाउनलोड'
            : 'Backup, Restore & Export'}
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

      {/* Legacy reports section disabled — moved to 10-Day Billing & Reports */}
      {false && subTab === 'reports' && (
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
                  hi: '10-दिन की रिपोर्ट (खरीद व बिक्री)',
                  en: '10-Day Side-by-Side',
                },
                { id: 'wholesale', hi: 'बिक्री का 10-दिन का बिल / रिपोर्ट', en: '10-Day Sale Bill / Wholesale' },
                { id: 'expenses', hi: 'खर्च की रिपोर्ट', en: 'Expense Report' },
                { id: 'profit_loss', hi: 'लाभ-हानि रिपोर्ट', en: 'Profit-Loss Report' },
                { id: 'monthly', hi: 'मासिक रिपोर्ट', en: 'Monthly Report' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  data-testid={`report-preset-${btn.id}`}
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

            {/* 10-Day Cycle & Sale/Collection Mode Controls when ten_day_side_by_side or wholesale is selected */}
            {(preset === 'ten_day_side_by_side' || preset === 'wholesale') && (
              <div
                data-testid="ten-day-report-controls"
                className="bg-blue-50/80 border-2 border-blue-300 rounded-xl p-3.5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-blue-200">
                    <button
                      type="button"
                      data-testid="ten-day-mode-collection"
                      onClick={() => {
                        setTenDayReportMode('collection');
                        if (preset === 'wholesale') setPreset('ten_day_side_by_side');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tenDayReportMode === 'collection' && preset !== 'wholesale'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {lang === 'hi' ? 'किसान दूध खरीद (10-दिन)' : 'Farmer Purchase (10-Day)'}
                    </button>
                    <button
                      type="button"
                      data-testid="ten-day-mode-sale"
                      onClick={() => setTenDayReportMode('sale')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tenDayReportMode === 'sale' || preset === 'wholesale'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {lang === 'hi'
                        ? 'बिक्री का 10-दिन का बिल (Wholesale Sale Bill)'
                        : '10-Day Wholesale Sale Bill'}
                    </button>
                  </div>

                  {/* 10-Day Cycle Selector Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="month"
                      value={saleReportMonth}
                      onChange={(e) => {
                        const ym = e.target.value;
                        setSaleReportMonth(ym);
                        if (saleReportCycle !== 'custom') {
                          const r = getTenDayCycleDates(ym, saleReportCycle);
                          setFromDate(r.fromDate);
                          setToDate(r.toDate);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-white border border-blue-300 rounded-lg tabular-nums"
                    />
                    {[
                      { id: 1 as const, hi: '1 से 10 तारीख (चक्र 1)', en: '1–10 (Cycle 1)' },
                      { id: 2 as const, hi: '11 से 20 तारीख (चक्र 2)', en: '11–20 (Cycle 2)' },
                      { id: 3 as const, hi: '21 से माह अंत (चक्र 3)', en: '21–End (Cycle 3)' },
                    ].map((cBtn) => (
                      <button
                        key={cBtn.id}
                        type="button"
                        onClick={() => {
                          setSaleReportCycle(cBtn.id);
                          const r = getTenDayCycleDates(saleReportMonth, cBtn.id);
                          setFromDate(r.fromDate);
                          setToDate(r.toDate);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                          saleReportCycle === cBtn.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-blue-200 text-slate-700 hover:bg-blue-100'
                        }`}
                      >
                        {lang === 'hi' ? cBtn.hi : cBtn.en}
                      </button>
                    ))}
                  </div>
                </div>

                {(tenDayReportMode === 'sale' || preset === 'wholesale') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-blue-950">
                        {lang === 'hi' ? 'ग्राहक / खरीदार चुनें:' : 'Select Customer / Buyer:'}
                      </label>
                      <select
                        value={saleCustomerFilter}
                        onChange={(e) => setSaleCustomerFilter(e.target.value)}
                        className="px-3 py-1.5 text-xs font-bold bg-white border border-blue-300 rounded-lg"
                      >
                        <option value="all">
                          {lang === 'hi' ? 'सभी ग्राहक (All Buyers)' : 'All Customers / Buyers'}
                        </option>
                        {(state.customers || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                        {Array.from(
                          new Set(
                            state.sales
                              .map((s) => s.buyerName.trim())
                              .filter(
                                (b) =>
                                  b &&
                                  !(state.customers || []).some(
                                    (c) => c.name.trim().toLowerCase() === b.toLowerCase()
                                  )
                              )
                          )
                        ).map((bName) => (
                          <option key={`buyer:${bName}`} value={`buyer:${bName}`}>
                            {bName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <span className="text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-lg tabular-nums">
                      {lang === 'hi'
                        ? `बिक्री 10-दिन अवधि: ${fromDate} से ${toDate}`
                        : `Sale Bill Period: ${fromDate} to ${toDate}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Dedicated Profit & Loss Horizon Selector (Shift, Daily, 10-Days, Monthly, Custom) */}
            {preset === 'profit_loss' && (
              <div
                data-testid="pl-horizon-controls"
                className="bg-emerald-50/80 border-2 border-emerald-400 rounded-xl p-3 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-emerald-950">
                      {lang === 'hi' ? 'लाभ-हानि अवधि चुनें (Horizon):' : 'Profit-Loss Horizon:'}
                    </span>
                    <span className="text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md font-semibold">
                      {lang === 'hi'
                        ? 'केवल दूध बिक्री रकम - खरीद रकम (कोई खर्च नहीं)'
                        : 'Pure Milk Sale Rs - Purchase Rs (No Expenses)'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: 'shift', hi: 'शिफ्ट अनुसार (Shift)', en: 'By Shift' },
                      { id: 'daily', hi: 'दैनिक (Daily)', en: 'Daily' },
                      { id: '10days', hi: '10 दिन (10 Days)', en: '10 Days' },
                      { id: 'monthly', hi: 'मासिक (Monthly)', en: 'Monthly' },
                      { id: 'custom', hi: 'कस्टम रेंज', en: 'Custom' },
                    ].map((hz) => (
                      <button
                        key={hz.id}
                        type="button"
                        onClick={() => handleSetPlHorizon(hz.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          plHorizon === hz.id
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {lang === 'hi' ? hz.hi : hz.en}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizon Specific Interactive Bar */}
                {plHorizon === 'shift' && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-emerald-200">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-slate-800">तारीख:</label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setToDate(e.target.value);
                        }}
                        className="px-2.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <div className="flex items-center gap-1 bg-white p-0.5 border border-slate-300 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setShiftFilter('all')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          shiftFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        सुबह+शाम दोनों
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftFilter('morning')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          shiftFilter === 'morning'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        केवल सुबह (Morning)
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftFilter('evening')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          shiftFilter === 'evening'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        केवल शाम (Evening)
                      </button>
                    </div>
                  </div>
                )}

                {plHorizon === 'daily' && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-emerald-200">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-slate-800">तारीख चुनें:</label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setToDate(e.target.value);
                        }}
                        className="px-2.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate(state.selectedDate);
                        setToDate(state.selectedDate);
                      }}
                      className="px-3 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-lg"
                    >
                      आज की तारीख ({state.selectedDate})
                    </button>
                  </div>
                )}

                {plHorizon === '10days' && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200">
                    <span className="text-xs font-bold text-slate-800">10-दिन साइकल:</span>
                    <button
                      type="button"
                      onClick={() => handleSetPl10DayCycle('c1')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        pl10DayCycle === 'c1'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      1 से 10 तारीख (साइकल 1)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPl10DayCycle('c2')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        pl10DayCycle === 'c2'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      11 से 20 तारीख (साइकल 2)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPl10DayCycle('c3')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        pl10DayCycle === 'c3'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      21 से माह अंत (साइकल 3)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPl10DayCycle('last10')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        pl10DayCycle === 'last10'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      पिछले 10 दिन
                    </button>
                    <span className="text-xs text-emerald-950 font-bold font-mono ml-2">
                      अवधि: {fromDate} से {toDate}
                    </span>
                  </div>
                )}

                {plHorizon === 'monthly' && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-emerald-200">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-slate-800">महीना चुनें:</label>
                      <input
                        type="month"
                        value={plMonth}
                        onChange={(e) => handleSetPlMonth(e.target.value)}
                        className="px-2.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSetPlMonth(state.selectedDate.slice(0, 7))}
                      className="px-3 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-lg"
                    >
                      चालू महीना
                    </button>
                    <span className="text-xs text-emerald-950 font-bold font-mono ml-2">
                      अवधि: {fromDate} से {toDate}
                    </span>
                  </div>
                )}

                {plHorizon === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-700">तारीख से:</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-700">तारीख तक:</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  onClick={
                    preset === 'profit_loss'
                      ? handleExportProfitLossCsv
                      : preset === 'wholesale'
                      ? handleExportSalesCsv
                      : handleExportCollectionsCsv
                  }
                  className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {preset === 'profit_loss' ? 'लाभ-हानि CSV' : 'CSV Export'}
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

            {/* Section 14: 10-Day Wholesale Sale Bill OR 10-Day Collection Side-by-Side Table */}
            {preset === 'wholesale' ||
            (preset === 'ten_day_side_by_side' && tenDayReportMode === 'sale') ? (
              (() => {
                const saleBill = generateTenDaySaleBillData(
                  filteredSales,
                  state.customers || [],
                  {
                    customerFilter: saleCustomerFilter,
                    yearMonth: saleReportMonth,
                    cycle: 'custom',
                    customFromDate: fromDate,
                    customToDate: toDate,
                    dairyName: state.dairyName || 'Ujalaa Dairy',
                  }
                );

                return (
                  <div data-testid="report-10day-sale-bill-view" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                      <div>
                        <span className="text-xs font-bold text-emerald-900 block">
                          {lang === 'hi'
                            ? `ग्राहक: ${saleBill.buyerLabelHi} · बिल नं: ${saleBill.billNumber}`
                            : `Customer: ${saleBill.buyerLabelEn} · Bill No: ${saleBill.billNumber}`}
                        </span>
                        <span className="text-[11px] text-slate-600">
                          {lang === 'hi'
                            ? `अवधि: ${fromDate} से ${toDate} (सभी बिक्री राशियाँ दशमलव/प्वाइंट के साथ)`
                            : `Period: ${fromDate} to ${toDate} (All sale amounts with exact decimals)`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSaleWaModal({
                            open: true,
                            phone: saleBill.customerMobile || '',
                            message:
                              lang === 'hi'
                                ? saleBill.whatsAppMessageHi
                                : saleBill.whatsAppMessageEn,
                          })
                        }
                        className="min-h-[36px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 no-print"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {lang === 'hi' ? 'WhatsApp पर बिक्री बिल भेजें' : 'Share Sale Bill on WhatsApp'}
                      </button>
                    </div>

                    {/* 4 Summary Cards for 10-Day Sale Bill */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                        <span className="text-amber-900 font-bold block">सुबह की बिक्री (Morning)</span>
                        <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                          {formatNumber(saleBill.morningSummary.totalLiters, 3)} L ·{' '}
                          {formatCurrency(saleBill.morningSummary.totalNetReceivable)}
                        </span>
                      </div>
                      <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200">
                        <span className="text-indigo-900 font-bold block">शाम की बिक्री (Evening)</span>
                        <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                          {formatNumber(saleBill.eveningSummary.totalLiters, 3)} L ·{' '}
                          {formatCurrency(saleBill.eveningSummary.totalNetReceivable)}
                        </span>
                      </div>
                      <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200">
                        <span className="text-blue-900 font-bold block">कुल बेचा दूध · औसत FAT/SNF</span>
                        <span className="text-base font-extrabold text-blue-950 mt-0.5 block">
                          {formatNumber(saleBill.totalSummary.totalLiters, 3)} L ·{' '}
                          {formatNumber(saleBill.totalSummary.avgFat)}/
                          {formatNumber(saleBill.totalSummary.avgSnf)}
                        </span>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border-2 border-emerald-400">
                        <span className="text-emerald-900 font-bold block">
                          10-दिन का कुल बिक्री बिल (₹)
                        </span>
                        <span className="text-lg font-black text-emerald-800 mt-0.5 block">
                          {formatCurrency(saleBill.totalSummary.totalNetReceivable)}
                        </span>
                      </div>
                    </div>

                    {/* 10-Day Side-by-Side Morning & Evening Sale Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse tabular-nums">
                        <thead>
                          <tr className="bg-emerald-50 text-emerald-950 border-b border-emerald-200">
                            <th className="py-2 px-2.5 text-left">तारीख</th>
                            <th className="py-2 px-2.5 text-right">सुबह बिक्री L</th>
                            <th className="py-2 px-2.5 text-right">सुबह FAT/SNF</th>
                            <th className="py-2 px-2.5 text-right">सुबह रेट</th>
                            <th className="py-2 px-2.5 text-right">सुबह राशि (₹)</th>
                            <th className="py-2 px-2.5 text-right">शाम बिक्री L</th>
                            <th className="py-2 px-2.5 text-right">शाम FAT/SNF</th>
                            <th className="py-2 px-2.5 text-right">शाम रेट</th>
                            <th className="py-2 px-2.5 text-right">शाम राशि (₹)</th>
                            <th className="py-2 px-2.5 text-right font-bold">कुल बिक्री L</th>
                            <th className="py-2 px-2.5 text-right font-bold">कुल बिक्री राशि (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {saleBill.dayWiseRows.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="py-8 text-center text-slate-500">
                                {lang === 'hi'
                                  ? 'चयनित 10-दिन की अवधि में कोई दूध बिक्री रिकॉर्ड नहीं है'
                                  : 'No wholesale milk sales in the selected period'}
                              </td>
                            </tr>
                          ) : (
                            saleBill.dayWiseRows.map((r) => (
                              <tr key={r.date} className="hover:bg-slate-50">
                                <td className="py-2 px-2.5 font-bold">{r.date}</td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.morningLiters > 0 ? formatNumber(r.morningLiters, 3) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.morningFat !== null
                                    ? `${formatNumber(r.morningFat)}/${formatNumber(r.morningSnf)}`
                                    : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.morningRate !== null ? formatCurrency(r.morningRate) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.morningAmount > 0 ? formatCurrency(r.morningAmount) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.eveningLiters > 0 ? formatNumber(r.eveningLiters, 3) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.eveningFat !== null
                                    ? `${formatNumber(r.eveningFat)}/${formatNumber(r.eveningSnf)}`
                                    : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.eveningRate !== null ? formatCurrency(r.eveningRate) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right">
                                  {r.eveningAmount > 0 ? formatCurrency(r.eveningAmount) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold text-blue-800">
                                  {formatNumber(r.totalLiters, 3)} L
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold text-emerald-700">
                                  {formatCurrency(r.totalAmount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                            <td colSpan={9} className="py-3 px-2.5">
                              बिक्री का कुल योग ({saleBill.totalSummary.entryCount} एंट्री)
                            </td>
                            <td className="py-3 px-2.5 text-right text-blue-800">
                              {formatNumber(saleBill.totalSummary.totalLiters, 3)} L
                            </td>
                            <td className="py-3 px-2.5 text-right text-emerald-800 font-black">
                              {formatCurrency(saleBill.totalSummary.totalNetReceivable)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()
            ) : preset === 'ten_day_side_by_side' ? (
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
                              {formatWholeCurrency(mSum.totalAmount)}
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
                              {formatWholeCurrency(eSum.totalAmount)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-blue-800">
                              {formatNumber(tSum.totalLiters, 3)} L
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-blue-800">
                              {formatWholeCurrency(tSum.totalAmount)}
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
                        {formatWholeCurrency(colSummary.totalAmount)}
                      </td>
                      <td className="py-3 px-2.5 text-right">
                        {formatNumber(colSummary.avgFat)}/{formatNumber(colSummary.avgSnf)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : preset === 'profit_loss' ? (
              /* ========================================================================
                 DEDICATED PURE PROFIT & LOSS REPORT (दूध खरीद vs बिक्री का सीधा अंतर)
                 इसमें कोई भी अतिरिक्त खर्च नहीं जोड़ा जाता — केवल बिक्री ₹ - खरीद ₹
                 ======================================================================== */
              <div data-testid="pure-profit-loss-report-view" className="space-y-4">
                {/* 3 Prominent Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Card 1: Total Milk Purchases */}
                  <div className="bg-blue-50/80 border-2 border-blue-300 rounded-2xl p-4">
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block">
                      1. कुल दूध खरीद (Purchases)
                    </span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-blue-950 tabular-nums">
                        {formatCurrency(purePL.purchaseAmount)}
                      </span>
                      <span className="text-xs font-bold text-blue-700 bg-blue-150 px-2 py-0.5 rounded-md">
                        {formatNumber(purePL.purchasedLiters, 3)} L
                      </span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-blue-200/70 grid grid-cols-2 gap-2 text-xs text-blue-900 tabular-nums">
                      <div>
                        <span className="text-blue-600 block text-[11px]">औसत FAT / SNF</span>
                        <strong className="font-bold">
                          {formatNumber(purePL.avgPurchaseFat, 2)} / {formatNumber(purePL.avgPurchaseSnf, 2)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-blue-600 block text-[11px]">औसत खरीद दर</span>
                        <strong className="font-bold">
                          {purePL.avgPurchaseRate !== null
                            ? `₹${(purePL.avgPurchaseRate ?? 0).toFixed(2)}/L`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Total Milk Sales */}
                  <div className="bg-purple-50/80 border-2 border-purple-300 rounded-2xl p-4">
                    <span className="text-xs font-bold text-purple-800 uppercase tracking-wider block">
                      2. कुल दूध बिक्री (Sales)
                    </span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-purple-950 tabular-nums">
                        {formatCurrency(purePL.saleAmount)}
                      </span>
                      <span className="text-xs font-bold text-purple-700 bg-purple-150 px-2 py-0.5 rounded-md">
                        {formatNumber(purePL.soldLiters, 3)} L
                      </span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-purple-200/70 grid grid-cols-2 gap-2 text-xs text-purple-900 tabular-nums">
                      <div>
                        <span className="text-purple-600 block text-[11px]">औसत FAT / SNF</span>
                        <strong className="font-bold">
                          {formatNumber(purePL.avgSaleFat, 2)} / {formatNumber(purePL.avgSaleSnf, 2)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-purple-600 block text-[11px]">औसत बिक्री दर</span>
                        <strong className="font-bold">
                          {purePL.avgSaleRate !== null
                            ? `₹${(purePL.avgSaleRate ?? 0).toFixed(2)}/L`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Net Profit or Loss (बिक्री ₹ - खरीद ₹) */}
                  <div
                    className={`border-2 rounded-2xl p-4 shadow-xs ${
                      purePL.isProfit
                        ? 'bg-emerald-50/90 border-emerald-500'
                        : 'bg-rose-50/90 border-rose-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider block ${
                          purePL.isProfit ? 'text-emerald-900' : 'text-rose-900'
                        }`}
                      >
                        3. शुद्ध लाभ / हानि (Profit/Loss)
                      </span>
                      <span
                        className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                          purePL.isProfit
                            ? 'bg-emerald-600 text-white'
                            : 'bg-rose-600 text-white'
                        }`}
                      >
                        {purePL.statusLabelHi}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between">
                      <span
                        className={`text-2xl font-black tabular-nums ${
                          purePL.isProfit ? 'text-emerald-950' : 'text-rose-950'
                        }`}
                      >
                        {purePL.netDifference >= 0
                          ? `+${formatCurrency(purePL.netDifference)}`
                          : `-${formatCurrency(Math.abs(purePL.netDifference))}`}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${
                          purePL.isProfit
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}
                      >
                        {purePL.marginPerLiter !== null
                          ? (purePL.marginPerLiter ?? 0) >= 0
                            ? `+₹${(purePL.marginPerLiter ?? 0).toFixed(2)}/L मार्जिन`
                            : `-₹${Math.abs(purePL.marginPerLiter ?? 0).toFixed(2)}/L घाटा`
                          : '—'}
                      </span>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200 text-xs text-slate-700 space-y-1">
                      <div className="flex items-center justify-between tabular-nums">
                        <span>दूध मात्रा अंतर (बिक्री L - खरीद L):</span>
                        <strong
                          className={
                            purePL.litersDifference >= 0 ? 'text-emerald-800' : 'text-amber-800'
                          }
                        >
                          {purePL.litersDifference >= 0
                            ? `+${formatNumber(purePL.litersDifference, 3)} L`
                            : `${formatNumber(purePL.litersDifference, 3)} L`}
                        </strong>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">
                        * केवल दूध बिक्री राशि (₹) - दूध खरीद राशि (₹)। कोई खर्च नहीं जोड़ा गया है।
                      </p>
                    </div>
                  </div>
                </div>

                {/* Day-by-Day & Shift Breakdown Table for Profit-Loss */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-800">
                        <th className="py-2.5 px-3 text-left">तारीख</th>
                        <th className="py-2.5 px-2.5 text-center">शिफ्ट</th>
                        <th className="py-2.5 px-2.5 text-right text-blue-900">खरीद (L)</th>
                        <th className="py-2.5 px-2.5 text-right text-blue-900">खरीद FAT/SNF</th>
                        <th className="py-2.5 px-2.5 text-right text-blue-900">खरीद दर/L</th>
                        <th className="py-2.5 px-2.5 text-right text-blue-900 font-bold">खरीद रकम (₹)</th>
                        <th className="py-2.5 px-2.5 text-right text-purple-900">बिक्री (L)</th>
                        <th className="py-2.5 px-2.5 text-right text-purple-900">बिक्री FAT/SNF</th>
                        <th className="py-2.5 px-2.5 text-right text-purple-900">बिक्री दर/L</th>
                        <th className="py-2.5 px-2.5 text-right text-purple-900 font-bold">बिक्री रकम (₹)</th>
                        <th className="py-2.5 px-3 text-right font-bold text-emerald-900">शुद्ध अंतर (लाभ/हानि ₹)</th>
                        <th className="py-2.5 px-2.5 text-center">स्थिति</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plGroupedRows.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-8 text-center text-slate-500">
                            चयनित अवधि के लिए कोई खरीद या बिक्री रिकॉर्ड उपलब्ध नहीं है
                          </td>
                        </tr>
                      ) : (
                        plGroupedRows.map((r, idx) => (
                          <tr key={`${r.date}_${r.shift}_${idx}`} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-slate-900">{r.date}</td>
                            <td className="py-2 px-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  r.shift === 'morning'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-indigo-100 text-indigo-900'
                                }`}
                              >
                                {r.shift === 'morning' ? 'सुबह' : 'शाम'}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 text-right font-semibold text-blue-950">
                              {formatNumber(r.buyLiters, 3)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-slate-600">
                              {r.buyFat !== null ? `${formatNumber(r.buyFat)}/${formatNumber(r.buySnf)}` : '—'}
                            </td>
                            <td className="py-2 px-2.5 text-right text-slate-600">
                              {r.buyRate !== null ? `₹${r.buyRate.toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-blue-900">
                              {formatCurrency(r.buyAmount)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-semibold text-purple-950">
                              {formatNumber(r.saleLiters, 3)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-slate-600">
                              {r.saleFat !== null ? `${formatNumber(r.saleFat)}/${formatNumber(r.saleSnf)}` : '—'}
                            </td>
                            <td className="py-2 px-2.5 text-right text-slate-600">
                              {r.saleRate !== null ? `₹${r.saleRate.toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-purple-900">
                              {formatCurrency(r.saleAmount)}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-black ${
                                r.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {r.difference >= 0 ? `+${formatCurrency(r.difference)}` : formatCurrency(r.difference)}
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  r.difference > 0
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.difference < 0
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {r.difference > 0 ? 'लाभ' : r.difference < 0 ? 'हानि' : 'बराबर'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <td colSpan={2} className="py-3 px-3">
                          अवधि का कुल योग ({plGroupedRows.length} शिफ्ट रिकॉर्ड)
                        </td>
                        <td className="py-3 px-2.5 text-right text-blue-900">
                          {formatNumber(purePL.purchasedLiters, 3)} L
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {formatNumber(purePL.avgPurchaseFat)}/{formatNumber(purePL.avgPurchaseSnf)}
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {purePL.avgPurchaseRate !== null
                            ? `₹${(purePL.avgPurchaseRate ?? 0).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right text-blue-950 font-black">
                          {formatCurrency(purePL.purchaseAmount)}
                        </td>
                        <td className="py-3 px-2.5 text-right text-purple-900">
                          {formatNumber(purePL.soldLiters, 3)} L
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {formatNumber(purePL.avgSaleFat)}/{formatNumber(purePL.avgSaleSnf)}
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {purePL.avgSaleRate !== null
                            ? `₹${(purePL.avgSaleRate ?? 0).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right text-purple-950 font-black">
                          {formatCurrency(purePL.saleAmount)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right text-sm font-black ${
                            purePL.isProfit ? 'text-emerald-800' : 'text-rose-800'
                          }`}
                        >
                          {purePL.netDifference >= 0
                            ? `+${formatCurrency(purePL.netDifference)}`
                            : formatCurrency(purePL.netDifference)}
                        </td>
                        <td className="py-3 px-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              purePL.isProfit
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {purePL.isProfit ? 'शुद्ध लाभ' : 'शुद्ध हानि'}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
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
                      {formatWholeCurrency(colSummary.totalAmount)}
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
                      {purePL.netDifference >= 0
                        ? `+${formatCurrency(purePL.netDifference)}`
                        : formatCurrency(purePL.netDifference)}
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
                              {formatWholeCurrency(c.totalAmount)}
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
                          {formatWholeCurrency(colSummary.totalAmount)}
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
          {/* ========================================================================
              UPGRADED ALL-DEVICE BACKUP & RESTORE SYSTEM (Section 19)
              Works in Web Browser, Installed PWA, Standalone HTML App & Android APK
             ======================================================================== */}
          <div
            data-testid="backup-restore-master-card"
            className="bg-white border-2 border-blue-600 rounded-2xl p-5 space-y-5 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-blue-600 block">
                  {lang === 'hi'
                    ? 'ऑल-इन-वन सुरक्षित बैकअप एवं Restore सिस्टम (Web + Installed App + APK)'
                    : 'All-in-One Reliable Backup & Restore System (Web + Installed App + APK)'}
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {lang === 'hi'
                    ? 'पूरा डेटा बैकअप लें और कभी भी 1-Click में Restore करें'
                    : 'Full Data Backup & 1-Click Restore'}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {lang === 'hi'
                    ? 'ऐप डाउनलोड या इंस्टॉल करने के बाद भी यह सिस्टम 4 तरीकों से काम करता है: (1) JSON फ़ाइल डाउनलोड/Restore, (2) WhatsApp/Drive पर Share, (3) बैकअप कोड Copy/Paste, और (4) लोकल ऑटो-स्नैपशॉट।'
                    : 'Works even inside downloaded/installed apps via 4 methods: File Download/Upload, Native Share, Copy/Paste Backup Code, and Local Snapshots.'}
                </p>
              </div>

              {/* Current Data Summary Badge */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2 text-xs tabular-nums shrink-0">
                <span className="text-slate-600 block font-semibold">
                  {lang === 'hi' ? 'वर्तमान सेव डेटा:' : 'Current Saved Data:'}
                </span>
                <strong className="text-blue-950 font-bold">
                  {state.farmers.length} किसान · {state.collections.length} खरीद · {state.sales.length} बिक्री
                </strong>
              </div>
            </div>

            {restoreError && (
              <div
                data-testid="restore-error-banner"
                className="p-3.5 bg-red-50 border-2 border-red-300 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{restoreError}</span>
              </div>
            )}

            {restoreSuccess && (
              <div
                data-testid="restore-success-banner"
                className="p-3.5 bg-emerald-50 border-2 border-emerald-400 rounded-xl text-xs font-bold text-emerald-900 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{restoreSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* LEFT BOX: STEP 1 - TAKE BACKUP (Download + Share + Copy Code + Local Snapshot) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-600" />
                  {lang === 'hi'
                    ? '1. बैकअप सुरक्षित करें (Backup Data)'
                    : '1. Save / Export Backup'}
                </h4>
                <p className="text-xs text-slate-600">
                  {lang === 'hi'
                    ? 'मोबाइल, कंप्यूटर या इंस्टॉल किए गए ऐप में अपना पूरा डेटा सुरक्षित करने के लिए नीचे दिए किसी भी बटन का उपयोग करें:'
                    : 'Save your complete dairy data on mobile, desktop, or installed APK:'}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="export-json-backup-btn"
                    onClick={handleExportFullBackupJson}
                    className="min-h-[42px] px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    {lang === 'hi'
                      ? 'JSON बैकअप फ़ाइल डाउनलोड करें'
                      : 'Download JSON Backup'}
                  </button>

                  <button
                    type="button"
                    data-testid="share-backup-btn"
                    onClick={handleShareBackupFile}
                    className="min-h-[42px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                  >
                    <Share2 className="w-4 h-4" />
                    {lang === 'hi'
                      ? 'WhatsApp / Drive पर बैकअप भेजें'
                      : 'Share Backup (WhatsApp/Drive)'}
                  </button>

                  <button
                    type="button"
                    data-testid="copy-backup-code-btn"
                    onClick={handleCopyBackupCode}
                    className="min-h-[42px] px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    {copiedBackupJson ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-blue-600" />
                    )}
                    {copiedBackupJson
                      ? lang === 'hi'
                        ? 'बैकअप कोड कॉपी हो गया!'
                        : 'Backup Code Copied!'
                      : lang === 'hi'
                      ? 'बैकअप कोड कॉपी करें (Copy Code)'
                      : 'Copy Backup Code'}
                  </button>
                </div>

                {/* Local Auto-Backup Snapshot Creator */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">
                    {lang === 'hi'
                      ? 'बिना किसी फ़ाइल के ऐप के अंदर तुरंत रिस्टोर पॉइंट बनाएँ:'
                      : 'Create an instant restore point inside the app:'}
                  </span>
                  <button
                    type="button"
                    data-testid="save-snapshot-btn"
                    onClick={handleSaveLocalSnapshot}
                    className="min-h-[36px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0"
                  >
                    <History className="w-3.5 h-3.5" />
                    {lang === 'hi' ? '+ लोकल स्नैपशॉट सेव करें' : '+ Save Snapshot'}
                  </button>
                </div>
              </div>

              {/* RIGHT BOX: STEP 2 - RESTORE DATA (File Upload + Paste Code + Merge/Replace Mode) */}
              <div className="bg-emerald-50/50 border-2 border-emerald-300 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-emerald-700" />
                    {lang === 'hi'
                      ? '2. बैकअप Restore करें (फ़ाइल या कोड से)'
                      : '2. Restore Backup (File or Code)'}
                  </h4>

                  {/* Restore Mode Selector: Merge vs Replace */}
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-emerald-200 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRestoreMode('merge')}
                      className={`px-2 py-1 rounded font-bold ${
                        restoreMode === 'merge'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'hi' ? 'मिलाएँ (Merge)' : 'Merge'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreMode('replace')}
                      className={`px-2 py-1 rounded font-bold ${
                        restoreMode === 'replace'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'hi' ? 'पूरा बदलें (Replace)' : 'Replace'}
                    </button>
                  </div>
                </div>

                {/* Method A: Direct Button to Open File Picker (Works in Android APK & Installed PWA) */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="select-restore-file-btn"
                    onClick={() => restoreFileInputRef.current?.click()}
                    className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs"
                  >
                    <Upload className="w-4 h-4" />
                    {lang === 'hi'
                      ? 'JSON बैकअप फ़ाइल चुनें और Restore करें'
                      : 'Select Backup File & Restore'}
                  </button>

                  <input
                    ref={restoreFileInputRef}
                    data-testid="restore-file-input"
                    type="file"
                    accept=".json,application/json,text/plain,*/*"
                    onChange={handleRestoreFileChange}
                    className="hidden"
                  />

                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={instantRestoreOnSelect}
                      onChange={(e) => setInstantRestoreOnSelect(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-emerald-600"
                    />
                    <span>
                      {lang === 'hi'
                        ? 'फ़ाइल चुनते ही तुरंत Restore करें'
                        : 'Instant restore on file select'}
                    </span>
                  </label>
                </div>

                {/* Method B: Paste Backup Code / JSON Text to Restore (Works 100% even if WebView blocks file picker) */}
                <div className="pt-2 border-t border-emerald-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="paste-backup-textarea"
                      className="text-xs font-bold text-slate-800"
                    >
                      {lang === 'hi'
                        ? 'या बैकअप कोड यहाँ पेस्ट करके Restore करें (ऐप/मोबाइल के लिए सबसे आसान):'
                        : 'Or Paste Backup Code Here to Restore:'}
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const clip = await navigator.clipboard.readText();
                          if (clip) setPasteBackupText(clip);
                        } catch {
                          // user can manually long-press paste
                        }
                      }}
                      className="text-[11px] font-bold text-blue-700 hover:underline flex items-center gap-1"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      {lang === 'hi' ? 'Clipboard से पेस्ट करें' : 'Paste from Clipboard'}
                    </button>
                  </div>

                  <textarea
                    id="paste-backup-textarea"
                    data-testid="paste-backup-textarea"
                    rows={3}
                    placeholder={
                      lang === 'hi'
                        ? 'यहाँ कॉपी किया हुआ JSON बैकअप कोड पेस्ट करें...'
                        : 'Paste copied JSON backup code here...'
                    }
                    value={pasteBackupText}
                    onChange={(e) => setPasteBackupText(e.target.value)}
                    className="w-full p-2.5 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />

                  <button
                    type="button"
                    data-testid="paste-restore-submit-btn"
                    onClick={handleRestoreFromPastedText}
                    disabled={!pasteBackupText.trim()}
                    className="w-full min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    {lang === 'hi'
                      ? 'पेस्ट किए गए कोड से डेटा अभी Restore करें'
                      : 'Restore Data from Pasted Code'}
                  </button>
                </div>
              </div>
            </div>

            {/* Saved Local Auto-Backup Snapshots List (1-Click Restore inside installed app) */}
            {snapshots.length > 0 && (
              <div
                data-testid="local-snapshots-section"
                className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-indigo-600" />
                    {lang === 'hi'
                      ? `सेव किए गए लोकल बैकअप स्नैपशॉट (${snapshots.length}) — बिना फ़ाइल के 1-Click Restore`
                      : `Saved Local Backup Snapshots (${snapshots.length}) — 1-Click Restore`}
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="bg-white border border-indigo-100 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <strong className="font-bold text-slate-900 block">{snap.label}</strong>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {snap.farmersCount} किसान · {snap.collectionsCount} खरीद · {snap.salesCount} बिक्री
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid="restore-snapshot-btn"
                          onClick={() => applyIncomingRestoreState(snap.state)}
                          className="min-h-[34px] px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                        >
                          Restore करें
                        </button>
                        <button
                          type="button"
                          onClick={() => setSnapshots(deleteBackupSnapshot(snap.id))}
                          className="min-h-[34px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                          title="हटाएँ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Excel-Compatible CSV Exports */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  {lang === 'hi'
                    ? 'Excel-Compatible CSV रिपोर्ट डाउनलोड'
                    : 'Excel-Compatible CSV Exports'}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {lang === 'hi'
                    ? 'किसान सूची, दूध खरीद और थोक बिक्री को सीधे Excel में खोलने योग्य CSV में डाउनलोड करें'
                    : 'Export Farmers, Milk Purchases, and Wholesale Sales as UTF-8 CSV files'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportFarmersCsv}
                  className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  {lang === 'hi' ? 'किसान सूची CSV' : 'Farmers CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleExportCollectionsCsv}
                  className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  {lang === 'hi' ? 'दूध खरीद रिपोर्ट CSV' : 'Milk Purchase CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleExportSalesCsv}
                  className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  {lang === 'hi' ? 'थोक बिक्री रिपोर्ट CSV' : 'Sales CSV'}
                </button>
              </div>
            </div>
          </div>

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

            {/* Direct In-App APK Download (v1.0.7 - Build #7 - 4.3 MB) */}
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-xs sm:text-sm text-emerald-950 block">
                  {lang === 'hi'
                    ? 'नया Ujalaa-Dairy-debug.apk तैयार है! (GitHub Release v1.0.7 · Build #7 · 4.3 MB):'
                    : 'New Ujalaa-Dairy-debug.apk is Ready! (GitHub Release v1.0.7 · Build #7 · 4.3 MB):'}
                </strong>
                <span className="text-xs text-emerald-800">
                  {lang === 'hi'
                    ? 'आपके सभी नवीनतम अपडेट्स (DD-MM-YYYY तारीख फॉर्मेट, बिना लेफ्ट-राइट स्वाइप वाला साफ बिल व सेव एंट्री टेबल जिसमें FAT/SNF/Rate स्पष्ट लाइनों के साथ बड़े दिखते हैं, ऑफलाइन फोटो स्लिप से 21–31 तारीख की 10–11 एंट्री सेव करने की सुविधा, साफ डैशबोर्ड और 10-दिन की सुबह/शाम/संयुक्त व लाभ-हानि रिपोर्ट) वाला नया APK (v1.0.7 · Build #7) तैयार हो चुका है। इस हरे बटन को दबाकर तुरंत डाउनलोड करें।'
                    : 'Your latest APK (v1.0.7 Build #7) with DD-MM-YYYY date formatting, single-screen bordered bill & entry tables with larger FAT/SNF/Rate columns, offline photo slip scanner (10-11 multi-date entries), clean dashboard, and 10-day morning/evening/combined & P&L reports is ready. Click the green button to download Ujalaa-Dairy-debug.apk (4.3 MB).'}
                </span>
              </div>
              <a
                href="/Ujalaa-Dairy-debug.apk"
                download="Ujalaa-Dairy-debug.apk"
                className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shrink-0 shadow-xs"
              >
                <Download className="w-4 h-4" />
                {lang === 'hi'
                  ? 'सीधा Ujalaa-Dairy-debug.apk डाउनलोड करें (v1.0.7 · 4.3 MB)'
                  : 'Download Ujalaa-Dairy-debug.apk (v1.0.7 · 4.3 MB)'}
              </a>
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
            ? `इस बैकअप फ़ाइल में ${pendingRestoreState?.farmers.length || 0} किसान, ${
                pendingRestoreState?.collections.length || 0
              } दूध खरीद और ${pendingRestoreState?.sales.length || 0} बिक्री एंट्रियाँ हैं। क्या आप Restore की पुष्टि करते हैं?`
            : `This backup contains ${pendingRestoreState?.farmers.length || 0} farmers, ${
                pendingRestoreState?.collections.length || 0
              } milk entries, and ${pendingRestoreState?.sales.length || 0} sales. Proceed with restore?`
        }
        confirmLabel={lang === 'hi' ? 'हाँ, डेटा Restore करें' : 'Restore Now'}
        onCancel={() => setPendingRestoreState(null)}
        onConfirm={() => {
          if (pendingRestoreState) {
            applyIncomingRestoreState(pendingRestoreState);
          }
          setPendingRestoreState(null);
        }}
      />

      {/* WhatsApp Share Modal for 10-Day Sale Bill in Reports */}
      <WhatsAppPreviewModal
        open={saleWaModal.open}
        title={
          lang === 'hi'
            ? '10-दिन का बिक्री बिल WhatsApp पर भेजें'
            : 'Share 10-Day Sale Bill on WhatsApp'
        }
        phone={saleWaModal.phone}
        message={saleWaModal.message}
        lang={lang}
        onClose={() => setSaleWaModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
