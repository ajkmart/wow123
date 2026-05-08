{ pkgs ? import <nixpkgs> {} }:

let
  node = pkgs.nodejs-24_x;
  pnpm = pkgs.nodePackages.pnpm;
  corepack = pkgs.nodePackages.corepack;
  python = pkgs.python311;
  postgres = pkgs.postgresql_16;
  git = pkgs.git;
  openssh = pkgs.openssh;
in pkgs.mkShell {
  buildInputs = [ node pnpm corepack python postgres git openssh ];

  shellHook = ''
    export PATH=${pnpm}/bin:$PATH
    echo "Reproducible Nix shell ready."
    echo "Use: pnpm install && pnpm run all-start"
  '';
}
