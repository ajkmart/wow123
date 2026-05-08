{
  description = "Reproducible development shell for the mart workspace";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_20;
        pnpm = pkgs.pnpm_9;
        pm2  = pkgs.nodePackages.pm2;
      in {
        devShell = pkgs.mkShell {
          buildInputs = [
            node
            pnpm
            pm2
            pkgs.git
            pkgs.python311
            pkgs.openssh
            pkgs.postgresql_16
          ];

          shellHook = ''
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:${pnpm}/bin:$PATH"

            # ── 1. Root-directory guard ───────────────────────────────────────
            if [ ! -f "pnpm-workspace.yaml" ]; then
              echo "[nix] ERROR: Run nix develop from the workspace root." >&2
              return 1
            fi

            # ── 2. Environment detection ──────────────────────────────────────
            if [ -n "''${REPL_ID:-}" ] || [ -n "''${REPLIT_DEV_DOMAIN:-}" ]; then
              _ENV="replit"
            elif [ "''${CODESPACES:-}" = "true" ] || [ -n "''${CODESPACE_NAME:-}" ]; then
              _ENV="codespace"
            else
              _ENV="local"
            fi
            echo "[nix] Detected environment: $_ENV"

            # ── 3. pnpm setup ─────────────────────────────────────────────────
            mkdir -p "$PNPM_HOME"
            pnpm config set store-dir "$PNPM_HOME/store" 2>/dev/null || true

            # ── 4. Dependency install ─────────────────────────────────────────
            STAMP="node_modules/.nix-install-stamp"
            if [ ! -d "node_modules" ] || [ ! -f "$STAMP" ] || [ "pnpm-lock.yaml" -nt "$STAMP" ]; then
              echo "[nix] Running pnpm install..."
              pnpm install --no-frozen-lockfile && touch "$STAMP"
            else
              echo "[nix] node_modules up to date — skipping install"
            fi

            # ── 5. Env decrypt (no-op when .env already present) ──────────────
            if [ ! -s ".env" ] && [ -f ".env.enc" ]; then
              echo "[nix] .env.enc found but .env missing — run: pnpm run decrypt-env"
            fi

            # ── 6. DB check ───────────────────────────────────────────────────
            if [ -z "''${DATABASE_URL:-}" ]; then
              echo "[nix] WARN: DATABASE_URL is not set. Add it as a Replit Secret."
            fi

            # ── 7. Redis (optional) ───────────────────────────────────────────
            if [ -z "''${REDIS_URL:-}" ]; then
              echo "[nix] INFO: REDIS_URL not set — caching/queues disabled."
            fi

            # ── 8. WS proxy ───────────────────────────────────────────────────
            export VITE_API_PROXY_TARGET="''${VITE_API_PROXY_TARGET:-http://127.0.0.1:5000}"

            # ── 9. Security headers ───────────────────────────────────────────
            export NODE_OPTIONS="''${NODE_OPTIONS:---max-old-space-size=4096}"

            # ── 10. Prod build check ──────────────────────────────────────────
            if [ "''${NODE_ENV:-development}" = "production" ] && [ ! -d "artifacts/api-server/dist" ]; then
              echo "[nix] WARN: Production mode but no build found. Run: pnpm run build"
            fi

            # ── 11. Port config ───────────────────────────────────────────────
            export PORT="''${PORT:-5000}"

            # ── 12. Banner ────────────────────────────────────────────────────
            echo ""
            echo "╔══════════════════════════════════════════════╗"
            echo "║   AJKMart dev shell ready (Node $(node --version))   ║"
            echo "║   pnpm $(pnpm --version) · environment: $_ENV              ║"
            echo "╚══════════════════════════════════════════════╝"
            echo ""
          '';
        };
      });
}
