export type EmployeeImportField='name'|'cpf'|'registration'|'role'|'admissionDate'|'salary'|'dependents'|'active'|'sector'|'jobSite'|'costCenter'|'pis'|'workHours';
export const EMPLOYEE_IMPORT_COLUMNS:ReadonlyArray<{key:EmployeeImportField;label:string;aliases:string[]}>= [
  {key:'name',label:'Nome completo *',aliases:['nome','nome completo','funcionário','funcionario','colaborador']},
  {key:'cpf',label:'CPF',aliases:['cpf','documento']},
  {key:'registration',label:'Matrícula',aliases:['matrícula','matricula','registro']},
  {key:'role',label:'Cargo *',aliases:['cargo','função','funcao']},
  {key:'admissionDate',label:'Admissão *',aliases:['admissão','admissao','data de admissão','data admissao']},
  {key:'salary',label:'Salário mensal (R$) *',aliases:['salário','salario','salário mensal','salario base','salario mensal','salário-base']},
  {key:'dependents',label:'Dependentes',aliases:['dependentes','dependentes irrf']},
  {key:'active',label:'Situação',aliases:['situação','situacao','ativo','status']},
  {key:'sector',label:'Setor',aliases:['setor','departamento']},
  {key:'jobSite',label:'Obra/local de trabalho',aliases:['obra','local de trabalho']},
  {key:'costCenter',label:'Centro de custo',aliases:['centro de custo','centro custo']},
  {key:'pis',label:'PIS/NIS',aliases:['pis','nis','pis/nis']},
  {key:'workHours',label:'Jornada contratual',aliases:['jornada','jornada contratual','horas semanais']}
];
