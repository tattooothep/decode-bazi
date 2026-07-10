#!/bin/sh
set -eu

EXT_IF="${HOURKEY_EXTERNAL_INTERFACE:-eth0}"
PORTS="9000,9001"

apply_rule() {
  firewall="$1"
  command -v "$firewall" >/dev/null 2>&1 || return 0
  "$firewall" -nL DOCKER-USER >/dev/null 2>&1 || return 0
  if ! "$firewall" -C DOCKER-USER -i "$EXT_IF" -p tcp -m multiport --dports "$PORTS" -j DROP 2>/dev/null; then
    "$firewall" -I DOCKER-USER 1 -i "$EXT_IF" -p tcp -m multiport --dports "$PORTS" -j DROP
  fi
}

apply_rule iptables
apply_rule ip6tables
