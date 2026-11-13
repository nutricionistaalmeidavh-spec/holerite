export type ItemKind = 'earning' | 'deduction';
export type PayrollStatus = 'draft' | 'finalized' | 'paid';
export type TaxMode = 'automatic' | 'manual';
import type {PayrollKind, SpecialOptions} from './special';

export interface Company {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  companyId: string;
  name: string;
  cpf: string;
  role: string;
  admissionDate: string;
  salaryCents: number;
  dependents: number;
  active: boolean;
  createdAt: string;
}

export interface PayItem {
  id: string;
  code: string;
  description: string;
  kind: ItemKind;
  amountCents: number;
  inssBase: boolean;
  irBase: boolean;
  fgtsBase: boolean;
}

export interface PayrollInput {
  kind?: PayrollKind;
  options?: SpecialOptions;
  id?: string;
  employeeId: string;
  competence: string;
  salaryOverrideCents?: number | null;
  entries: PayItem[];
  taxMode: TaxMode;
}

export interface PayrollTotals {
  grossCents: number;
  deductionCents: number;
  netCents: number;
  inssCents: number;
  irrfCents: number;
  fgtsCents: number;
  inssBaseCents: number;
  irBaseCents: number;
  fgtsBaseCents: number;
}

export interface PayrollCalculation {
  items: PayItem[];
  totals: PayrollTotals;
  taxVersion: string;
}

export interface PayrollDetails extends PayrollCalculation {
  kind?: PayrollKind;
  options?: SpecialOptions;
  payableBy?: string;
  fgtsPenaltyCents?: number;
  noticeDays?: number;
  warnings?: string[];
  employee: Employee;
  company: Company;
  competence: string;
  taxMode: TaxMode;
}

export interface PayrollRecord {
  kind: PayrollKind;
  id: string;
  employeeId: string;
  companyId: string;
  competence: string;
  status: PayrollStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  details: PayrollDetails;
}

export interface StateSnapshot {
  companies: Company[];
  employees: Employee[];
  payrolls: PayrollRecord[];
}

export interface CompanyInput {
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: string;
}
export interface EmployeeInput {
  companyId: string;
  name: string;
  cpf: string;
  role: string;
  admissionDate: string;
  salaryCents: number;
  dependents: number;
  active: boolean;
}

export interface HoleriteAPI {
  snapshot(): Promise<StateSnapshot>;
  saveCompany(input: CompanyInput & {id?: string}): Promise<Company>;
  saveEmployee(input: EmployeeInput & {id?: string}): Promise<Employee>;
  savePayroll(input: PayrollInput): Promise<PayrollRecord>;
  finalizePayroll(id: string): Promise<PayrollRecord>;
  markPaid(id: string): Promise<PayrollRecord>;
  deleteDraft(id: string): Promise<void>;
  exportPDF(id: string): Promise<boolean>;
  print(id: string): Promise<void>;
  exportBackup(): Promise<boolean>;
  exportCSV(): Promise<boolean>;
}
