import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from app import create_server


class APITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.server = create_server('127.0.0.1', 0, Path(self.temp.name) / 'api.db')
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, data=None, headers=None):
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        h = {'Content-Type': 'application/json', **(headers or {})}
        c.request(method, path, body=json.dumps(data).encode() if data is not None else None, headers=h)
        result = c.getresponse()
        body = result.read().decode()
        status = result.status
        c.close()
        try:
            return status, json.loads(body)
        except json.JSONDecodeError:
            return status, body

    def test_api_employee_company_and_document_flow(self):
        status, company = self.request('PUT', '/api/company', {'name': 'Oficina Brasil'})
        self.assertEqual(status, 200)
        self.assertEqual(company['name'], 'Oficina Brasil')
        status, employee = self.request('POST', '/api/employees', {
            'name': 'Maria', 'cpf': '52998224725', 'job_title': 'Auxiliar',
            'admission_date': '2024-01-10', 'salary_cents': 190000,
        })
        self.assertEqual(status, 201)
        status, employees = self.request('GET', '/api/employees')
        self.assertEqual(status, 200)
        self.assertEqual(len(employees), 1)
        status, generated = self.request('POST', '/api/payslips/batch', {'period': '2026-11'})
        self.assertEqual(status, 200)
        self.assertEqual(generated['count'], 1)
        id = generated['documents'][0]['id']
        status, slip = self.request('GET', f'/api/payslips/{id}')
        self.assertEqual(slip['net_cents'], 190000)
        status, slip = self.request('POST', f'/api/payslips/{id}/finalize', {})
        self.assertEqual(slip['status'], 'finalizado')

    def test_rejects_cross_origin_writes(self):
        status, data = self.request('PUT', '/api/company', {'name': 'X'}, {'Origin': 'https://malicious.example'})
        self.assertEqual(status, 403)

    def test_rejects_dns_rebinding_host(self):
        status, _ = self.request('GET', '/api/employees', headers={'Host':'evil.example'})
        self.assertEqual(status, 403)
        status, _ = self.request('PUT', '/api/company', {'name':'Bad'}, {'Host':'evil.example', 'Origin':'http://evil.example'})
        self.assertEqual(status, 403)

    def test_rejects_large_payload_and_invalid_routes(self):
        status, error = self.request('POST', '/api/employees', {'name': 'a' * 200_000})
        self.assertEqual(status, 413)
        status, error = self.request('GET', '/api/does-not-exist')
        self.assertEqual(status, 404)

    def test_home_and_print_are_available(self):
        for path in ('/', '/print', '/static/app.js', '/static/style.css', '/static/print.css', '/static/print.js'):
            status, _ = self.request('GET', path)
            self.assertEqual(status, 200, path)


if __name__ == '__main__':
    unittest.main()
