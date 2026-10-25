#!/bin/sh
# render.sh ALLOWLIST RESOLV_CONF OUTDIR -> OUTDIR/{domains,upstreams,dnsmasq.conf,ruleset.nft}
# Plain POSIX sh so it runs in the image without extra tooling. Any invalid
# input is an error (non-zero exit); the caller treats that as fatal.
set -eu
allowlist=$1 resolv=$2 out=$3

[ -r "$allowlist" ] || { echo "allowlist unreadable: $allowlist" >&2; exit 1; }

# Domains: strip comments and blanks, then require plain hostnames.
sed -e 's/#.*//' -e 's/[[:space:]]//g' -e '/^$/d' "$allowlist" >"$out/domains"
[ -s "$out/domains" ] || { echo "allowlist is empty" >&2; exit 1; }
re='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
if grep -qvE "$re" "$out/domains"; then
  echo "invalid domain in allowlist:" >&2
  grep -vE "$re" "$out/domains" >&2
  exit 1
fi

# Upstream resolvers: IPv4 nameservers from the Docker-provided resolv.conf.
sed -n 's/^nameserver[[:space:]]\{1,\}\([0-9][0-9.]*\)[[:space:]]*$/\1/p' "$resolv" | sort -u >"$out/upstreams"
[ -s "$out/upstreams" ] || { echo "no IPv4 nameserver in $resolv" >&2; exit 1; }
if grep -qvE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' "$out/upstreams"; then echo "bad nameserver" >&2; exit 1; fi

{
  echo "no-resolv"
  echo "no-hosts"
  echo "listen-address=127.0.0.1"
  echo "bind-interfaces"
  echo "user=root"
  echo "group=root"
  echo "cache-size=0"
  echo "filter-AAAA"
  while read -r d; do
    while read -r u; do echo "server=/$d/$u"; done <"$out/upstreams"
    echo "nftset=/$d/4#inet#egress#allow4"
  done <"$out/domains"
} >"$out/dnsmasq.conf"

ups=$(paste -sd, "$out/upstreams" | sed 's/,/, /g')
cat >"$out/ruleset.nft" <<NFT
flush ruleset
table inet egress {
  set allow4 {
    type ipv4_addr
    flags timeout
  }
  chain output {
    type filter hook output priority 0; policy drop;
    ct state established,related accept
    meta nfproto ipv6 reject
    # Only root (dnsmasq) may reach the upstream resolvers, including Docker's 127.0.0.11.
    ip daddr { $ups } meta skuid 0 meta l4proto { tcp, udp } th dport 53 accept
    ip daddr { $ups, 127.0.0.11 } drop
    oif lo accept
    ip daddr @allow4 tcp dport { 80, 443 } accept
  }
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    iif lo accept
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
}
NFT
