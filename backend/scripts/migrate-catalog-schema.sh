#!/usr/bin/env sh
set -eu

fail() {
  printf '%s\n' "catalog schema migration: $1" >&2
  exit 78
}

[ "$#" -eq 1 ] || fail "exactly one backend jar argument is required"
artifact=$1
[ -r "$artifact" ] || fail "backend jar is not readable"

unzip_bin=${STORECORE_UNZIP_BIN:-unzip}
java_bin=${STORECORE_JAVA_BIN:-java}

artifact_version=$(
  "$unzip_bin" -p "$artifact" BOOT-INF/classes/catalog-schema-compatibility-version.txt 2>/dev/null
) || fail "artifact has no catalog compatibility declaration"
case "$artifact_version" in
  ''|*[!0-9]*) fail "artifact compatibility declaration is invalid" ;;
esac

case "${STORECORE_DB_URL:-}" in
  jdbc:postgresql://*) ;;
  *) fail "STORECORE_DB_URL must be a PostgreSQL JDBC URL" ;;
esac
[ -n "${STORECORE_DB_USERNAME:-}" ] || fail "STORECORE_DB_USERNAME is required"
[ -n "${STORECORE_DB_PASSWORD:-}" ] || fail "STORECORE_DB_PASSWORD is required"
[ -z "${JAVA_TOOL_OPTIONS:-}" ] || fail "JAVA_TOOL_OPTIONS is not supported"
[ -z "${JDK_JAVA_OPTIONS:-}" ] || fail "JDK_JAVA_OPTIONS is not supported"
[ -z "${_JAVA_OPTIONS:-}" ] || fail "_JAVA_OPTIONS is not supported"

exec "$java_bin" \
  -Dloader.main=com.storecore.catalog.CatalogSchemaMigrationRunner \
  -cp "$artifact" \
  org.springframework.boot.loader.launch.PropertiesLauncher
