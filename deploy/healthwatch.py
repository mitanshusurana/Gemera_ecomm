#!/usr/bin/env python3
"""Cross-VM health check with e-mail alerts. Installed by bootstrap.sh as a
cron job every five minutes on BOTH VMs, so a frozen machine is reported by
the other one (the edge VM was down for most of a day in October 2026 and
nobody was told).

Reads ~/caratloop/alerts.env:
    ALERT_TO=owner@example.com          who gets the mail (comma separated)
    SMTP_HOST=smtp.gmail.com            same SMTP the store API uses
    SMTP_PORT=587
    SMTP_USER=shop@gmail.com
    SMTP_PASS=app-password
    SMTP_FROM=shop@gmail.com
    HEALTH_URLS=https://a/,https://b/  (optional; defaults to the four production hosts)

State lives in ~/caratloop/healthwatch.state (JSON): one alert when a URL
starts failing (after two consecutive failures, so a single slow response
does not page anyone) and one when it recovers. Exit code is always 0; the
log is ~/caratloop/healthwatch.log.
"""
from __future__ import annotations

import json
import os
import smtplib
import socket
import ssl
import sys
import time
import urllib.request
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

HOME = Path(os.path.expanduser("~")) / "caratloop"
ENV_FILE = HOME / "alerts.env"
STATE_FILE = HOME / "healthwatch.state"
LOG_FILE = HOME / "healthwatch.log"
DEFAULT_URLS = [
    "https://68-233-96-36.sslip.io/",
    "https://erp.68-233-96-36.sslip.io/",
    "https://api.129-159-18-63.sslip.io/actuator/health",
    "https://admin.129-159-18-63.sslip.io/",
]
FAILS_BEFORE_ALERT = 2
TIMEOUT_S = 20


def log(msg: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def read_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def check(url: str) -> tuple[bool, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "caratloop-healthwatch/1"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            code = resp.status
            ms = int((time.time() - t0) * 1000)
            return (200 <= code < 400), f"HTTP {code} in {ms} ms"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except (urllib.error.URLError, socket.timeout, ssl.SSLError, OSError) as e:
        return False, f"{e.__class__.__name__}: {getattr(e, 'reason', e)}"


def send_mail(env: dict, subject: str, body: str) -> bool:
    to = [a.strip() for a in env.get("ALERT_TO", "").split(",") if a.strip()]
    host, user, pw = env.get("SMTP_HOST"), env.get("SMTP_USER"), env.get("SMTP_PASS")
    if not (to and host and user and pw):
        log("alert not sent: alerts.env is incomplete (ALERT_TO, SMTP_HOST, SMTP_USER, SMTP_PASS)")
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = env.get("SMTP_FROM") or user
    msg["To"] = ", ".join(to)
    msg.set_content(body)
    try:
        port = int(env.get("SMTP_PORT") or 587)
        with smtplib.SMTP(host, port, timeout=30) as s:
            s.ehlo()
            if port != 465:
                s.starttls(context=ssl.create_default_context())
            s.login(user, pw)
            s.send_message(msg)
        return True
    except Exception as e:  # noqa: BLE001 - any mail failure is logged, never raised from cron
        log(f"alert mail failed: {e.__class__.__name__}: {e}")
        return False


def main() -> int:
    env = read_env(ENV_FILE)
    urls = [u.strip() for u in (env.get("HEALTH_URLS") or "").split(",") if u.strip()] or DEFAULT_URLS
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    except (OSError, ValueError):
        state = {}
    host = socket.gethostname()
    changed = False
    for url in urls:
        ok, detail = check(url)
        st = state.setdefault(url, {"fails": 0, "alerted": False})
        if ok:
            if st["alerted"]:
                send_mail(env, f"[Caratloop] RECOVERED: {url}", f"{url} is answering again ({detail}).\nChecked from {host} at {datetime.now():%Y-%m-%d %H:%M}.")
                log(f"RECOVERED {url} {detail}")
            st["fails"], st["alerted"] = 0, False
        else:
            st["fails"] += 1
            log(f"FAIL {url} {detail} (consecutive {st['fails']})")
            if st["fails"] >= FAILS_BEFORE_ALERT and not st["alerted"]:
                body = (f"{url} has failed {st['fails']} consecutive checks.\nLast result: {detail}\n"
                        f"Checked from {host} at {datetime.now():%Y-%m-%d %H:%M}.\n\n"
                        "If the whole VM is unresponsive (SSH hangs too), reboot it from the Oracle console: "
                        "Compute -> Instances -> the instance -> Reboot (or Stop / Start).")
                st["alerted"] = send_mail(env, f"[Caratloop] DOWN: {url}", body)
        changed = True
    if changed:
        try:
            STATE_FILE.write_text(json.dumps(state), encoding="utf-8")
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
