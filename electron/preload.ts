import { contextBridge, ipcRenderer } from 'electron';
import type {HoleriteAPI} from '../src/shared/types';
const call = <T>(method: string, input?: unknown): Promise<T> => ipcRenderer.invoke('holerites:' + method, input);
const api: HoleriteAPI = {
  snapshot: () => call('snapshot'),
  saveCompany: input => call('save-company', input),
  saveEmployee: input => call('save-employee', input),
  generateMonthlyBatch: input => call('generate-monthly-batch', input),
  savePayroll: input => call('save-payroll', input),
  finalizePayroll: id => call('finalize', id),
  markPaid: id => call('mark-paid', id),
  deleteDraft: id => call('delete-draft', id),
  exportPDF: id => call('export-pdf', id),
  print: id => call('print', id),
  exportBackup: () => call('export-backup'),
  exportCSV: () => call('export-csv'),
  getTimeConfig: id => call('time-config',id),
  setTimeConfig: input => call('time-set-config',input),
  getTimeSchedule: id => call('time-schedule',id),
  setTimeSchedule: input => call('time-set-schedule',input),
  getTimeSheet: input => call('time-sheet',input),
  getTimeMatrix: input => call('time-matrix',input),
  getTimeAudit: input => call('time-audit',input),
  autofillTimeSheet: input => call('time-autofill',input),
  reviewTimeSuggestions: input => call('time-bulk-review',input),
  saveTimeMatrix: input => call('time-save-matrix',input),
  closeTimeSheet: input => call('time-close',input),
  reopenTimeSheet: input => call('time-reopen',input),
  applyTimeToPayroll: input => call('time-apply-payroll',input),
  chooseTimeFile: id => call('time-import-choose',id),
  previewTimeFile: input => call('time-import-preview',input),
  commitTimeFile: input => call('time-import-commit',input),
  getTimeImportHistory: id => call('time-import-history',id),
  getTimeBankBalance: input => call('time-bank-balance',input),
  exportTimeMatrix: input => call('time-export-matrix',input),
  exportTimePDF: input => call('time-export-pdf',input),
  printTimeSheet: input => call('time-print',input)
};
contextBridge.exposeInMainWorld('holerites', api);
