{ pkgs }: {
  deps = [
    pkgs.pkg-config
    pkgs.nodejs_20
    pkgs.nodePackages.pnpm
    pkgs.psmisc
    pkgs.git
  ];
}