#!/usr/bin/env python3
"""
Email-triggered Claude Code runner.

Polls a dedicated Gmail inbox. When an email arrives FROM an allowed sender
whose SUBJECT contains the shared secret token, it runs Claude Code headlessly
in your project directory with the email body as the prompt, then emails you
back the full terminal output.

Stdlib only — no pip installs. Configure via a `.env` file next to this script
(copy config.example.env -> .env and fill it in).

┌─ SECURITY ─────────────────────────────────────────────────────────────────┐
│ This executes Claude Code with whatever CLAUDE_ARGS you set. With           │
│ --dangerously-skip-permissions it runs tools (edit files, run shell, push   │
│ git) WITHOUT asking. Anyone who can send mail from an allowed address AND    │
│ knows the secret token can run code on this Mac. Keep the token long and     │
│ secret, keep ALLOWED_SENDERS tight, and read the README before enabling it.  │
└────────────────────────────────────────────────────────────────────────────┘
"""
import email
import imaplib
import logging
import os
import re
import smtplib
import ssl
import subprocess
import sys
import time
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parseaddr

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env(path):
    """Minimal .env loader (KEY=VALUE lines), so we stay stdlib-only."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(os.path.join(HERE, ".env"))


def cfg(key, default=None, required=False):
    v = os.environ.get(key, default)
    if required and not v:
        sys.exit(f"Missing required config: {key} — set it in {HERE}/.env")
    return v


IMAP_HOST = cfg("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(cfg("IMAP_PORT", "993"))
SMTP_HOST = cfg("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(cfg("SMTP_PORT", "465"))
BOT_EMAIL = cfg("BOT_EMAIL", required=True)
BOT_APP_PASSWORD = cfg("BOT_APP_PASSWORD", required=True)
ALLOWED_SENDERS = [s.strip().lower() for s in cfg("ALLOWED_SENDERS", "", required=True).split(",") if s.strip()]
SECRET_TOKEN = cfg("SECRET_TOKEN", "")  # optional — blank means "sender allow-list only"
PROJECT_DIR = cfg("PROJECT_DIR", required=True)
CLAUDE_BIN = cfg("CLAUDE_BIN", "claude")
CLAUDE_ARGS = cfg("CLAUDE_ARGS", "")  # e.g. "--dangerously-skip-permissions"
# A file whose contents are appended to Claude's system prompt every run — used
# to grant the runner standing authorization so it ACTS (push/deploy/ssh) instead
# of replying to ask permission (which would cost Ajay another email). Passed as a
# single argv element, so unlike CLAUDE_ARGS it isn't whitespace-split. Relative
# paths resolve next to this script. Blank = don't append anything.
CLAUDE_SYSTEM_PROMPT_FILE = cfg("CLAUDE_SYSTEM_PROMPT_FILE", "")
# Resume a specific session each run so context carries over. Headless CAN'T use
# --teleport (that's interactive-only); --resume <id> + -p is the headless form.
# Blank = --continue (most recent session in PROJECT_DIR); "none" = fresh each run.
CLAUDE_SESSION = cfg("CLAUDE_SESSION", "")
POLL_INTERVAL = int(cfg("POLL_INTERVAL", "30"))
# Socket timeout for IMAP ops. Without this, imaplib blocks FOREVER on a silently
# half-dropped connection (Gmail/NAT closes the idle socket without a RST), so a
# select/search never returns, no exception is raised, and the reconnect loop
# below never fires — the runner just hangs (which is exactly what happened: it
# stopped processing mail while still "running"). With a timeout, a dead read
# raises socket.timeout (an OSError) and we reconnect.
IMAP_TIMEOUT = int(cfg("IMAP_TIMEOUT", "60"))
RUN_TIMEOUT = int(cfg("RUN_TIMEOUT", "1800"))
MAX_OUTPUT_CHARS = int(cfg("MAX_OUTPUT_CHARS", "12000"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(os.path.join(HERE, "runner.log")), logging.StreamHandler()],
)
log = logging.getLogger("claude-email-runner")


def decode_str(s):
    try:
        return str(make_header(decode_header(s or "")))
    except Exception:
        return s or ""


def get_body(msg):
    """Best-effort plain-text body extraction."""
    if msg.is_multipart():
        for part in msg.walk():
            disp = str(part.get("Content-Disposition") or "")
            if part.get_content_type() == "text/plain" and "attachment" not in disp:
                try:
                    return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
                except Exception:
                    continue
        return ""
    try:
        return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "replace")
    except Exception:
        return msg.get_payload() or ""


def save_images(msg, dest_dir):
    """Save image attachments/inline images to disk; return their paths."""
    if not msg.is_multipart():
        return []
    saved = []
    for part in msg.walk():
        if not (part.get_content_type() or "").startswith("image/"):
            continue
        data = part.get_payload(decode=True)
        if not data:
            continue
        name = os.path.basename(decode_str(part.get_filename() or "")) or \
            f"image_{len(saved) + 1}.{part.get_content_type().split('/')[-1]}"
        if not saved:
            os.makedirs(dest_dir, exist_ok=True)
        # Avoid clobbering when multiple attachments share a name (e.g. two
        # "image.png"): give each a unique path.
        path = os.path.join(dest_dir, name)
        if os.path.exists(path):
            base, ext = os.path.splitext(name)
            path = os.path.join(dest_dir, f"{base}_{len(saved) + 1}{ext}")
        with open(path, "wb") as f:
            f.write(data)
        saved.append(path)
    return saved


def run_claude(prompt):
    args = [CLAUDE_BIN]
    if CLAUDE_SESSION and CLAUDE_SESSION.lower() != "none":
        # --fork-session branches a COPY of the session, so it works even while
        # that session is live (e.g. running as a background agent) — each run
        # gets the full context without clashing with the original.
        args += ["--resume", CLAUDE_SESSION, "--fork-session"]
    elif not CLAUDE_SESSION:
        args += ["--continue"]
    args += ["-p"]
    if CLAUDE_ARGS:
        args += CLAUDE_ARGS.split()
    if CLAUDE_SYSTEM_PROMPT_FILE:
        sp = CLAUDE_SYSTEM_PROMPT_FILE
        if not os.path.isabs(sp):
            sp = os.path.join(HERE, sp)
        try:
            with open(sp) as f:
                text = f.read().strip()
            if text:
                # Read the file and pass its CONTENTS as one argv element, so the
                # whole multi-line prompt stays intact and we don't depend on the
                # CLI's --append-system-prompt-file variant existing.
                args += ["--append-system-prompt", text]
        except OSError as e:
            log.warning("CLAUDE_SYSTEM_PROMPT_FILE unreadable (%s): %s", sp, e)
    # "--" marks end-of-options so a prompt that starts with "-" (e.g. a
    # forwarded email body beginning "---------- Forwarded message ----------")
    # is taken as the prompt, not parsed as a CLI flag.
    args += ["--", prompt]
    log.info("Running claude … (cwd=%s, session=%s, timeout=%ss)",
             PROJECT_DIR, CLAUDE_SESSION or "continue", RUN_TIMEOUT)
    try:
        proc = subprocess.run(args, cwd=PROJECT_DIR, capture_output=True, text=True, timeout=RUN_TIMEOUT)
        out = proc.stdout or ""
        if proc.stderr:
            out += "\n[stderr]\n" + proc.stderr
        return proc.returncode, out
    except subprocess.TimeoutExpired:
        return 124, f"Timed out after {RUN_TIMEOUT}s."
    except FileNotFoundError:
        return 127, f"Claude binary not found: {CLAUDE_BIN}. Set CLAUDE_BIN to its full path (run `which claude`)."


def send_reply(to_addr, subject, body, in_reply_to=None):
    m = EmailMessage()
    m["From"] = BOT_EMAIL
    m["To"] = to_addr
    m["Subject"] = subject
    if in_reply_to:  # thread the reply under the original message
        m["In-Reply-To"] = in_reply_to
        m["References"] = in_reply_to
    m.set_content(body)
    ctx = ssl.create_default_context()
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx) as s:
            s.login(BOT_EMAIL, BOT_APP_PASSWORD)
            s.send_message(m)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls(context=ctx)
            s.login(BOT_EMAIL, BOT_APP_PASSWORD)
            s.send_message(m)


def process_once(imap):
    """Handle any unseen mail. Returns True if at least one message ran Claude
    (the caller reconnects afterward, since a long run leaves IMAP idle/dead)."""
    ran = False
    imap.select("INBOX")
    typ, data = imap.search(None, "UNSEEN")
    if typ != "OK":
        return ran
    for num in data[0].split():
        typ, msgdata = imap.fetch(num, "(RFC822)")
        if typ != "OK" or not msgdata or not msgdata[0]:
            continue
        msg = email.message_from_bytes(msgdata[0][1])
        _, from_addr = parseaddr(msg.get("From", ""))
        from_addr = from_addr.lower()
        # Long subjects arrive RFC-2822 "folded" (wrapped with CRLF + whitespace).
        # decode_str keeps those linebreaks, and echoing them into the reply's
        # Subject: header makes smtplib raise ("Header values may not contain
        # linefeed...") — the run completed but the reply silently never sent.
        subject = re.sub(r"[\r\n]+\s*", " ", decode_str(msg.get("Subject", ""))).strip()

        # Mark seen immediately so a failure never loops on the same message.
        imap.store(num, "+FLAGS", "\\Seen")

        # --- gates ---
        if from_addr not in ALLOWED_SENDERS:
            log.info("Ignore: sender not on allow-list (%s)", from_addr)
            continue
        if SECRET_TOKEN and SECRET_TOKEN not in subject:
            log.info("Ignore: subject missing token (from %s)", from_addr)
            continue

        body = get_body(msg).strip()
        subj_prompt = subject.replace(SECRET_TOKEN, "").strip() if SECRET_TOKEN else subject.strip()
        prompt = body or subj_prompt

        # Save any images and hand Claude their paths (it reads them via its file
        # tools — there's no headless image-attach flag).
        images = save_images(msg, os.path.join(HERE, "attachments", str(int(time.time()))))
        if images:
            prompt += "\n\nImages attached to this email — read them at these paths:\n" + "\n".join(images)
            log.info("Saved %d image(s): %s", len(images), ", ".join(images))

        if not prompt.strip():
            log.info("Ignore: empty prompt (from %s)", from_addr)
            continue

        log.info("RUN from %s | subject=%r", from_addr, subject)
        ran = True
        code, output = run_claude(prompt)
        if len(output) > MAX_OUTPUT_CHARS:
            output = "…(truncated to last %d chars)…\n%s" % (MAX_OUTPUT_CHARS, output[-MAX_OUTPUT_CHARS:])

        status = "OK" if code == 0 else f"FAILED (exit {code})"
        # Keep the subject identical (just "Re: …") so Gmail threads it — a
        # "[OK]" suffix changes the base subject and breaks threading. Status
        # goes in the body instead.
        reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        reply_body = (
            f"Request:\n{prompt}\n\n"
            f"{'=' * 48}\nResult: {status}\n{'=' * 48}\n\n{output or '(no output)'}"
        )
        try:
            send_reply(from_addr, reply_subject, reply_body, in_reply_to=msg.get("Message-ID"))
            log.info("Replied to %s (%s)", from_addr, status)
        except Exception as e:
            log.error("Reply failed: %s", e)
    return ran


def main():
    log.info("Starting | project=%s | allowed=%s | poll=%ss", PROJECT_DIR, ALLOWED_SENDERS, POLL_INTERVAL)
    while True:
        imap = None
        try:
            # timeout= makes every socket op (login/select/search/fetch) bounded,
            # so a dead connection raises instead of hanging the whole runner.
            imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=IMAP_TIMEOUT)
            imap.login(BOT_EMAIL, BOT_APP_PASSWORD)
            log.info("Connected to %s as %s", IMAP_HOST, BOT_EMAIL)
            while True:
                ran = process_once(imap)
                # A Claude run can take many minutes, during which the IMAP socket
                # sits idle and Gmail may drop it. Reconnect proactively after a run
                # so the next poll isn't a guaranteed timeout+reconnect stall.
                if ran:
                    break
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            log.info("Stopping.")
            return
        except (imaplib.IMAP4.abort, imaplib.IMAP4.error, OSError, ssl.SSLError) as e:
            log.warning("IMAP/connection error: %s — reconnecting in 15s", e)
            time.sleep(15)
        finally:
            if imap is not None:
                try:
                    imap.logout()
                except Exception:
                    pass


if __name__ == "__main__":
    main()
