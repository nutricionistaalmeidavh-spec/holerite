import { contextBridge, ipcRenderer } from 'electron';
import type {HoleriteAPI} from '../src/shared/types';
const call = <T>(method: string, input?: unknown): Promise<T> => ipcRenderer.invoke('holerites:' + method, input);
const api: HoleriteAPI = {
  snapshot: () => call('snapshot'),
  saveCompany: input => call('save-company', input),
  saveEmployee: input => call('save-employee', input),
  savePayroll: input => call('save-payroll', input),
  finalizePayroll: id => call('finalize', id),
  markPaid: id => call('mark-paid', id),
  deleteDraft: id => call('delete-draft', id),
  exportPDF: id => call('export-pdf', id),
  print: id => call('print', id),
  exportBackup: () => call('export-backup'),
  exportCSV: () => call('export-csv')
};
contextBridge.exposeInMainWorld('holerites', api);
