#!/bin/sh
set -eu
ssh-keygen -q -t ed25519 -N '' -f /etc/ssh/ssh_host_ed25519_key
install -d -m 700 -o astro-one -g astro-one /home/astro-one/.ssh
install -m 600 -o astro-one -g astro-one /fixture-key.pub /home/astro-one/.ssh/authorized_keys
install -d -m 700 -o astro-one -g astro-one /home/astro-one/workspace
exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
