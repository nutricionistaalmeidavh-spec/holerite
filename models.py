"""Database and domain operations for the local Holerite system.

All monetary values in SQLite and JSON are integer centavos. No external services.
"""
from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

TYPES = {"mensal": "Holerite mensal", "ferias": "Recibo de férias", "decimo": "13º salário", "rescisao": "Demonstrativo de rescisão"}
KINDS = {"provento", "desconto"}


class ValidationError(ValueError):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def trim(value: Any, limit: int = 180) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError("O campo deve ser texto.")
    result = value.strip()
    if len(result) > limit:
        raise ValidationError(f"O campo aceita até {limit} caracteres.")
    return result


def required(value: Any, name: str, limit: int = 180) -> str:
    result = trim(value, limit)
    if not result:
        raise ValidationError(f"{name} é obrigatório.")
    return result


def cents(value: Any, name: str = "Valor") -> int:
    # No binary floats: the browser sends integer centavos.
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(f"{name} deve ser enviado em centavos inteiros.")
    if not 0 <= value <= 999_999_999_99:
        raise ValidationError(f"{name} fora dos limites permitidos.")
    return value


def cpf_valid(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 11 or len(set(digits)) == 1:
        return False
    for size in (9, 10):
        mod = (sum(int(d) * w for d, w in zip(digits[:size], range(size + 1, 1, -1))) * 10) % 11
        if (0 if mod == 10 else mod) != int(digits[size]):
            return False
    return True


def iso_date(value: Any, name: str) -> str:
    result = required(value, name, 10)
    try:
        if date.fromisoformat(result).isoformat() != result:
            raise ValueError
    except ValueError:
        raise ValidationError(f"{name} deve estar no formato AAAA-MM-DD.") from None
    return result


def period_valid(value: Any) -> str:
    result = required(value, "Competência", 7)
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", result):
        raise ValidationError("Competência inválida (AAAA-MM).")
    return result


def jsondict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


class Store:
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=15)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=15000")
            with conn:
                yield conn
        finally:
            conn.close()

    def initialize(self):
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS company (
                    id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL DEFAULT '',
                    cnpj TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
                    contact TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS employees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL, cpf TEXT NOT NULL UNIQUE, pis TEXT NOT NULL DEFAULT '',
                    registration TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL,
                    department TEXT NOT NULL DEFAULT '', admission_date TEXT NOT NULL,
                    salary_cents INTEGER NOT NULL CHECK(salary_cents >= 0),
                    weekly_hours INTEGER NOT NULL DEFAULT 44,
                    contract_type TEXT NOT NULL DEFAULT 'CLT',
                    bank_details TEXT NOT NULL DEFAULT '',
                    dependents INTEGER NOT NULL DEFAULT 0,
                    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS recurring_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    description TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('provento','desconto')),
                    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS payslips (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id INTEGER NOT NULL REFERENCES employees(id),
                    period TEXT NOT NULL, doc_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','finalizado')),
                    employee_snapshot TEXT NOT NULL, company_snapshot TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
                    finalized_at TEXT,
                    UNIQUE(employee_id,period,doc_type)
                );
                CREATE TABLE IF NOT EXISTS payslip_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    payslip_id INTEGER NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
                    description TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('provento','desconto')),
                    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
                    origin TEXT NOT NULL CHECK(origin IN ('salario','recorrente','manual'))
                );
                CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active, name);
                CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(period, doc_type);
            """)
            db.execute("INSERT OR IGNORE INTO company(id,name,updated_at) VALUES(1,'',?)", (now(),))

    def get_company(self):
        with self.connect() as db:
            return dict(db.execute("SELECT * FROM company WHERE id=1").fetchone())

    def save_company(self, data):
        if not isinstance(data, dict):
            raise ValidationError("Dados inválidos.")
        values = (required(data.get("name"), "Razão social"), trim(data.get("cnpj"), 18),
                  trim(data.get("address"), 300), trim(data.get("contact"), 180), now())
        with self.connect() as db:
            db.execute("UPDATE company SET name=?,cnpj=?,address=?,contact=?,updated_at=? WHERE id=1", values)
        return self.get_company()

    def list_employees(self, include_inactive=True):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM employees " + ("" if include_inactive else "WHERE active=1 ") + "ORDER BY name COLLATE NOCASE").fetchall()
            return [dict(r) for r in rows]

    def get_employee(self, employee_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM employees WHERE id=?", (employee_id,)).fetchone()
            if row is None:
                raise ValidationError("Funcionário não encontrado.")
            employee = dict(row)
            employee["recurring_items"] = [dict(r) for r in db.execute("SELECT * FROM recurring_items WHERE employee_id=? ORDER BY id", (employee_id,))]
            return employee

    def save_employee(self, data, employee_id=None):
        if not isinstance(data, dict):
            raise ValidationError("Dados inválidos.")
        cpf = re.sub(r"\D", "", required(data.get("cpf"), "CPF", 18))
        if not cpf_valid(cpf):
            raise ValidationError("CPF inválido.")
        salary = cents(data.get("salary_cents"), "Salário-base")
        hours = data.get("weekly_hours", 44)
        if type(hours) is not int or not (1 <= hours <= 60):
            raise ValidationError("Jornada semanal deve ser de 1 a 60 horas.")
        dependents = data.get("dependents", 0)
        if type(dependents) is not int or not (0 <= dependents <= 30):
            raise ValidationError("Número de dependentes inválido.")
        active = data.get("active", True)
        if type(active) is not bool:
            raise ValidationError("Situação de vínculo inválida.")
        fields = (required(data.get("name"), "Nome completo"), cpf,
                  trim(data.get("pis"), 20), trim(data.get("registration"), 32),
                  required(data.get("job_title"), "Cargo"), trim(data.get("department")),
                  iso_date(data.get("admission_date"), "Admissão"), salary,
                  hours, trim(data.get("contract_type") or "CLT", 80),
                  trim(data.get("bank_details"), 200), dependents, int(active), now())
        try:
            with self.connect() as db:
                if employee_id is None:
                    cursor = db.execute("""INSERT INTO employees(name,cpf,pis,registration,job_title,department,admission_date,
                        salary_cents,weekly_hours,contract_type,bank_details,dependents,active,updated_at,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", fields + (now(),))
                    employee_id = cursor.lastrowid
                else:
                    if db.execute("SELECT 1 FROM employees WHERE id=?", (employee_id,)).fetchone() is None:
                        raise ValidationError("Funcionário não encontrado.")
                    db.execute("""UPDATE employees SET name=?,cpf=?,pis=?,registration=?,job_title=?,department=?,
                        admission_date=?,salary_cents=?,weekly_hours=?,contract_type=?,bank_details=?,dependents=?,
                        active=?,updated_at=? WHERE id=?""", fields + (employee_id,))
        except sqlite3.IntegrityError as exc:
            if "cpf" in str(exc).lower():
                raise ValidationError("Já existe funcionário com esse CPF.") from exc
            raise
        return self.get_employee(employee_id)

    def add_recurring(self, employee_id, data):
        self.get_employee(employee_id)
        description, kind, amount = self._item_input(data)
        with self.connect() as db:
            cursor = db.execute("INSERT INTO recurring_items(employee_id,description,kind,amount_cents,created_at) VALUES(?,?,?,?,?)",
                                (employee_id, description, kind, amount, now()))
            return dict(db.execute("SELECT * FROM recurring_items WHERE id=?", (cursor.lastrowid,)).fetchone())

    def delete_recurring(self, employee_id, item_id):
        with self.connect() as db:
            cursor = db.execute("DELETE FROM recurring_items WHERE employee_id=? AND id=?", (employee_id, item_id))
            if not cursor.rowcount:
                raise ValidationError("Rubrica recorrente não encontrada.")

    @staticmethod
    def _item_input(data):
        if not isinstance(data, dict):
            raise ValidationError("Rubrica inválida.")
        kind = data.get("kind")
        if kind not in KINDS:
            raise ValidationError("Tipo da rubrica inválido.")
        return (required(data.get("description"), "Descrição"), kind, cents(data.get("amount_cents")))

    def generate(self, employee_id, period, doc_type="mensal"):
        period = period_valid(period)
        if doc_type not in TYPES:
            raise ValidationError("Tipo de documento inválido.")
        import json
        with self.connect() as db:
            employee = db.execute("SELECT * FROM employees WHERE id=?", (employee_id,)).fetchone()
            if not employee:
                raise ValidationError("Funcionário não encontrado.")
            if not employee["active"]:
                raise ValidationError("Funcionário inativo; reative para gerar novo documento.")
            company = db.execute("SELECT * FROM company WHERE id=1").fetchone()
            if not company["name"]:
                raise ValidationError("Cadastre os dados da empresa antes de gerar documentos.")
            existing = db.execute("SELECT id FROM payslips WHERE employee_id=? AND period=? AND doc_type=?",
                                  (employee_id, period, doc_type)).fetchone()
            if existing:
                return self.get_payslip(existing["id"])
            cursor = db.execute("""INSERT INTO payslips(employee_id,period,doc_type,employee_snapshot,company_snapshot,created_at)
                                   VALUES(?,?,?,?,?,?)""", (employee_id, period, doc_type,
                                   json.dumps(dict(employee), ensure_ascii=False), json.dumps(dict(company), ensure_ascii=False), now()))
            pid = cursor.lastrowid
            if doc_type == "mensal":
                db.execute("INSERT INTO payslip_items(payslip_id,description,kind,amount_cents,origin) VALUES(?,?,?,?,?)",
                           (pid, "Salário-base", "provento", employee["salary_cents"], "salario"))
                db.execute("""INSERT INTO payslip_items(payslip_id,description,kind,amount_cents,origin)
                              SELECT ?, description,kind,amount_cents,'recorrente' FROM recurring_items WHERE employee_id=?""", (pid, employee_id))
        return self.get_payslip(pid)

    def generate_batch(self, period):
        period = period_valid(period)
        employees = self.list_employees(include_inactive=False)
        generated, errors = [], []
        for employee in employees:
            try:
                generated.append(self.generate(employee["id"], period))
            except ValidationError as exc:
                errors.append({"employee_id": employee["id"], "error": str(exc)})
        return {"documents": generated, "errors": errors, "count": len(generated)}

    def list_payslips(self, period=None):
        if period:
            period = period_valid(period)
        with self.connect() as db:
            params = (period,) if period else ()
            sql = "SELECT p.id,p.employee_id,p.period,p.doc_type,p.status,p.created_at,e.name AS employee_name FROM payslips p JOIN employees e ON e.id=p.employee_id"
            if period:
                sql += " WHERE p.period=?"
            sql += " ORDER BY p.period DESC, e.name COLLATE NOCASE, p.id DESC"
            return [dict(row) for row in db.execute(sql, params)]

    def get_payslip(self, slip_id):
        import json
        with self.connect() as db:
            row = db.execute("SELECT * FROM payslips WHERE id=?", (slip_id,)).fetchone()
            if row is None:
                raise ValidationError("Documento não encontrado.")
            slip = dict(row)
            slip["employee_snapshot"] = json.loads(slip["employee_snapshot"])
            slip["company_snapshot"] = json.loads(slip["company_snapshot"])
            slip["items"] = [dict(r) for r in db.execute("SELECT * FROM payslip_items WHERE payslip_id=? ORDER BY id", (slip_id,))]
            slip["earnings_cents"] = sum(item["amount_cents"] for item in slip["items"] if item["kind"] == "provento")
            slip["deductions_cents"] = sum(item["amount_cents"] for item in slip["items"] if item["kind"] == "desconto")
            slip["net_cents"] = slip["earnings_cents"] - slip["deductions_cents"]
            return slip

    def add_item(self, slip_id, data):
        description, kind, amount = self._item_input(data)
        with self.connect() as db:
            row = db.execute("SELECT status FROM payslips WHERE id=?", (slip_id,)).fetchone()
            if not row:
                raise ValidationError("Documento não encontrado.")
            if row["status"] != "rascunho":
                raise ValidationError("Documento finalizado não pode ser alterado.")
            db.execute("INSERT INTO payslip_items(payslip_id,description,kind,amount_cents,origin) VALUES(?,?,?,?, 'manual')",
                       (slip_id, description, kind, amount))
        return self.get_payslip(slip_id)

    def delete_item(self, slip_id, item_id):
        with self.connect() as db:
            row = db.execute("SELECT status FROM payslips WHERE id=?", (slip_id,)).fetchone()
            if not row:
                raise ValidationError("Documento não encontrado.")
            if row["status"] != "rascunho":
                raise ValidationError("Documento finalizado não pode ser alterado.")
            item = db.execute("SELECT origin FROM payslip_items WHERE id=? AND payslip_id=?", (item_id, slip_id)).fetchone()
            if not item:
                raise ValidationError("Rubrica não encontrada.")
            if item["origin"] != "manual":
                raise ValidationError("Rubrica automática não pode ser removida; ajuste o cadastro e gere uma nova competência.")
            db.execute("DELETE FROM payslip_items WHERE id=? AND payslip_id=?", (item_id, slip_id))
        return self.get_payslip(slip_id)

    def finalize(self, slip_id):
        with self.connect() as db:
            row = db.execute("SELECT status FROM payslips WHERE id=?", (slip_id,)).fetchone()
            if row is None:
                raise ValidationError("Documento não encontrado.")
            if row["status"] == "rascunho":
                values = db.execute("SELECT kind,amount_cents FROM payslip_items WHERE payslip_id=?", (slip_id,)).fetchall()
                earnings = sum(r["amount_cents"] for r in values if r["kind"] == "provento")
                deductions = sum(r["amount_cents"] for r in values if r["kind"] == "desconto")
                if earnings <= 0:
                    raise ValidationError("Adicione ao menos um provento positivo antes de finalizar.")
                if deductions > earnings:
                    raise ValidationError("O valor líquido não pode ser negativo.")
                db.execute("UPDATE payslips SET status='finalizado',finalized_at=? WHERE id=?", (now(), slip_id))
        return self.get_payslip(slip_id)
