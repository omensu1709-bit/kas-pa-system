#!/usr/bin/env bash
# git_audit_push.sh — KAS V_APEX Phase 0 Dry-Run Audit
# Erstellt audit/phase-0-dry-run Branch, commitet alle relevanten Dateien, pusht.
set -euo pipefail

REPO_DIR="/data/trinity_apex/hunter/services"
REMOTE_NAME="${GIT_REMOTE_NAME:-origin}"
BRANCH_NAME="audit/phase-0-dry-run"
COMMIT_MSG="KAS V_APEX Phase 0 Dry-Run Audit — 2026-04-18

EU AI Act Compliance: ARCH STATE dokumentiert
Validation Gate: VALIDATED
- trinity_apex_main_mp.py (608L): p_m1 Cores 1-3, Numba AOT, 64B SHM
- round2-submissions.ts (218L): Runde 2 Submissions S4-gebrieft
- review-runner.ts (885L): resolveS4Rule, KAS-Score, ValidationGate
- KAS_APEX_ARCH_STATE.md: Vollständige System-Dokumentation

Kein Produktiv-Code. Nur Arch-Zustand und Dokumentation."

cd "$REPO_DIR"

echo "[AUDIT] Repo: $REPO_DIR"
echo "[AUDIT] Branch: $BRANCH_NAME"

# Prüfen ob Git initialisiert
if ! git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    echo "[AUDIT] Git nicht initialisiert — Initialisiere..."
    git -C "$REPO_DIR" init
    git -C "$REPO_DIR" config user.email "kas-apex-audit@trinity.local"
    git -C "$REPO_DIR" config user.name "KAS Agent"
fi

# Branch wechseln oder erstellen
if git -C "$REPO_DIR" rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "[AUDIT] Branch existiert — Auschecken..."
    git -C "$REPO_DIR" checkout "$BRANCH_NAME"
else
    echo "[AUDIT] Branch erstellen..."
    git -C "$REPO_DIR" checkout -b "$BRANCH_NAME"
fi

# Dateien staged
git -C "$REPO_DIR" add \
    trinity_apex_main_mp.py \
    round2-submissions.ts \
    review-runner.ts \
    KAS_APEX_ARCH_STATE.md \
    2>/dev/null || true

# Falls TypeScript-Dateien im paper-trading-Verzeichnis
TS_DIR="/data/trinity_apex/solana-stream/paper-trading/src/ground-truth"
if [ -d "$TS_DIR" ]; then
    git -C "$REPO_DIR" add \
        "$TS_DIR/round2-submissions.ts" \
        "$TS_DIR/review-runner.ts" \
        "$TS_DIR/review-types.ts" \
        "$TS_DIR/sample-submissions.ts" \
        "$TS_DIR/pilot-cases.ts" \
        2>/dev/null || true
fi

# Status anzeigen
echo ""
echo "[AUDIT] Git Status:"
git -C "$REPO_DIR" status --short
echo ""

# Prüfen ob etwas zu commiten
if git -C "$REPO_DIR" diff --staged --quiet; then
    echo "[AUDIT] Keine Änderungen zu commiten — nichts zu tun."
else
    # Commit
    git -C "$REPO_DIR" commit -m "$COMMIT_MSG"
    echo "[AUDIT] Commit erstellt: $(git -C "$REPO_DIR" rev-parse --short HEAD)"

    # Push (wenn Remote existiert)
    if git -C "$REPO_DIR" remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
        echo "[AUDIT] Push auf $REMOTE_NAME/$BRANCH_NAME..."
        git -C "$REPO_DIR" push -u "$REMOTE_NAME" "$BRANCH_NAME"
        echo "[AUDIT] ✓ Erfolgreich gepusht."
    else
        echo "[AUDIT] ⚠ Kein Remote '$REMOTE_NAME' konfiguriert — kein Push."
        echo "[AUDIT] Remote hinzufügen mit: git remote add origin <url>"
    fi
fi

echo ""
echo "[AUDIT] Fertig. Branch: $BRANCH_NAME"
echo "[AUDIT] AUDIT STATUS: PHASE 0 DRY-RUN — BEREIT FÜR NODE B VALIDIERUNG"
