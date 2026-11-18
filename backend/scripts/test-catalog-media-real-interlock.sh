#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "real catalog media interlock: $1" >&2
  exit 1
}

[ "$#" -eq 1 ] || fail "base commit is required"
base_sha=$1
case "$base_sha" in
  ''|0000000000000000000000000000000000000000) fail "base commit is invalid" ;;
esac

git cat-file -e "${base_sha}^{commit}" 2>/dev/null || git fetch --no-tags --depth=1 origin "$base_sha"
previous_checkout=$(mktemp -d "${RUNNER_TEMP:-/tmp}/storecore-media-previous.XXXXXX")
cleanup() {
  git worktree remove --force "$previous_checkout" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
git worktree add --detach "$previous_checkout" "$base_sha"

mvn -B -q -DskipTests package -f "$previous_checkout/backend/pom.xml"
mvn -B -q -DskipTests package -f backend/pom.xml
previous_jar=$(find "$previous_checkout/backend/target" -maxdepth 1 -type f -name '*.jar' ! -name '*.original' -print -quit)
current_jar=$(find backend/target -maxdepth 1 -type f -name '*.jar' ! -name '*.original' -print -quit)
[ -n "$previous_jar" ] && [ -r "$previous_jar" ] || fail "previous real artifact was not built"
[ -n "$current_jar" ] && [ -r "$current_jar" ] || fail "current real artifact was not built"
previous_version=$(unzip -p "$previous_jar" BOOT-INF/classes/catalog-schema-compatibility-version.txt)
current_version=$(unzip -p "$current_jar" BOOT-INF/classes/catalog-schema-compatibility-version.txt)
if [ "$previous_version" = "$current_version" ]; then
  printf '%s\n' "real catalog media interlock skipped: no schema compatibility transition"
  exit 0
fi
[ "$previous_version" = "2" ] && [ "$current_version" = "3" ] ||
  fail "unexpected compatibility transition $previous_version -> $current_version"

export STORECORE_DB_URL=${STORECORE_DB_URL:-jdbc:postgresql://127.0.0.1:5434/storecore}
export STORECORE_DB_USERNAME=${STORECORE_DB_USERNAME:-storecore}
export STORECORE_DB_PASSWORD=${STORECORE_DB_PASSWORD:-storecore}
psql_url=${STORECORE_PSQL_URL:-postgresql://storecore:storecore@127.0.0.1:5434/storecore}

sh backend/scripts/migrate-catalog-schema.sh "$current_jar"
psql "$psql_url" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO users(email,password_hash,first_name,last_name)
VALUES ('media-interlock@example.test','$2a$10$01234567890123456789012345678901234567890123456789012','Media','Interlock');
INSERT INTO products(name,slug,base_price,status) VALUES ('Media interlock','media-interlock',100,'ACTIVE');
INSERT INTO catalog_media_drafts(id,owner_user_id,target_product_id,expires_at)
VALUES ('10000000-0000-4000-8000-000000000001',1,1,clock_timestamp()+interval '1 hour');
INSERT INTO media_assets(id,draft_id,owner_user_id,upload_id,original_sha256,normalized_sha256,format,width,height,normalized_size,state,provider_kind,provider_key,created_by)
VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,
        '30000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),'WEBP',800,600,1024,
        'STORED_PRIVATE','TEST_STUB','catalog/interlock/object',1);
INSERT INTO product_images(product_id,url,sort_order,is_primary,media_asset_id,source_kind,alt_text)
VALUES (1,NULL,0,true,'20000000-0000-4000-8000-000000000001','MANAGED','Media administrada');
SQL

snapshot_sql="SELECT md5(string_agg(concat_ws('|',id::text,product_id::text,coalesce(url,''),coalesce(media_asset_id::text,''),source_kind,sort_order::text,is_primary::text,alt_text),E'\\n' ORDER BY id)) FROM product_images"
before=$(psql "$psql_url" -X -A -t -v ON_ERROR_STOP=1 -c "$snapshot_sql")
set +e
output=$(sh backend/scripts/run-with-catalog-schema-interlock.sh "$previous_jar" --server.port=0 2>&1)
status=$?
set -e
[ "$status" -eq 78 ] || fail "previous artifact was not denied (exit $status): $output"
printf '%s' "$output" | grep -F "artifact/database compatibility mismatch" >/dev/null ||
  fail "previous artifact denial reason was not the compatibility marker"
after=$(psql "$psql_url" -X -A -t -v ON_ERROR_STOP=1 -c "$snapshot_sql")
[ -n "$before" ] && [ "$before" = "$after" ] || fail "managed gallery changed during denied startup"
printf '%s\n' "real catalog media interlock passed for $base_sha"
