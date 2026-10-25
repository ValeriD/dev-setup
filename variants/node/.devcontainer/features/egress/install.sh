#!/bin/sh
# Nothing to install: the Dockerfile ships /usr/local/share/egress (Base material).
# This Feature exists to carry the root `entrypoint` into the image metadata.
set -eu
test -x /usr/local/share/egress/start.sh
