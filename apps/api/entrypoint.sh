#!/bin/sh
set -e

echo "Running database schema sync..."
/app/packages/db/node_modules/.bin/prisma db push \
  --schema=/app/packages/db/prisma/schema.prisma \
  --accept-data-loss

# Populate the Pulumi deps cache on first boot, after the volume is wiped,
# OR when the bundled package.json fingerprint changes (e.g. after a
# @pulumi/aws major bump). The renderer symlinks /pulumi-deps/node_modules
# into each deploy workdir, so a stale cache shows up as "Pulumi SDK has
# not been installed" or a provider version mismatch at deploy time.
PULUMI_DEPS_DIR="${PULUMI_BASE_DEPS_DIR:-/pulumi-deps}"
SRC_PKG="/app/apps/api/pulumi-deps-package.json"
DEST_PKG="${PULUMI_DEPS_DIR}/package.json"

NEEDS_BOOTSTRAP=0
if [ ! -d "${PULUMI_DEPS_DIR}/node_modules/@pulumi/pulumi" ]; then
  NEEDS_BOOTSTRAP=1
  echo "Pulumi deps missing — will bootstrap."
elif [ ! -f "${DEST_PKG}" ] || ! cmp -s "${SRC_PKG}" "${DEST_PKG}"; then
  NEEDS_BOOTSTRAP=1
  echo "Pulumi deps package.json changed — will re-bootstrap."
fi

if [ "${NEEDS_BOOTSTRAP}" = "1" ]; then
  echo "Bootstrapping Pulumi deps in ${PULUMI_DEPS_DIR}..."
  mkdir -p "${PULUMI_DEPS_DIR}"
  # Wipe node_modules so old @pulumi/aws v6 etc. don't shadow the new
  # install. Cheap — repopulated from registry in ~30s.
  rm -rf "${PULUMI_DEPS_DIR}/node_modules" "${PULUMI_DEPS_DIR}/package-lock.json"
  cp "${SRC_PKG}" "${DEST_PKG}"
  cd "${PULUMI_DEPS_DIR}"
  npm install --no-audit --no-fund --loglevel=error
  cd /app
  echo "Pulumi deps installed."
else
  echo "Pulumi deps cache present and up to date at ${PULUMI_DEPS_DIR}."
fi

echo "Starting API..."
exec node apps/api/dist/main.js
