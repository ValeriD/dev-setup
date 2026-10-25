#!/bin/sh
# selftest.sh DNSMASQ_PID: prove the firewall is closed, not merely loaded.
# Runs as root through the local resolver; any failed check exits non-zero.
set -eu
pid=$1

kill -0 "$pid" || { echo "dnsmasq is not running" >&2; exit 1; }

first=$(sed -n '1p' /run/egress/domains)
ok=
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if getent ahostsv4 "$first" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
[ -n "$ok" ] || { echo "allowlisted name $first does not resolve" >&2; exit 1; }

if getent ahostsv4 not-allowlisted.example.com >/dev/null 2>&1; then
  echo "non-allowlisted name resolves" >&2
  exit 1
fi

# Behavioural checks over the wire (node is in the image).
exec node -e '
const net = require("node:net");
const https = require("node:https");
const tryConnect = (host, port) => new Promise((res) => {
  const s = net.connect({ host, port, timeout: 3000 });
  s.on("connect", () => { s.destroy(); res(true); });
  s.on("timeout", () => { s.destroy(); res(false); });
  s.on("error", () => res(false));
});
(async () => {
  if (await tryConnect("1.1.1.1", 443)) throw new Error("direct IP egress is open");
  if (await tryConnect("2606:4700:4700::1111", 443)) throw new Error("IPv6 egress is open");
  await new Promise((res, rej) =>
    https.get({ host: process.argv[1], path: "/", timeout: 8000 }, (r) => { r.resume(); res(); })
      .on("error", rej).on("timeout", () => rej(new Error("allowlisted host unreachable"))));
})().catch((e) => { console.error(e.message); process.exit(1); });
' "$first"
