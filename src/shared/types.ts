import type {WorkSchedule} from './time';
import type {AuthState,LocalRole,LocalOperator} from '../../electron/access-control';
import type {TimeConfig,TimeSheet,MatrixChange} from '../../electron/attendance';
import type {ImportChoice,ImportPreview,ImportMapping} from '../../electron/time-import';
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
  /** Os campos extras são opcionais para ler snapshots legados. */
  registration?: string;
  sector?: string;
  jobSite?: string;
  costCenter?: string;
  pis?: string;
  workHours?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  pixKey?: string;
  recurringEntries?: PayItem[];
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
  salaryCents?: number;
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
  registration?: string;
  sector?: string;
  jobSite?: string;
  costCenter?: string;
  pis?: string;
  workHours?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  pixKey?: string;
  recurringEntries?: PayItem[];
  companyId: string;
  name: string;
  cpf: string;
  role: string;
  admissionDate: string;
  salaryCents: number;
  dependents: number;
  active: boolean;
}

export interface MonthlyBatchResult {created:number; skipped:number;}
export interface MonthlyBatchInput {companyId:string;competence:string;taxMode:TaxMode;}
export interface PointAttachment {id:string;employeeId:string;date:string;filename:string;mime:string;size:number;createdAt:string;}
export interface HoleriteAPI {
  getAuthState():Promise<AuthState>;
  setupLocalAccess(input:{name:string;pin:string}):Promise<LocalOperator>;
  loginLocal(input:{name:string;pin:string}):Promise<LocalOperator>;
  logoutLocal():Promise<void>;
  getLocalOperators():Promise<LocalOperator[]>;
  addLocalOperator(input:{name:string;pin:string;role:LocalRole}):Promise<LocalOperator>;
  snapshot(): Promise<StateSnapshot>;
  saveCompany(input: CompanyInput & {id?: string}): Promise<Company>;
  saveEmployee(input: EmployeeInput & {id?: string}): Promise<Employee>;
  generateMonthlyBatch(input:MonthlyBatchInput):Promise<MonthlyBatchResult>;
  savePayroll(input: PayrollInput): Promise<PayrollRecord>;
  finalizePayroll(id: string): Promise<PayrollRecord>;
  markPaid(id: string): Promise<PayrollRecord>;
  deleteDraft(id: string): Promise<void>;
  exportPDF(id: string): Promise<boolean>;
  print(id: string): Promise<void>;
  exportBackup(): Promise<boolean>;
  exportCSV(input:import('./workspace-scope').PayrollScope): Promise<boolean>;
  getTimeConfig(companyId:string):Promise<TimeConfig>;
  setTimeConfig(input:{companyId:string;config:TimeConfig}):Promise<TimeConfig>;
  getTimeSchedule(employeeId:string):Promise<WorkSchedule>;
  setTimeSchedule(input:{employeeId:string;schedule:WorkSchedule}):Promise<WorkSchedule>;
  getTimeSheet(input:{employeeId:string;competence:string}):Promise<TimeSheet>;
  getTimeMatrix(input:{companyId:string;competence:string}):Promise<Array<TimeSheet&{employeeName:string}>>;
  getTimeAudit(input:{employeeId:string;competence:string}):Promise<Array<{date:string|null;action:string;reason:string;created_at:string;actor_name?:string}>>;
  autofillTimeSheet(input:{employeeId:string;competence:string}):Promise<TimeSheet>;
  reviewTimeSuggestions(input:{employeeIds:string[];competence:string}):Promise<{reviewed:number;employees:number}>;
  saveTimeMatrix(input:{changes:MatrixChange[];overwriteImported?:boolean}):Promise<number>;
  closeTimeSheet(input:{employeeId:string;competence:string}):Promise<TimeSheet>;
  reopenTimeSheet(input:{employeeId:string;competence:string;reason:string}):Promise<TimeSheet>;
  applyTimeToPayroll(input:{employeeId:string;competence:string}):Promise<PayrollRecord>;
  chooseTimeFile(companyId:string):Promise<ImportChoice|null>;
  previewTimeFile(input:{token:string;mapping:ImportMapping}):Promise<ImportPreview>;
  commitTimeFile(input:{token:string;mapping:ImportMapping;allowReplace?:boolean}):Promise<{imported:number}>;
  getTimeImportHistory(companyId:string):Promise<Array<{filename:string;processed:number;created_at:string}>>;
  getTimeBankBalance(input:{employeeId:string;competence:string}):Promise<number>;
  exportTimeMatrix(input:{companyId:string;competence:string;format:'csv'|'xlsx'|'template'}):Promise<boolean>;
  exportTimePDF(input:{employeeId:string;competence:string}):Promise<boolean>;
  printTimeSheet(input:{employeeId:string;competence:string}):Promise<boolean>;
  getTimeAttachments(input:{employeeId:string;competence:string}):Promise<PointAttachment[]>;
  addTimeAttachment(input:{employeeId:string;date:string}):Promise<PointAttachment|null>;
  saveTimeAttachment(input:{employeeId:string;id:string}):Promise<boolean>;
  removeTimeAttachment(input:{employeeId:string;id:string}):Promise<void>;
  exportTimeReport(input:{companyId:string;competence:string;employeeIds?:string[]}):Promise<boolean>;
  exportTimeBatchPDF(input:{companyId:string;competence:string;employeeIds:string[]}):Promise<boolean>;
  printTimeBatch(input:{companyId:string;competence:string;employeeIds:string[]}):Promise<boolean>;

}
