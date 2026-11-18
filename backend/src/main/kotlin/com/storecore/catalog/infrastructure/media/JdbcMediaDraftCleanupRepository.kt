package com.storecore.catalog.infrastructure.media

import com.storecore.catalog.application.media.MediaDraftCleanupRepository
import com.storecore.catalog.domain.media.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

/** Database-only maintenance. Never locks a product or a draft after locking an asset. */
class JdbcMediaDraftCleanupRepository(
    private val jdbc: JdbcTemplate,
    transactions: TransactionTemplate = TransactionTemplate(DataSourceTransactionManager(requireNotNull(jdbc.dataSource))),
) : MediaDraftCleanupRepository {
    private val required = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
    }

    override fun expireDrafts(batchSize: MediaCleanupBatchSize): Int = required.execute {
        jdbc.update(
            """WITH expired AS (
                 SELECT id FROM catalog_media_drafts
                 WHERE state='OPEN' AND expires_at<=clock_timestamp()
                 ORDER BY expires_at,id LIMIT ? FOR UPDATE SKIP LOCKED
               ) UPDATE catalog_media_drafts d SET state='EXPIRED'
                 FROM expired e WHERE d.id=e.id AND d.state='OPEN' AND d.expires_at<=clock_timestamp()""",
            batchSize.value,
        )
    }!!

    override fun enqueueOrphanDeletes(batchSize: MediaCleanupBatchSize): Int = required.execute {
        // The asset lock also serializes attachment, upload settlement and human deletion.
        val candidates = jdbc.queryForList(
            """SELECT a.id FROM media_assets a
               JOIN catalog_media_drafts d ON d.id=a.draft_id
               JOIN media_upload_commands c ON c.asset_id=a.id
               WHERE d.state IN ('CLAIMED','EXPIRED','ABANDONED')
                 AND a.state IN ('AWAITING_BYTES','STORED_PRIVATE','FAILED')
                 AND NOT EXISTS(SELECT 1 FROM product_images p WHERE p.media_asset_id=a.id)
                 AND NOT EXISTS(SELECT 1 FROM media_delete_commands q WHERE q.asset_id=a.id)
                 AND (c.state<>'CLAIMED' OR c.lease_until<=clock_timestamp())
               ORDER BY a.id LIMIT ? FOR UPDATE OF a SKIP LOCKED""",
            batchSize.value,
        )
        var enqueued = 0
        for (candidate in candidates) {
            val assetId = candidate["id"] as UUID
            val upload = jdbc.queryForList(
                "SELECT state,lease_until,clock_timestamp() checked_at FROM media_upload_commands WHERE asset_id=? FOR UPDATE",
                assetId,
            ).singleOrNull() ?: continue
            // Lock the existing queue last, even though normal candidates have none.
            if (jdbc.queryForList("SELECT asset_id FROM media_delete_commands WHERE asset_id=? FOR UPDATE", assetId).isNotEmpty()) continue
            val asset = jdbc.queryForMap(
                """SELECT a.state,d.state draft_state,
                     EXISTS(SELECT 1 FROM product_images p WHERE p.media_asset_id=a.id) referenced
                   FROM media_assets a JOIN catalog_media_drafts d ON d.id=a.draft_id WHERE a.id=?""",
                assetId,
            )
            val state = MediaAssetState.fromWire(asset["state"] as? String)
            val commandState = MediaCommandState.fromWire(upload["state"] as? String)
            if (!CatalogMediaDraftState.fromWire(asset["draft_state"] as? String).permitsOrphanCleanup ||
                asset["referenced"] == true ||
                state !in setOf(MediaAssetState.AWAITING_BYTES, MediaAssetState.STORED_PRIVATE, MediaAssetState.FAILED) ||
                commandState == MediaCommandState.UNKNOWN ||
                (commandState == MediaCommandState.CLAIMED &&
                    (upload["lease_until"] as java.sql.Timestamp).toInstant() > (upload["checked_at"] as java.sql.Timestamp).toInstant())
            ) continue
            if (commandState == MediaCommandState.CLAIMED || commandState == MediaCommandState.AWAITING_BYTES) {
                check(jdbc.update(
                    """UPDATE media_upload_commands SET state='DELETE_PENDING',lease_owner=NULL,lease_until=NULL,
                         outcome=NULL,result=NULL,fence_version=fence_version+1,updated_at=clock_timestamp()
                       WHERE asset_id=? AND state IN ('CLAIMED','AWAITING_BYTES')""",
                    assetId,
                ) == 1) { "media orphan upload fencing transition lost" }
            }
            check(jdbc.update(
                """UPDATE media_assets SET state='DELETE_PENDING',failure_code='NONE',
                     delete_requested_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=?""",
                assetId,
            ) == 1) { "media orphan asset transition lost" }
            check(jdbc.update(
                "INSERT INTO media_delete_commands(asset_id,purpose,available_at) VALUES (?,?,clock_timestamp())",
                assetId, MediaDeletePurpose.ORPHAN_GC.wire,
            ) == 1) { "media orphan delete registration lost" }
            enqueued++
        }
        enqueued
    }!!
}
