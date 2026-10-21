"""Mock mínimo de Supabase para pruebas locales de Control Finance (puerto 8020)."""
import base64
import os
import hashlib
import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DB = {"users": {}, "profiles": {}, "transactions": {}, "sessions": {}}
LOG = os.environ.get("CF_MOCK_LOG", "/tmp/mock_supabase.log")


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def jwt(uid, email):
    now = int(time.time())
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({
        "sub": uid, "email": email, "role": "authenticated", "aud": "authenticated",
        "exp": now + 3600, "iat": now,
    }, separators=(",", ":")).encode())
    return f"{header}.{payload}.c2ln"


def session_for(user):
    return {
        "access_token": jwt(user["id"], user["email"]),
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": int(time.time()) + 3600,
        "refresh_token": "refresh-" + user["id"],
        "user": user,
    }


def public_user(uid, email, metadata):
    now = "2026-10-21T00:00:00Z"
    return {
        "id": uid, "aud": "authenticated", "role": "authenticated", "email": email,
        "email_confirmed_at": now, "phone": "", "confirmed_at": now,
        "last_sign_in_at": now, "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": metadata, "identities": [], "created_at": now,
        "updated_at": now, "is_anonymous": False,
    }


def log(line):
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def uid_from_auth(handler):
    header = handler.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header.split(" ", 1)[1]
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part)).get("sub")
    except Exception:
        return None


