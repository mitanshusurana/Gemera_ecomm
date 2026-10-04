#!/usr/bin/env bash
# Pushes this deploy/ tree and the env examples to a VM and (re)starts its stack.
# Run from the repository root on your machine:
#   deploy/deploy.sh core  opc@129.159.18.63 ~/.ssh/core.key
#   deploy/deploy.sh edge  opc@68.233.96.36  ~/.ssh/edge.key
# Add --bootstrap on the first run to prepare the VM (Docker, swap, firewall, env files).
# Existing .env* files on the VM are never overwritten.
set -euo pipefail

role="${1:?usage: deploy.sh core|edge user@host key [--bootstrap]}"
target="${2:?user@host}"
key="${3:?path to ssh key}"
bootstrap="${4:-}"
remote="~/caratloop"
ssh_opts=(-i "$key" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

echo "== copying deploy tree to $target:$remote"
ssh "${ssh_opts[@]}" "$target" "mkdir -p $remote/deploy/$role"
scp -q "${ssh_opts[@]}" .env.backend.example .env.frontend.example .env.erp.example "$target:$remote/"
scp -q "${ssh_opts[@]}" deploy/bootstrap.sh "$target:$remote/deploy/"
[[ "$role" == edge ]] && scp -q "${ssh_opts[@]}" scripts/erp-seed-first-company.sql "$target:$remote/"
scp -q "${ssh_opts[@]}" "deploy/$role/docker-compose.yml" "deploy/$role/Caddyfile" "deploy/$role/env.example" "$target:$remote/deploy/$role/"

if [[ "$bootstrap" == "--bootstrap" ]]; then
    echo "== bootstrapping ($role)"
    ssh -t "${ssh_opts[@]}" "$target" "bash $remote/deploy/bootstrap.sh $role"
fi

echo "== pulling images and starting the stack"
ssh "${ssh_opts[@]}" "$target" "cd $remote/deploy/$role && sudo docker compose pull -q && sudo docker compose up -d --remove-orphans && sudo docker compose ps"
