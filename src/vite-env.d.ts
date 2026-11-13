/// <reference types="vite/client" />
import type { HoleriteAPI } from './shared/types';
declare global { interface Window { holerites: HoleriteAPI; } }
export {};
