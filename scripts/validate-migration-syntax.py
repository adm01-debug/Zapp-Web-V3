#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gate de sintaxis SQL real para migrations — cierra el buraco del smoke-test
(continue-on-error + exit 0 incondicional que tragan errores de sintaxis).

Usa pglast (parser real de PostgreSQL, mismo motor que libpg_query) para
validar 100% de los archivos de supabase/migrations/ SIN ejecutar nada (no
depende del efímero, no produce falsos positivos por dependencias de tablas).

Uso:
    python3 scripts/validate-migration-syntax.py [--dir supabase/migrations]
Exit: 0 = todo parsea · 1 = al menos 1 error de sintaxis (bloqueante)

Evidencia (2026-08-20): este gate detecta el bug que el CI dejó pasar
(PR #1330): CREATE TABLE con el cuerpo apagado -> "syntax error at or near
TABLE" mientras el smoke-test reportaba PASS en 13s.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from pglast import parse_sql
    from pglast.error import Error as PgError
except ImportError:
    # Auto-install resiliente (runners self-hosted podem não ter pglast/pip
    # global; falhou no vps-zapp5 2026-08-20 com exit 2 silencioso).
    print("ℹ️  pglast não encontrado — tentando instalar...")
    for cmd in (
        [sys.executable, "-m", "pip", "install", "--quiet", "--user", "pglast"],
        [sys.executable, "-m", "pip", "install", "--quiet", "pglast"],
        ["pip3", "install", "--quiet", "--user", "pglast"],
        ["pip", "install", "--quiet", "--user", "pglast"],
    ):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if r.returncode == 0:
                break
        except Exception:
            continue
    try:
        from pglast import parse_sql
        from pglast.error import Error as PgError
    except ImportError:
        print("❌ pglast não instalado. Instalar manualmente: pip install pglast")
        print("   (runner sem acesso a PyPI? pré-instalar na imagem do runner)")
        sys.exit(2)

DEFAULT_DIR = "supabase/migrations"
EXCLUDE = {"__tests__", "archive"}


def iter_sql_files(mig_dir):
    for p in sorted(Path(mig_dir).glob("*.sql")):
        yield p


def main():
    mig_dir = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--dir" else DEFAULT_DIR
    if not os.path.isdir(mig_dir):
        print(f"❌ directorio no encontrado: {mig_dir}")
        sys.exit(2)

    files = list(iter_sql_files(mig_dir))
    errors = []
    checked = 0
    for p in files:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            errors.append((p.name, f"lectura: {e}"))
            continue
        checked += 1
        try:
            parse_sql(text)
        except PgError as e:
            # extraer lineas de contexto del error para accion rapida
            msg = str(e)
            lnum = None
            m = re.search(r"at or near \"(.+)\"", msg)
            near = m.group(1) if m else "?"
            # intentar localizar la linea con el token
            for i, line in enumerate(text.splitlines(), 1):
                if near.split()[0] in line and "near" in msg:
                    lnum = i
                    break
            loc = f" línea {lnum}" if lnum else ""
            errors.append((str(p), f"PARSE-ERROR: {near}{loc} — {msg[:120]}"))
        except Exception as e:
            errors.append((str(p), f"EXC {type(e).__name__}: {e}"))

    print(f"SQL syntax gate: {checked} archivos validados con pglast (PostgreSQL real)")
    if errors:
        print(f"\n❌ {len(errors)} archivo(s) con error de sintaxis:\n")
        for fname, err in errors:
            print(f"   🔴 {os.path.basename(fname)} — {err}")
        print("\nBuraco que este gate cierra: el smoke-test de migrations tiene")
        print("continue-on-error + exit 0 incondicional (aplica solo el delta y")
        print("traga el error). Este gate parsea TODO sin ejecutar nada.")
        sys.exit(1)
    print("✅ 0 errores de sintaxis en todas las migrations.")
    sys.exit(0)


if __name__ == "__main__":
    main()