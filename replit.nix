{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.pnpm
    pkgs.psmisc
    pkgs.python311
    pkgs.postgresql_16
    pkgs.git
    pkgs.openssh
    pkgs.lsof
    pkgs.libuuid
  ];
}