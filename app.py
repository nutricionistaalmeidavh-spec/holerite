"""Zero-dependency local HTTP application. Run: python app.py"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from models import Store, ValidationError

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
MAX_BODY = 100_000


class Handler(BaseHTTPRequestHandler):
    server_version = "HoleriteLocal/0.1"

    def log_message(self, fmt, *args):
        # Avoid writing CPF, PIS and employee details to the console log.
        logging.info("%s %s", self.address_string(), args[1] if len(args) > 1 else fmt)

    def _send(self, status, data, content_type="application/json; charset=utf-8"):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8") if content_type.startswith("application/json") else data
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        size = self.headers.get("Content-Length")
        if not size or not size.isdigit():
            raise ValidationError("Envie dados JSON válidos.")
        length = int(size)
        if length > MAX_BODY:
            raise RequestTooLarge()
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise ValidationError("Use Content-Type: application/json.")
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError) as exc:
            raise ValidationError("JSON inválido.") from exc
        if not isinstance(value, dict):
            raise ValidationError("O conteúdo deve ser um objeto JSON.")
        return value

    def _check_origin(self):
        host = self.headers.get("Host", "").split(":", 1)[0].lower()
        if host not in ("127.0.0.1", "localhost"):
            raise Forbidden()
        origin = self.headers.get("Origin")
        expected = f"http://{self.headers.get('Host', '')}"
        if origin and origin != expected:
            raise Forbidden()
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise Forbidden()

    def do_GET(self):
        try:
            self._check_origin()
            path = urlparse(self.path).path
            if path == "/api/company":
                return self._send(200, self.server.store.get_company())
            if path == "/api/employees":
                return self._send(200, self.server.store.list_employees())
            match = re.fullmatch(r"/api/employees/(\d+)", path)
            if match:
                return self._send(200, self.server.store.get_employee(int(match[1])))
            if path == "/api/payslips":
                from urllib.parse import parse_qs
                period = parse_qs(urlparse(self.path).query).get("period", [None])[0]
                return self._send(200, self.server.store.list_payslips(period))
            match = re.fullmatch(r"/api/payslips/(\d+)", path)
            if match:
                return self._send(200, self.server.store.get_payslip(int(match[1])))
            paths = {"/": ("index.html", "text/html; charset=utf-8"),
                     "/print": ("print.html", "text/html; charset=utf-8"),
                     "/static/app.js": ("app.js", "text/javascript; charset=utf-8"),
                     "/static/print.js": ("print.js", "text/javascript; charset=utf-8"),
                     "/static/print.css": ("print.css", "text/css; charset=utf-8"),
                     "/static/style.css": ("style.css", "text/css; charset=utf-8")}
            if path in paths:
                filename, content_type = paths[path]
                return self._send(200, (STATIC / filename).read_bytes(), content_type)
            return self._send(404, {"error": "Página não encontrada."})
        except Forbidden:
            return self._send(403, {"error": "Origem não autorizada."})
        except ValidationError as exc:
            return self._send(400, {"error": str(exc)})
        except Exception:
            logging.exception("Erro no GET")
            return self._send(500, {"error": "Erro interno."})

    def _change(self, method):
        try:
            self._check_origin()
            path = urlparse(self.path).path
            data = None if method == "DELETE" else self._body()
            s = self.server.store
            if method == "PUT" and path == "/api/company":
                return self._send(200, s.save_company(data))
            if method == "POST" and path == "/api/employees":
                return self._send(201, s.save_employee(data))
            match = re.fullmatch(r"/api/employees/(\d+)", path)
            if match and method == "PUT":
                return self._send(200, s.save_employee(data, int(match[1])))
            match = re.fullmatch(r"/api/employees/(\d+)/recurring", path)
            if match and method == "POST":
                return self._send(201, s.add_recurring(int(match[1]), data))
            match = re.fullmatch(r"/api/employees/(\d+)/recurring/(\d+)", path)
            if match and method == "DELETE":
                s.delete_recurring(int(match[1]), int(match[2]))
                return self._send(200, {"ok": True})
            if path == "/api/payslips" and method == "POST":
                if type(data.get("employee_id")) is not int or data["employee_id"] <= 0:
                    raise ValidationError("Selecione um funcionário.")
                return self._send(201, s.generate(data["employee_id"], data.get("period"), data.get("doc_type", "mensal")))
            if path == "/api/payslips/batch" and method == "POST":
                return self._send(200, s.generate_batch(data.get("period")))
            match = re.fullmatch(r"/api/payslips/(\d+)/items", path)
            if match and method == "POST":
                return self._send(201, s.add_item(int(match[1]), data))
            match = re.fullmatch(r"/api/payslips/(\d+)/items/(\d+)", path)
            if match and method == "DELETE":
                return self._send(200, s.delete_item(int(match[1]), int(match[2])))
            match = re.fullmatch(r"/api/payslips/(\d+)/finalize", path)
            if match and method == "POST":
                return self._send(200, s.finalize(int(match[1])))
            return self._send(404, {"error": "Operação não encontrada."})
        except Forbidden:
            return self._send(403, {"error": "Origem não autorizada."})
        except RequestTooLarge:
            return self._send(413, {"error": "Requisição muito grande."})
        except ValidationError as exc:
            return self._send(400, {"error": str(exc)})
        except Exception:
            logging.exception("Erro na operação")
            return self._send(500, {"error": "Erro interno."})

    def do_POST(self):
        return self._change("POST")

    def do_PUT(self):
        return self._change("PUT")

    def do_DELETE(self):
        return self._change("DELETE")


class Forbidden(Exception):
    pass


class RequestTooLarge(Exception):
    pass


def create_server(host="127.0.0.1", port=8765, db_path=None):
    path = db_path or Path(os.environ.get("HOLERITE_DB", str(ROOT / "data" / "holerite.sqlite3")))
    server = ThreadingHTTPServer((host, port), Handler)
    server.store = Store(path)
    return server


def main():
    parser = argparse.ArgumentParser(description="Holerite local — dados armazenados no computador")
    parser.add_argument("--host", default="127.0.0.1", help="Acesso local é o padrão. Não exponha em rede sem proxy e autenticação.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db", type=Path, default=None)
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    server = create_server(args.host, args.port, args.db)
    print(f"Holerite disponível em http://{args.host}:{server.server_port}")
    print("Dados locais: " + server.store.path)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
