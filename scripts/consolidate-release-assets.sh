#!/usr/bin/env bash
set -euo pipefail
: "$GH_TOKEN"
: "$GITHUB_REPOSITORY"

version="$(node -p "require('./package.json').version")"
tag="v$version"
setup="ArtiSys-Holerites-Setup-$version.exe"
releases="$(gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100")"
matches="$(jq -c --arg tag "$tag" '[.[] | select(.tag_name == $tag and .draft == false)]' <<< "$releases")"
count="$(jq 'length' <<< "$matches")"
if (( count < 2 )); then
  echo "Tag $tag: $count registro(s), sem duplicações."
  exit 0
fi
primary_id="$(jq -r --arg setup "$setup" '[.[] | select((([.assets[].name] | index($setup)) != null) and (([.assets[].name] | index("latest.yml")) != null))][0].id // empty' <<< "$matches")"
if [[ -z "$primary_id" ]]; then
  echo "::error::Não há release $tag com executável e latest.yml; não apagando nada."
  exit 1
fi
echo "Consolidando $tag no registro id=$primary_id"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
while IFS= read -r secondary_id; do
  [[ -n "$secondary_id" ]] || continue
  echo "Processando registro duplicado id=$secondary_id"
  secondary="$(jq -c --argjson id "$secondary_id" '.[] | select(.id == $id)' <<< "$matches")"
  while IFS= read -r asset; do
    [[ -n "$asset" ]] || continue
    name="$(jq -r '.name' <<< "$asset")"
    id="$(jq -r '.id' <<< "$asset")"
    size="$(jq -r '.size' <<< "$asset")"
    case "$name" in
      "$setup"|"$setup.blockmap"|"latest.yml") ;;
      *) echo "::error::Asset desconhecido $name; mantendo a duplicata."; exit 1 ;;
    esac
    if gh api "repos/$GITHUB_REPOSITORY/releases/$primary_id" --jq '.assets[].name' | grep -Fxq "$name"; then
      echo "$name já existe no registro principal."
      continue
    fi
    path="$tmp/$name"
    curl --fail --location --silent --show-error --retry 3 \
      -H "Accept: application/octet-stream" \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/releases/assets/$id" --output "$path"
    actual="$(wc -c < "$path" | tr -d '[:space:]')"
    if [[ "$actual" != "$size" ]]; then
      echo "::error::Download $name: $actual bytes, esperado $size. Preservando duplicata."
      exit 1
    fi
    curl --fail --silent --show-error --retry 3 --request POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      --data-binary "@$path" \
      "https://uploads.github.com/repos/$GITHUB_REPOSITORY/releases/$primary_id/assets?name=$name" \
      > "$tmp/upload-result.json"
    jq -e '.id and (.state == "uploaded")' "$tmp/upload-result.json" >/dev/null
    echo "Transferido $name ($actual bytes)."
  done < <(jq -c '.assets[]' <<< "$secondary")

  while IFS= read -r name; do
    gh api "repos/$GITHUB_REPOSITORY/releases/$primary_id" --jq '.assets[].name' |
      grep -Fxq "$name" || { echo "::error::Faltando $name no destino, preservando duplicata."; exit 1; }
  done < <(jq -r '.assets[].name' <<< "$secondary")

  gh api --method DELETE "repos/$GITHUB_REPOSITORY/releases/$secondary_id" >/dev/null
  echo "Registro duplicado $secondary_id excluído; tag preservada."
done < <(jq -r --argjson id "$primary_id" '.[] | select(.id != $id) | .id' <<< "$matches")

latest_id="$(gh api "repos/$GITHUB_REPOSITORY/releases/latest" --jq '.id')"
if [[ "$latest_id" != "$primary_id" ]]; then
  echo "::error::A release mais recente aponta para $latest_id (esperado $primary_id)."
  exit 1
fi
for name in "$setup" "$setup.blockmap" "latest.yml"; do
  gh api "repos/$GITHUB_REPOSITORY/releases/$primary_id" --jq '.assets[].name' |
    grep -Fxq "$name" || { echo "::error::Release sem $name."; exit 1; }
done
echo "OK: $tag é a release mais recente, com EXE, blockmap e latest.yml."