def filtered_transactions(uid, query):
    rows = [t for t in DB["transactions"].values() if t["user_id"] == uid]
    if query.get("id", [""])[0].startswith("eq."):
        target = query["id"][0][3:]
        rows = [t for t in rows if t["id"] == target]
    order = query.get("order", ["date.desc,created_at.desc"])[0]
    keys = [piece.split(".") for piece in order.split(",")]
    rows.sort(key=lambda t: t["date"], reverse=True)
    return rows


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        return

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers",
                         "authorization, apikey, content-type, prefer, accept, accept-profile, "
                         "content-profile, x-client-info, x-supabase-api-version, x-retry-count, "
                         "x-supabase-client-platform, x-supabase-client-platform-version, "
                         "x-supabase-client-runtime, x-supabase-client-runtime-version, range")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "content-range")

    def send_json(self, code, data=None):
        raw = b"" if data is None else json.dumps(data).encode()
        self.send_response(code)
        self.cors()
        if data is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if raw:
            self.wfile.write(raw)
        log(f"<- {code} {self.path}")

    def body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}")

    def wants_object(self):
        return "application/vnd.pgrst.object+json" in (self.headers.get("Accept") or "")

    def reply_rows(self, rows):
        if self.wants_object():
            if not rows:
                return self.send_json(406, {
                    "code": "PGRST116",
                    "details": "The result contains 0 rows",
                    "hint": None,
                    "message": "JSON object requested, multiple (or no) rows returned",
                })
            return self.send_json(200, rows[0])
        return self.send_json(200, rows)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        log(f"-> GET {self.path}")

        if parsed.path == "/debug/state":
            return self.send_json(200, DB)

        if parsed.path == "/auth/v1/settings":
            return self.send_json(200, {"external": {}, "disable_signup": False})
        if parsed.path == "/auth/v1/user":
            uid = uid_from_auth(self)
            user = DB["users"].get(uid)
            return self.send_json(200 if user else 401, user or {"msg": "Sin sesión"})

        uid = uid_from_auth(self)
        if not uid:
            return self.send_json(401, {"message": "No autorizado"})

        if parsed.path == "/rest/v1/profiles":
            rows = [p for p in DB["profiles"].values() if p["id"] == uid]
            return self.reply_rows(rows)

        if parsed.path == "/rest/v1/transactions":
            return self.reply_rows(filtered_transactions(uid, query))

        return self.send_json(404, {"message": "No encontrado"})

    def do_POST(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        path = parsed.path
        log(f"-> POST {self.path}")

        if path == "/auth/v1/signup":
            data = self.body()
            email = (data.get("email") or "").lower()
            password = data.get("password") or ""
            if email in {u["email"] for u in DB["users"].values()}:
                return self.send_json(400, {"code": 400, "msg": "User already registered",
                                            "error_code": "user_already_exists"})
            uid = str(uuid.uuid4())
            meta = data.get("data") or {}
            user = public_user(uid, email, meta)
            DB["users"][uid] = user
            DB["profiles"][uid] = {
                "id": uid,
                "name": meta.get("name") or email.split("@")[0],
                "goal": meta.get("goal") or 2000000,
                "quick_token_hash": None,
            }
            session = session_for(user)
            DB["sessions"][session["refresh_token"]] = uid
            log(f"USER {email} {uid}")
            return self.send_json(200, session)

        if path == "/auth/v1/token":
            grant = query.get("grant_type", [""])[0]
            data = self.body()
            if grant == "refresh_token":
                uid = DB["sessions"].get(data.get("refresh_token"))
                if not uid:
                    return self.send_json(400, {"error": "invalid_grant", "msg": "Invalid Refresh Token"})
                session = session_for(DB["users"][uid])
                DB["sessions"][session["refresh_token"]] = uid
                return self.send_json(200, session)
            email = (data.get("email") or "").lower()
            password = data.get("password") or ""
            user = next((u for u in DB["users"].values() if u["email"] == email), None)
            if not user or password != "secret123":
                return self.send_json(400, {"error": "invalid_grant",
                                            "error_description": "Invalid login credentials",
                                            "msg": "Invalid login credentials"})
            session = session_for(user)
            DB["sessions"][session["refresh_token"]] = user["id"]
            return self.send_json(200, session)

        if path == "/auth/v1/logout":
            return self.send_json(204)

        if path == "/auth/v1/recover":
            self.body()
            return self.send_json(200, {})

        uid = uid_from_auth(self)
        if not uid and path != "/rest/v1/rpc/cf_quick_add":
            return self.send_json(401, {"message": "No autorizado"})

        if path == "/rest/v1/rpc/cf_quick_add":
            data = self.body()
            token = data.get("p_token") or ""
            target = hashlib.sha256(token.encode()).hexdigest()
            owner = next((p["id"] for p in DB["profiles"].values()
                          if p.get("quick_token_hash") == target), None)
            if not owner:
                return self.send_json(400, {"code": "28000", "message": "Token inválido"})
            amount = float(data.get("p_amount") or 0)
            if amount <= 0:
                return self.send_json(400, {"code": "22023", "message": "Monto inválido"})
            txid = str(uuid.uuid4())
            DB["transactions"][txid] = {
                "id": txid, "user_id": owner,
                "type": data.get("p_type") or "expense",
                "amount": amount,
                "category": data.get("p_category") or "Otros",
                "note": data.get("p_note") or data.get("p_category") or "Movimiento",
                "date": data.get("p_date") or time.strftime("%Y-%m-%d"),
                "created_at": "2026-10-21T00:00:00Z",
            }
            return self.send_json(200, {"ok": True, "id": txid})

        if path == "/rest/v1/transactions":
            payload = self.body()
            rows = payload if isinstance(payload, list) else [payload]
            out = []
            for row in rows:
                txid = row.get("id") or str(uuid.uuid4())
                stored = {
                    "id": txid, "user_id": uid,
                    "type": row.get("type") or "expense",
                    "amount": row.get("amount") or 0,
                    "category": row.get("category") or "Otros",
                    "note": row.get("note") or "",
                    "date": row.get("date") or time.strftime("%Y-%m-%d"),
                    "created_at": row.get("created_at") or "2026-10-21T00:00:00Z",
                }
                DB["transactions"][txid] = stored
                out.append(stored)
            return self.reply_rows(out)

        if path == "/rest/v1/profiles":
            payload = self.body()
            prof = DB["profiles"].setdefault(uid, {"id": uid, "name": "David", "goal": 2000000,
                                                   "quick_token_hash": None})
            prof.update({k: v for k, v in payload.items() if k in ("name", "goal", "quick_token_hash")})
            return self.reply_rows([prof])

        return self.send_json(404, {"message": "No encontrado"})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        uid = uid_from_auth(self)
        log(f"-> PATCH {self.path}")
        if not uid:
            return self.send_json(401, {"message": "No autorizado"})
        if parsed.path == "/rest/v1/profiles":
            payload = self.body()
            prof = DB["profiles"].get(uid)
            if not prof:
                return self.send_json(404, {"message": "Sin perfil"})
            prof.update({k: v for k, v in payload.items() if k in ("name", "goal", "quick_token_hash")})
            return self.send_json(204)
        return self.send_json(404, {"message": "No encontrado"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        uid = uid_from_auth(self)
        log(f"-> DELETE {self.path}")
        if not uid:
            return self.send_json(401, {"message": "No autorizado"})
        if parsed.path == "/rest/v1/transactions":
            if query.get("id", [""])[0].startswith("eq."):
                target = query["id"][0][3:]
                DB["transactions"].pop(target, None)
            elif query.get("user_id", [""])[0].startswith("eq."):
                owner = query["user_id"][0][3:]
                for key in [k for k, v in DB["transactions"].items() if v["user_id"] == owner]:
                    DB["transactions"].pop(key, None)
            return self.send_json(204)
        return self.send_json(404, {"message": "No encontrado"})


if __name__ == "__main__":
    open(LOG, "w").close()
    ThreadingHTTPServer(("127.0.0.1", 8020), Handler).serve_forever()
