#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this uninstaller with sudo: sudo bash scripts/uninstall-price-dispatch-timers.sh\n' >&2
  exit 1
fi

systemctl disable --now vwce-price-dispatch-catchup.timer vwce-price-dispatch-after-close.timer 2>/dev/null || true
rm -f \
  /etc/systemd/system/vwce-price-dispatch-catchup.timer \
  /etc/systemd/system/vwce-price-dispatch-after-close.timer \
  /etc/systemd/system/vwce-price-dispatch.service \
  /usr/local/bin/vwce-price-dispatch
systemctl daemon-reload
systemctl reset-failed vwce-price-dispatch.service 2>/dev/null || true

if [[ "${1:-}" == "--remove-token" ]]; then
  rm -f /etc/vwce-price-dispatch.env
  printf 'Timers, wrapper, service, and protected token file removed.\n'
else
  printf 'Timers, wrapper, and service removed. Protected token file was kept at /etc/vwce-price-dispatch.env.\n'
  printf 'To remove the token too, rerun with: sudo bash scripts/uninstall-price-dispatch-timers.sh --remove-token\n'
fi
