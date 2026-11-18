#!/usr/bin/env sh
set -eu

fail() {
  printf '%s\n' "catalog schema interlock: $1" >&2
  exit 78
}

[ "$#" -ge 1 ] || fail "backend jar argument is required"
artifact=$1
shift
[ -r "$artifact" ] || fail "backend jar is not readable"

unzip_bin=${STORECORE_UNZIP_BIN:-unzip}
psql_bin=${STORECORE_PSQL_BIN:-psql}
java_bin=${STORECORE_JAVA_BIN:-java}

artifact_version=$(
  "$unzip_bin" -p "$artifact" BOOT-INF/classes/catalog-schema-compatibility-version.txt 2>/dev/null
) || fail "artifact has no catalog compatibility declaration"
case "$artifact_version" in
  ''|*[!0-9]*) fail "artifact compatibility declaration is invalid" ;;
esac

database_url=${STORECORE_DB_URL:-}
case "$database_url" in
  jdbc:postgresql://*) psql_url=${database_url#jdbc:} ;;
  *) fail "STORECORE_DB_URL must be a PostgreSQL JDBC URL" ;;
esac
[ -n "${STORECORE_DB_USERNAME:-}" ] || fail "STORECORE_DB_USERNAME is required"
[ -n "${STORECORE_DB_PASSWORD:-}" ] || fail "STORECORE_DB_PASSWORD is required"

for argument in "$@"; do
  case "$argument" in
    --spring.datasource.*|--spring.flyway.*|--spring.config.*|--spring.application.json*)
      fail "Spring datasource, Flyway and config overrides are not supported"
      ;;
  esac
done
[ -z "${SPRING_APPLICATION_JSON:-}" ] || fail "SPRING_APPLICATION_JSON is not supported"
[ -z "${JAVA_TOOL_OPTIONS:-}" ] || fail "JAVA_TOOL_OPTIONS is not supported"
[ -z "${JDK_JAVA_OPTIONS:-}" ] || fail "JDK_JAVA_OPTIONS is not supported"
[ -z "${_JAVA_OPTIONS:-}" ] || fail "_JAVA_OPTIONS is not supported"
unsafe_spring_environment=$(
  env | sed -n \
    -e 's/^\(SPRING_DATASOURCE_[^=]*\)=.*/\1/p' \
    -e 's/^\(SPRING_FLYWAY_[^=]*\)=.*/\1/p' \
    -e 's/^\(SPRING_CONFIG_[^=]*\)=.*/\1/p'
)
[ -z "$unsafe_spring_environment" ] ||
  fail "SPRING_DATASOURCE_*, SPRING_FLYWAY_* and SPRING_CONFIG_* overrides are not supported"

export SPRING_DATASOURCE_URL=$database_url
export SPRING_DATASOURCE_USERNAME=$STORECORE_DB_USERNAME
export SPRING_DATASOURCE_PASSWORD=$STORECORE_DB_PASSWORD
export SPRING_FLYWAY_ENABLED=true

export PGUSER=$STORECORE_DB_USERNAME
export PGPASSWORD=$STORECORE_DB_PASSWORD
database_version=$(
  "$psql_bin" "$psql_url" -X -A -t -v ON_ERROR_STOP=1 \
    -c "SELECT version::text FROM catalog_schema_compatibility_version WHERE singleton IS TRUE" 2>/dev/null
) || fail "database compatibility marker is unavailable"
case "$database_version" in
  ''|*[!0-9]*) fail "database compatibility marker is invalid" ;;
esac
[ "$database_version" = "$artifact_version" ] ||
  fail "artifact/database compatibility mismatch"

exec "$java_bin" -jar "$artifact" "$@"
