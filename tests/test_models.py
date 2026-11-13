import tempfile
import unittest
from pathlib import Path

from models import Store, ValidationError


EMPLOYEE = {
    'name': 'João Teste', 'cpf': '529.982.247-25', 'job_title': 'Encanador',
    'admission_date': '2024-03-01', 'salary_cents': 285000,
    'weekly_hours': 44, 'dependents': 1, 'active': True,
}


class PayrollTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.store = Store(Path(self.folder.name) / 'test.sqlite3')
        self.store.save_company({'name': 'Empresa Teste LTDA', 'cnpj': '00.000.000/0001-00'})

    def employee(self):
        return self.store.save_employee(EMPLOYEE)

    def test_employee_registers_and_updates_with_integer_centavos(self):
        employee = self.employee()
        self.assertEqual(employee['cpf'], '52998224725')
        self.assertEqual(employee['salary_cents'], 285000)
        updated = self.store.save_employee({**EMPLOYEE, 'job_title': 'Encanador II', 'salary_cents': 330000}, employee['id'])
        self.assertEqual(updated['job_title'], 'Encanador II')
        self.assertEqual(len(self.store.list_employees()), 1)

    def test_rejects_invalid_cpf_duplicate_and_invalid_money(self):
        self.employee()
        with self.assertRaisesRegex(ValidationError, 'CPF inválido'):
            self.store.save_employee({**EMPLOYEE, 'cpf': '11111111111'})
        with self.assertRaisesRegex(ValidationError, 'Já existe'):
            self.store.save_employee(EMPLOYEE)
        with self.assertRaisesRegex(ValidationError, 'centavos'):
            self.store.save_employee({**EMPLOYEE, 'salary_cents': 5.5})

    def test_generates_monthly_payslip_using_salary_and_recurring(self):
        employee = self.employee()
        self.store.add_recurring(employee['id'], {'kind': 'provento', 'description': 'Adicional fixo', 'amount_cents': 30000})
        self.store.add_recurring(employee['id'], {'kind': 'desconto', 'description': 'Vale transporte', 'amount_cents': 12000})
        slip = self.store.generate(employee['id'], '2026-11')
        self.assertEqual(slip['earnings_cents'], 315000)
        self.assertEqual(slip['deductions_cents'], 12000)
        self.assertEqual(slip['net_cents'], 303000)
        self.assertEqual(len(slip['items']), 3)

    def test_generated_document_keeps_employee_and_company_snapshots(self):
        employee = self.employee()
        slip = self.store.generate(employee['id'], '2026-11')
        self.store.save_employee({**EMPLOYEE, 'name': 'João Alterado', 'salary_cents': 500000}, employee['id'])
        self.store.save_company({'name': 'Empresa Alterada'})
        original = self.store.get_payslip(slip['id'])
        self.assertEqual(original['employee_snapshot']['name'], 'João Teste')
        self.assertEqual(original['company_snapshot']['name'], 'Empresa Teste LTDA')
        self.assertEqual(original['net_cents'], 285000)

    def test_batch_is_idempotent_and_ignores_inactive(self):
        active = self.employee()
        self.store.save_employee({**EMPLOYEE, 'cpf': '11144477735', 'name': 'Outro', 'active': False})
        first = self.store.generate_batch('2026-11')
        second = self.store.generate_batch('2026-11')
        self.assertEqual(first['count'], 1)
        self.assertEqual(second['count'], 1)
        self.assertEqual(first['documents'][0]['id'], second['documents'][0]['id'])
        self.assertEqual(first['documents'][0]['employee_id'], active['id'])

    def test_manual_adjustments_and_finalization_lock(self):
        employee = self.employee()
        slip = self.store.generate(employee['id'], '2026-11')
        slip = self.store.add_item(slip['id'], {'kind': 'desconto', 'description': 'Adiantamento', 'amount_cents': 10000})
        self.assertEqual(slip['net_cents'], 275000)
        item = [i for i in slip['items'] if i['origin'] == 'manual'][0]
        slip = self.store.delete_item(slip['id'], item['id'])
        self.assertEqual(slip['net_cents'], 285000)
        self.store.finalize(slip['id'])
        with self.assertRaisesRegex(ValidationError, 'finalizado'):
            self.store.add_item(slip['id'], {'kind': 'desconto', 'description': 'Novo', 'amount_cents': 100})
        with self.assertRaisesRegex(ValidationError, 'finalizado'):
            self.store.delete_item(slip['id'], slip['items'][0]['id'])

    def test_other_document_types_are_manual_not_automatic_clt_calculations(self):
        employee = self.employee()
        for kind in ('ferias', 'decimo', 'rescisao'):
            slip = self.store.generate(employee['id'], '2026-11', kind)
            self.assertEqual(slip['items'], [])
            self.assertEqual(slip['net_cents'], 0)

    def test_cannot_finalize_empty_or_negative_net_document(self):
        employee = self.employee()
        vacation = self.store.generate(employee['id'], '2026-11', 'ferias')
        with self.assertRaisesRegex(ValidationError, 'provento'):
            self.store.finalize(vacation['id'])
        monthly = self.store.generate(employee['id'], '2026-11')
        self.store.add_item(monthly['id'], {'kind': 'desconto', 'description': 'Desconto inválido', 'amount_cents': 300000})
        with self.assertRaisesRegex(ValidationError, 'negativo'):
            self.store.finalize(monthly['id'])

    def test_requires_company_and_rejects_bad_period(self):
        employee = self.employee()
        with self.assertRaises(ValidationError):
            self.store.generate(employee['id'], '2026-13')
        self.store.save_company({'name': 'Empresa'})
        with self.assertRaises(ValidationError):
            self.store.generate(employee['id'], '../2026')


if __name__ == '__main__':
    unittest.main()
