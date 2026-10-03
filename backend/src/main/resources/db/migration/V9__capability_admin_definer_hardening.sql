-- Forward-only repair: V3 is already published and its checksum must stay stable.
-- An explicit trailing pg_temp prevents temporary relations shadowing public tables.
ALTER FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR)
  SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)
  SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID)
  SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)
  SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID)
  SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)
  SET search_path=pg_catalog,public,pg_temp;

REVOKE ALL ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
