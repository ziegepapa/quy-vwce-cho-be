#!/usr/bin/env bash
set -euo pipefail

# Install two Europe/Berlin timers for the existing, idempotent GitHub Actions workflow.
# This script must be run on the trusted Ubuntu/VPS that will own the secret and timer.
if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this installer with sudo: sudo bash scripts/install-price-dispatch-timers.sh\n' >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "${SCRIPT_DIR}/.." rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" || ! -f "${REPO_ROOT}/scripts/dispatch-price-workflow.mjs" ]]; then
  printf 'Cannot locate scripts/dispatch-price-workflow.mjs in a Git checkout.\n' >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  printf 'Node.js is required; install Node.js 22+ on this runner first.\n' >&2
  exit 1
fi
NODE_VERSION="$("${NODE_BIN}" --version)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [[ ! "${NODE_MAJOR}" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 22 )); then
  printf 'Node.js 22+ is required; found %s.\n' "${NODE_VERSION}" >&2
  exit 1
fi

ENV_FILE="/etc/vwce-price-dispatch.env"
WRAPPER="/usr/local/bin/vwce-price-dispatch"
SERVICE="/etc/systemd/system/vwce-price-dispatch.service"
CATCHUP_TIMER="/etc/systemd/system/vwce-price-dispatch-catchup.timer"
CLOSE_TIMER="/etc/systemd/system/vwce-price-dispatch-after-close.timer"

# Token characters are restricted to the GitHub PAT alphabet, so the
# EnvironmentFile value can be parsed literally without shell evaluation.
if [[ -e "${ENV_FILE}" ]]; then
  if ! grep -Eq '^PRICE_WORKFLOW_DISPATCH_TOKEN=[A-Za-z0-9_]+$' "${ENV_FILE}"; then
    printf '%s exists but its token entry is invalid. Keep it private and repair it before reinstalling.\n' "${ENV_FILE}" >&2
    exit 1
  fi
  chown root:root "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  printf 'Keeping existing protected token file: %s\n' "${ENV_FILE}"
else
  printf 'Create a fine-grained GitHub token scoped ONLY to %s/%s with Actions: Read and write.\n' 'ziegepapa' 'quy-vwce-cho-be'
  printf 'This token is separate from PRICE_BOT_TOKEN and will not be stored in the repository.\n'
  read -r -s -p 'Paste the GitHub Actions-write token (input hidden): ' TOKEN
  printf '\n'
  if [[ -z "${TOKEN}" || ! "${TOKEN}" =~ ^[A-Za-z0-9_]+$ ]]; then
    unset TOKEN
    printf 'Token was empty or contained unsupported characters; no token file was created.\n' >&2
    exit 1
  fi
  install -o root -g root -m 600 /dev/null "${ENV_FILE}"
  printf 'PRICE_WORKFLOW_DISPATCH_TOKEN=%s\nPRICE_WORKFLOW_REF=main\n' "${TOKEN}" > "${ENV_FILE}"
  unset TOKEN
  chown root:root "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

# Confirm systemd understands both calendar expressions before enabling anything.
if ! command -v systemd-analyze >/dev/null 2>&1; then
  printf 'systemd-analyze is unavailable; install systemd tools and rerun.\n' >&2
  exit 1
fi
systemd-analyze calendar 'Mon..Sat *-*-* 08:25:00 Europe/Berlin' >/dev/null
systemd-analyze calendar 'Mon..Fri *-*-* 19:25:00 Europe/Berlin' >/dev/null

printf -v NODE_Q '%q' "${NODE_BIN}"
printf -v DISPATCHER_Q '%q' "${REPO_ROOT}/scripts/dispatch-price-workflow.mjs"
cat > "${WRAPPER}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec ${NODE_Q} ${DISPATCHER_Q}
EOF
chown root:root "${WRAPPER}"
chmod 755 "${WRAPPER}"

cat > "${SERVICE}" <<'EOF'
[Unit]
Description=Dispatch the VWCE Vault price workflow on GitHub Actions
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/vwce-price-dispatch.env
ExecStart=/usr/local/bin/vwce-price-dispatch
User=root
Group=root
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
EOF

cat > "${CATCHUP_TIMER}" <<'EOF'
[Unit]
Description=Morning catch-up dispatch for VWCE Vault prices

[Timer]
OnCalendar=Mon..Sat *-*-* 08:25:00 Europe/Berlin
Persistent=true
AccuracySec=1s
Unit=vwce-price-dispatch.service

[Install]
WantedBy=timers.target
EOF

cat > "${CLOSE_TIMER}" <<'EOF'
[Unit]
Description=After-Xetra-close dispatch for VWCE Vault prices

[Timer]
OnCalendar=Mon..Fri *-*-* 19:25:00 Europe/Berlin
Persistent=true
AccuracySec=1s
Unit=vwce-price-dispatch.service

[Install]
WantedBy=timers.target
EOF

chown root:root "${SERVICE}" "${CATCHUP_TIMER}" "${CLOSE_TIMER}"
chmod 644 "${SERVICE}" "${CATCHUP_TIMER}" "${CLOSE_TIMER}"
systemctl daemon-reload
systemctl enable --now vwce-price-dispatch-catchup.timer vwce-price-dispatch-after-close.timer

printf '\nExternal dispatch timers installed. No immediate workflow was launched.\n'
printf 'Next timer executions:\n'
systemctl list-timers --all 'vwce-price-dispatch-*' --no-pager
printf '\nFor a one-time manual test, run: sudo systemctl start vwce-price-dispatch.service\n'
printf 'To inspect service logs: sudo journalctl -u vwce-price-dispatch.service -n 80 --no-pager\n'
printf 'Secret file permissions: '
stat -c '%a %U:%G %n' "${ENV_FILE}"
