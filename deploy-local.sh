#!/usr/bin/env bash
# Déploie ce dépôt vers l'extension GNOME installée.
#
# POURQUOI (2026-07-30) : il n'y avait aucun script de déploiement. La copie se
# faisait à la main, et les deux arbres ont divergé sans que ça se voie —
# ~180 lignes présentes uniquement dans l'installé, réparties sur 7 fichiers,
# dont tout le patch « invisible window ID » de moveSession.js. Le fork datait
# du 2026-04-12, l'installé du 2026-07-06. Une correction appliquée dans le
# dépôt puis déployée aurait détruit ce travail.
#
# Ce script rend le sens de la copie explicite et vérifiable :
#   DÉPÔT  ->  ~/.local/share/gnome-shell/extensions/<uuid>
# Il refuse de tourner si l'arbre git est sale (sinon on déploie un état qui
# n'existe nulle part) et sauvegarde l'installé avant d'écraser.
#
#   ./deploy-local.sh              déploie
#   ./deploy-local.sh --dry-run    montre ce qui changerait, ne touche à rien
#   ./deploy-local.sh --force      déploie malgré un arbre git sale
#
# Après déploiement : sous Wayland il faut un logout/login pour que GNOME Shell
# recharge l'extension (pas de Alt+F2 puis r, qui est X11 seulement).

set -euo pipefail

UUID=another-window-session-manager@gmail.com
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

dry_run=0; force=0
for a in "$@"; do
  case "$a" in
    --dry-run) dry_run=1 ;;
    --force)   force=1 ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

[ -f "$SRC/metadata.json" ] || { echo "metadata.json introuvable dans $SRC" >&2; exit 1; }

if [ "$dry_run" -eq 0 ] && [ "$force" -eq 0 ] && [ -n "$(git -C "$SRC" status --porcelain)" ]; then
  echo "Arbre git sale — commite d'abord, ou utilise --force :" >&2
  git -C "$SRC" status --short >&2
  exit 1
fi

# .git et .github n'ont rien à faire dans une extension installée ; le reste est
# copié à l'identique (--delete) pour que l'installé soit exactement le dépôt.
rsync_opts=(-a --delete --exclude='.git/' --exclude='.github/' --exclude='deploy-local.sh')

if [ "$dry_run" -eq 1 ]; then
  echo "--- simulation : $SRC -> $DEST"
  rsync "${rsync_opts[@]}" --dry-run --itemize-changes "$SRC/" "$DEST/"
  exit 0
fi

if [ -d "$DEST" ]; then
  backup="$HOME/awsm-backup-$(date +%Y%m%d-%H%M%S)"
  cp -a "$DEST" "$backup"
  echo "Sauvegarde de l'installé : $backup"
fi

mkdir -p "$DEST"
rsync "${rsync_opts[@]}" "$SRC/" "$DEST/"

# Les schémas sont versionnés compilés dans ce dépôt, mais on recompile pour
# éviter un gschemas.compiled périmé par rapport au .xml qui l'accompagne.
if [ -d "$DEST/schemas" ] && command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas "$DEST/schemas" && echo "Schémas recompilés."
fi

echo "Déployé : $SRC -> $DEST ($(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo 'sans git'))"
echo "Sous Wayland, un logout/login est nécessaire pour recharger l'extension."
