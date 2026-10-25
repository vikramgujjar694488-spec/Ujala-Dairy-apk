export type ShiftType = 'morning' | 'evening';
export type FarmerShiftSchedule = 'morning' | 'evening' | 'both';
export type MilkType = 'cow' | 'buffalo';
export type SaleMilkType = 'cow' | 'buffalo' | 'mixed';
export type PaymentMethod = 'cash' | 'bank' | 'upi' | 'other';
export type Language = 'hi' | 'en';

export interface Farmer {
  id: string; // internal UUID
  code: string; // Farmer ID e.g. "101" or "F01"
  name: string;
  mobile: string;
  village: string;
  defaultMilkType?: MilkType;
  shiftSchedule: FarmerShiftSchedule; // केवल सुबह | केवल शाम | सुबह और शाम दोनों समय
  openingBalance: number; // +ve means payable to farmer, -ve means advance/recoverable from farmer
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface MilkCollectionEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  shift: ShiftType;
  farmerId: string;
  farmerName: string;
  farmerCode: string;
  milkType: MilkType; // auto-classified by FAT <= 5.0 => cow, > 5.0 => buffalo
  liters: number; // 3 decimal precision
  fat: number; // 1-2 decimal precision
  snf: number; // 1-2 decimal precision
  rate: number; // 2 decimal precision
  totalAmount: number; // liters * rate (rounded to 2 decimals)
  deduction: number; // inline advance/other deduction at collection time if any
  netPayable: number; // totalAmount - deduction
  notes: string;
  createdAt: string;
}

export interface FarmerLeaveRecord {
  id: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  farmerId: string;
  reason?: string;
}

export interface RateChartMatrix {
  milkType: MilkType;
  fileName: string;
  sheetName: string;
  updatedAt: string;
  fats: number[]; // sorted column headers e.g. [3.0, 3.1, ..., 5.0]
  snfs: number[]; // sorted row headers e.g. [8.0, 8.1, ..., 9.0]
  // key format: `${fatKey}_${snfKey}` where fatKey = fat.toFixed(2), snfKey = snf.toFixed(2)
  rates: Record<string, number>;
  rowCount: number;
  colCount: number;
  invalidCellCount: number;
}

export interface Customer {
  id: string; // internal UUID e.g. "cust_..."
  code: string; // Customer ID e.g. "C01" or "101"
  name: string;
  mobile: string;
  address: string;
  defaultMilkType?: MilkType | 'mixed';
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface WholesaleSaleEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string;
  shift: ShiftType;
  customerId?: string;
  customerCode?: string;
  buyerName: string;
  milkType: SaleMilkType;
  liters: number;
  avgFat: number;
  avgSnf: number;
  rate: number;
  isManualRate: boolean;
  grossAmount: number; // liters * rate
  otherCharges: number; // transport/chilling/deductions on sale
  netReceivable: number; // grossAmount - otherCharges
  notes: string;
  createdAt: string;
}

export interface AdvancePaymentEntry {
  id: string;
  txnCode: string; // Unique transaction ID to prevent duplicate entry
  date: string; // YYYY-MM-DD
  farmerId: string;
  farmerName: string;
  type: 'advance' | 'payment'; // 'advance' = advance given before bill, 'payment' = settlement payment given to farmer
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt: string;
}

export interface CattleFeedEntry {
  id: string;
  txnCode: string;
  date: string; // YYYY-MM-DD
  farmerId: string;
  farmerName: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMode: 'deduct_from_milk' | 'cash_paid'; // only 'deduct_from_milk' reduces farmer balance
  notes: string;
  createdAt: string;
}

export interface ExpenseEntry {
  id: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType | 'general'; // 'morning' | 'evening' | 'general' (daily/monthly non-shift specific)
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
  createdAt: string;
}

export interface TenDayBill {
  id: string;
  billNumber: string;
  farmerId: string;
  farmerName: string;
  farmerCode: string;
  yearMonth: string; // YYYY-MM
  cycle: 1 | 2 | 3; // 1: 1-10, 2: 11-20, 3: 21-end
  fromDate: string;
  toDate: string;
  morningLiters: number;
  morningAmount: number;
  eveningLiters: number;
  eveningAmount: number;
  totalLiters: number;
  avgFat: number | null;
  avgSnf: number | null;
  avgRate: number | null;
  totalMilkAmount: number;
  inlineDeductions: number;
  advancesInPeriod: number;
  feedDeductionsInPeriod: number;
  paymentsInPeriod: number;
  previousBalance: number;
  netPayable: number;
  snapshotHash: string; // used to detect if underlying entries changed after bill generation
  createdAt: string;
}

export interface DairyAppState {
  dairyName: string;
  dairyPhone: string;
  dairyAddress: string;
  language: Language;
  selectedDate: string; // YYYY-MM-DD
  selectedShift: ShiftType;
  expenseCategories: string[];
  farmers: Farmer[];
  customers: Customer[];
  collections: MilkCollectionEntry[];
  leaves: FarmerLeaveRecord[];
  sales: WholesaleSaleEntry[];
  advancesAndPayments: AdvancePaymentEntry[];
  cattleFeed: CattleFeedEntry[];
  expenses: ExpenseEntry[];
  rateCharts: {
    cow: RateChartMatrix | null;
    buffalo: RateChartMatrix | null;
  };
  bills: TenDayBill[];
}
