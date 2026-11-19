#!/bin/bash
# Removes every spike container. Leaves /home/valeri/qd-spike and the images in place.
docker ps -aq --filter label=qd-spike=1 | xargs -r docker rm -f
