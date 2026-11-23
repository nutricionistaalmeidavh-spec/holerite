import type {PointSource} from '../shared/time';

/** Labels deliberately distinguish an administrative suggestion from a real time punch. */
const sourceLabels:Record<PointSource,string>={
 suggested:'Gerada',
 reviewed:'Gerada · conferida',
 manual:'Manual',
 imported:'Importada'
};

export function pointSourceLabel(source:PointSource):string {
 return sourceLabels[source];
}

export type PointRowStatus={label:string;tone:'warning'|'suggested'|'reviewed'|'neutral'};

/** Visual-only classifier. It never alters attendance, confirmation or payroll calculations. */
export function pointRowStatus(source:PointSource,hasIssues:boolean):PointRowStatus {
 if(hasIssues)return {label:'Aviso',tone:'warning'};
 if(source==='suggested')return {label:'Sugestão',tone:'suggested'};
 if(source==='reviewed')return {label:'Conferida',tone:'reviewed'};
 return {label:'Registrada',tone:'neutral'};
}
