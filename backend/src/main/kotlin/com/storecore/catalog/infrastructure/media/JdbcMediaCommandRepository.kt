package com.storecore.catalog.infrastructure.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Short database transactions only. Object-store I/O belongs to application workers. */
class JdbcMediaCommandRepository(
    private val jdbc: JdbcTemplate,
    transactions: TransactionTemplate = TransactionTemplate(DataSourceTransactionManager(requireNotNull(jdbc.dataSource))),
) : MediaCommandRepository {
    private val required = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
    }
    private val isolated = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    override fun registerDraft(command: MediaDraftRegistration): MediaDraftRegistrationResult = required.execute {
        if (jdbc.queryForObject("SELECT catalog_media_owner_exists(?)", Boolean::class.java, command.ownerId.value) != true)
            return@execute MediaDraftRegistrationResult.OwnerMissing
        val inserted = jdbc.update(
            """INSERT INTO catalog_media_drafts(id,owner_user_id,target_product_id,expires_at)
               VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING""",
            command.draftId.value, command.ownerId.value, command.targetProductId?.value, Timestamp.from(command.expiresAt),
        )
        if (inserted == 1) return@execute MediaDraftRegistrationResult.Created
        val row = jdbc.queryForList("SELECT owner_user_id,target_product_id,state FROM catalog_media_drafts WHERE id=? FOR UPDATE", command.draftId.value).single()
        if ((row["owner_user_id"] as Number).toLong() == command.ownerId.value &&
            (row["target_product_id"] as? Number)?.toLong() == command.targetProductId?.value &&
            CatalogMediaDraftState.fromWire(row["state"] as? String) == CatalogMediaDraftState.OPEN
        ) MediaDraftRegistrationResult.Replay else MediaDraftRegistrationResult.Conflict
    }!!

    override fun registerUpload(command: MediaUploadRegistration): MediaUploadRegistrationResult = required.execute {
        if (command.format == MediaFormat.UNKNOWN) return@execute MediaUploadRegistrationResult.Conflict
        val draft = jdbc.queryForList(
            "SELECT owner_user_id,target_product_id,state,expires_at,clock_timestamp() checked_at FROM catalog_media_drafts WHERE id=? FOR UPDATE",
            command.draftId.value,
        ).singleOrNull() ?: return@execute MediaUploadRegistrationResult.ScopeDenied
        if ((draft["owner_user_id"] as Number).toLong() != command.ownerId.value ||
            (draft["target_product_id"] as? Number)?.toLong() != command.targetProductId?.value
        ) return@execute MediaUploadRegistrationResult.ScopeDenied
        if (CatalogMediaDraftState.fromWire(draft["state"] as? String) != CatalogMediaDraftState.OPEN ||
            draft.instant("expires_at") <= draft.instant("checked_at")
        ) return@execute MediaUploadRegistrationResult.DraftClosed

        val existing = uploadRow(command.draftId, command.uploadId, forUpdate = true)
        if (existing != null) {
            val exact = (existing["owner_user_id"] as Number).toLong() == command.ownerId.value &&
                existing["original_hash"] == command.requestHash.value &&
                existing["original_sha256"] == command.originalDigest.value &&
                existing["normalized_hash"] == command.normalizedDigest.value &&
                MediaFormat.fromWire(existing["format"] as? String) == command.format &&
                (existing["width"] as Number).toInt() == command.dimensions.width &&
                (existing["height"] as Number).toInt() == command.dimensions.height &&
                (existing["normalized_size"] as Number).toLong() == command.normalizedSize.value
            return@execute if (exact) MediaUploadRegistrationResult.Replay(mapSnapshot(existing)) else MediaUploadRegistrationResult.Conflict
        }
        jdbc.update(
            """INSERT INTO media_assets(id,draft_id,owner_user_id,upload_id,original_sha256,normalized_sha256,
                   format,width,height,normalized_size,created_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            command.assetId.value, command.draftId.value, command.ownerId.value, command.uploadId.value,
            command.originalDigest.value, command.normalizedDigest.value, command.format.wire,
            command.dimensions.width, command.dimensions.height, command.normalizedSize.value, command.ownerId.value,
        )
        jdbc.update(
            """INSERT INTO media_upload_commands(draft_id,owner_user_id,upload_id,original_hash,normalized_hash,
                   asset_id,deterministic_key) VALUES (?,?,?,?,?,?,?)""",
            command.draftId.value, command.ownerId.value, command.uploadId.value, command.requestHash.value,
            command.normalizedDigest.value, command.assetId.value, command.deterministicKey.value,
        )
        MediaUploadRegistrationResult.Created(mapSnapshot(requireNotNull(uploadRow(command.draftId, command.uploadId, forUpdate = false))))
    }!!

    override fun findUpload(ownerId: MediaOwnerId, draftId: CatalogMediaDraftId, uploadId: UploadId): MediaUploadSnapshot? =
        uploadRow(draftId, uploadId, forUpdate = false)?.takeIf { (it["owner_user_id"] as Number).toLong() == ownerId.value }?.let(::mapSnapshot)

    override fun claimUpload(
        ownerId: MediaOwnerId,
        draftId: CatalogMediaDraftId,
        uploadId: UploadId,
        leaseOwner: UUID,
        now: Instant,
        duration: Duration,
    ): MediaUploadClaimResult = isolated.execute {
        require(!duration.isNegative && !duration.isZero)
        // Match composition's draft -> asset -> upload order. Expiry closes new work,
        // while an existing live claimant may settle until cleanup fences its lease.
        val draft = jdbc.queryForList(
            "SELECT owner_user_id,state,expires_at FROM catalog_media_drafts WHERE id=? FOR UPDATE",
            draftId.value,
        ).singleOrNull() ?: return@execute MediaUploadClaimResult.Missing
        if ((draft["owner_user_id"] as Number).toLong() != ownerId.value) return@execute MediaUploadClaimResult.ScopeDenied
        if (CatalogMediaDraftState.fromWire(draft["state"] as? String) != CatalogMediaDraftState.OPEN)
            return@execute MediaUploadClaimResult.Busy
        val row = uploadRow(draftId, uploadId, forUpdate = true) ?: return@execute MediaUploadClaimResult.Missing
        // Any of the draft, asset or upload locks can have waited past expiry.
        val draftCheckedAt = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
        if (draft.instant("expires_at") <= draftCheckedAt) return@execute MediaUploadClaimResult.Busy
        if ((row["owner_user_id"] as Number).toLong() != ownerId.value) return@execute MediaUploadClaimResult.ScopeDenied
        val state = MediaCommandState.fromWire(row["command_state"] as? String)
        if (state == MediaCommandState.COMPLETED && MediaAssetState.fromWire(row["asset_state"] as? String) == MediaAssetState.STORED_PRIVATE)
            return@execute MediaUploadClaimResult.AlreadyStored(mapSnapshot(row))
        val checkedAt = databaseNow(now)
        val leaseExpired = row["lease_until"]?.let { (it as Timestamp).toInstant() <= checkedAt } ?: false
        if (state != MediaCommandState.AWAITING_BYTES && !(state == MediaCommandState.CLAIMED && leaseExpired))
            return@execute MediaUploadClaimResult.Busy
        val updated = jdbc.update(
            """UPDATE media_upload_commands SET state='CLAIMED',lease_owner=?,
                   lease_until=GREATEST(clock_timestamp(),?::timestamptz)+?*interval '1 millisecond',
                   fence_version=fence_version+1,updated_at=GREATEST(clock_timestamp(),created_at)
               WHERE draft_id=? AND upload_id=? AND (state='AWAITING_BYTES' OR (state='CLAIMED' AND lease_until<=GREATEST(clock_timestamp(),?::timestamptz)))
                 AND EXISTS(SELECT 1 FROM catalog_media_drafts d WHERE d.id=media_upload_commands.draft_id
                   AND d.state='OPEN' AND d.expires_at>clock_timestamp())""",
            leaseOwner.toString(), Timestamp.from(now), duration.toMillis(), draftId.value, uploadId.value, Timestamp.from(now),
        )
        if (updated != 1) return@execute MediaUploadClaimResult.Busy
        val claimed = requireNotNull(uploadRow(draftId, uploadId, forUpdate = false))
        MediaUploadClaimResult.Claimed(mapUploadLease(claimed, leaseOwner))
    }!!

    override fun confirmStored(lease: MediaUploadLease, lookup: ObjectLookupOutcome.Present, providerKind: MediaProviderKind, now: Instant): Boolean = isolated.execute {
        if (providerKind == MediaProviderKind.UNKNOWN || providerKind == MediaProviderKind.UNCONFIGURED ||
            lookup.providerKey != lease.deterministicKey || lookup.digest != lease.snapshot.normalizedDigest ||
            lookup.size != lease.normalizedSize.value || lookup.metadata.format != lease.format || lookup.metadata.dimensions != lease.dimensions
        ) return@execute false
        val row = lockedLiveUpload(lease, now) ?: return@execute false
        if (row["deterministic_key"] != lookup.providerKey.value) return@execute false
        check(jdbc.update(
            """UPDATE media_assets SET state='STORED_PRIVATE',provider_kind=?,provider_key=?,failure_code='NONE',updated_at=GREATEST(clock_timestamp(),created_at)
               WHERE id=? AND state='AWAITING_BYTES'""",
            providerKind.wire, lookup.providerKey.value, lease.snapshot.assetId.value,
        ) == 1) { "media asset transition lost" }
        check(jdbc.update(
            """UPDATE media_upload_commands SET state='COMPLETED',lease_owner=NULL,lease_until=NULL,outcome='CREATED',
                   result=jsonb_build_object('assetId',asset_id::text,'state','STORED_PRIVATE'),updated_at=GREATEST(clock_timestamp(),created_at)
               WHERE draft_id=? AND upload_id=? AND state='CLAIMED' AND lease_owner=? AND fence_version=?
                 AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",
            lease.snapshot.draftId.value, lease.snapshot.uploadId.value, lease.leaseOwner.toString(), lease.fenceVersion,
            Timestamp.from(now),
        ) == 1) { "media upload completion transition lost" }
        true
    } == true

    override fun retryUpload(lease: MediaUploadLease, now: Instant): Boolean = isolated.execute {
        if (lockedLiveUpload(lease, now) == null) return@execute false
        jdbc.update(
            """UPDATE media_upload_commands SET state='AWAITING_BYTES',lease_owner=NULL,lease_until=NULL,updated_at=GREATEST(clock_timestamp(),created_at)
               WHERE draft_id=? AND upload_id=? AND state='CLAIMED' AND lease_owner=? AND fence_version=?
                 AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",
            lease.snapshot.draftId.value, lease.snapshot.uploadId.value, lease.leaseOwner.toString(), lease.fenceVersion,
            Timestamp.from(now),
        ) == 1
    } == true

    override fun failUpload(lease: MediaUploadLease, failure: MediaFailureCode, now: Instant): Boolean = isolated.execute {
        if (failure == MediaFailureCode.NONE || failure == MediaFailureCode.UNKNOWN || lockedLiveUpload(lease, now) == null) return@execute false
        check(jdbc.update(
            "UPDATE media_assets SET state='FAILED',failure_code=?,updated_at=GREATEST(clock_timestamp(),created_at) WHERE id=? AND state='AWAITING_BYTES'",
            failure.wire, lease.snapshot.assetId.value,
        ) == 1) { "media asset failure transition lost" }
        check(jdbc.update(
            """UPDATE media_upload_commands SET state='FAILED',lease_owner=NULL,lease_until=NULL,outcome='FAILED',
                   result=jsonb_build_object('failure',?),updated_at=GREATEST(clock_timestamp(),created_at)
               WHERE draft_id=? AND upload_id=? AND state='CLAIMED' AND lease_owner=? AND fence_version=?
                 AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",
            failure.wire, lease.snapshot.draftId.value, lease.snapshot.uploadId.value, lease.leaseOwner.toString(), lease.fenceVersion,
            Timestamp.from(now),
        ) == 1) { "media upload failure transition lost" }
        true
    } == true

    override fun requestDelete(ownerId: MediaOwnerId, assetId: MediaAssetId, purpose: MediaDeletePurpose, now: Instant): MediaDeleteRequestResult = required.execute {
        if (purpose == MediaDeletePurpose.UNKNOWN) return@execute MediaDeleteRequestResult.ScopeDenied
        val row = lockedAssetUpload(assetId) ?: return@execute MediaDeleteRequestResult.Missing
        if ((row["owner_user_id"] as Number).toLong() != ownerId.value) return@execute MediaDeleteRequestResult.ScopeDenied
        if (jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM product_images WHERE media_asset_id=?)", Boolean::class.java, assetId.value) == true ||
            MediaAssetState.fromWire(row["state"] as? String) == MediaAssetState.ATTACHED
        ) return@execute MediaDeleteRequestResult.Referenced
        if (jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM media_delete_commands WHERE asset_id=?)", Boolean::class.java, assetId.value) == true)
            return@execute MediaDeleteRequestResult.Replay
        val commandState = MediaCommandState.fromWire(row["command_state"] as? String)
        if (commandState == MediaCommandState.CLAIMED || commandState == MediaCommandState.AWAITING_BYTES) check(jdbc.update(
            """UPDATE media_upload_commands SET state='DELETE_PENDING',lease_owner=NULL,lease_until=NULL,
                   outcome=NULL,result=NULL,fence_version=fence_version+1,updated_at=GREATEST(clock_timestamp(),created_at)
               WHERE asset_id=? AND state IN ('CLAIMED','AWAITING_BYTES')""",
            assetId.value,
        ) == 1) { "media upload delete fencing transition lost" }
        check(jdbc.update(
            """UPDATE media_assets SET state='DELETE_PENDING',failure_code='NONE',delete_requested_at=GREATEST(clock_timestamp(),?::timestamptz),
                   updated_at=GREATEST(clock_timestamp(),created_at) WHERE id=?""",
            Timestamp.from(now), assetId.value,
        ) == 1) { "media asset delete transition lost" }
        check(jdbc.update(
            "INSERT INTO media_delete_commands(asset_id,purpose,available_at) VALUES (?,?,GREATEST(clock_timestamp(),?::timestamptz))",
            assetId.value, purpose.wire, Timestamp.from(now),
        ) == 1) { "media delete command registration lost" }
        MediaDeleteRequestResult.Requested
    }!!

    override fun claimDelete(leaseOwner: UUID, now: Instant, duration: Duration): MediaDeleteLease? = isolated.execute {
        require(!duration.isNegative && !duration.isZero)
        val row = jdbc.queryForList(
            """SELECT q.asset_id,q.purpose,q.fence_version,a.normalized_sha256,
                      COALESCE(a.provider_key,c.deterministic_key) provider_key
               FROM media_delete_commands q JOIN media_assets a ON a.id=q.asset_id
               JOIN media_upload_commands c ON c.asset_id=a.id
               WHERE ((q.state IN ('PENDING','RETRY','TOMBSTONED')
                   AND q.available_at<=GREATEST(clock_timestamp(),?::timestamptz))
                  OR (q.state='CLAIMED' AND q.lease_until<=GREATEST(clock_timestamp(),?::timestamptz)))
               ORDER BY q.available_at,q.asset_id LIMIT 1 FOR UPDATE OF q SKIP LOCKED""",
            Timestamp.from(now), Timestamp.from(now),
        ).singleOrNull() ?: return@execute null
        val assetId = row["asset_id"] as UUID
        check(jdbc.update(
            """UPDATE media_delete_commands SET state='CLAIMED',lease_owner=?,
                   lease_until=GREATEST(clock_timestamp(),?::timestamptz)+?*interval '1 millisecond',
                   fence_version=fence_version+1,attempt_count=attempt_count+1,updated_at=clock_timestamp()
               WHERE asset_id=? AND (state IN ('PENDING','RETRY','TOMBSTONED')
                  OR (state='CLAIMED' AND lease_until<=GREATEST(clock_timestamp(),?::timestamptz)))""",
            leaseOwner, Timestamp.from(now), duration.toMillis(), assetId, Timestamp.from(now),
        ) == 1) { "media delete claim transition lost" }
        val claimed = jdbc.queryForMap("SELECT lease_until,fence_version FROM media_delete_commands WHERE asset_id=?", assetId)
        MediaDeleteLease(
            requireNotNull(MediaAssetId.fromWire(assetId.toString())),
            requireNotNull(ProviderObjectKey.fromWire(row["provider_key"] as? String)),
            requireNotNull(ContentDigest.fromWire(row["normalized_sha256"] as? String)),
            MediaDeletePurpose.fromWire(row["purpose"] as? String),
            leaseOwner,
            claimed.instant("lease_until"),
            (claimed["fence_version"] as Number).toLong(),
        )
    }

    override fun settleDelete(lease: MediaDeleteLease, outcome: MediaDeleteOutcome, now: Instant, retryAfter: Duration): Boolean = isolated.execute {
        require(!retryAfter.isNegative && !retryAfter.isZero)
        val locked = lockedAssetUploadDelete(lease.assetId) ?: return@execute false
        val live = MediaDeleteState.fromWire(locked["state"] as? String) == MediaDeleteState.CLAIMED &&
            locked["lease_owner"] == lease.leaseOwner &&
            (locked["fence_version"] as Number).toLong() == lease.fenceVersion &&
            locked.instant("lease_until") > databaseNow(now) &&
            locked["normalized_sha256"] == lease.digest.value &&
            locked["provider_key"] == lease.providerKey.value
        if (!live) return@execute false
        when (outcome) {
            MediaDeleteOutcome.DELETED, MediaDeleteOutcome.ALREADY_ABSENT -> {
                check(jdbc.update(
                    "UPDATE media_assets SET state='DELETED',failure_code='NONE',updated_at=GREATEST(clock_timestamp(),created_at) WHERE id=? AND state IN ('DELETE_PENDING','DELETED')",
                    lease.assetId.value,
                ) == 1) { "media asset tombstone transition lost" }
                check(jdbc.update(
                    """UPDATE media_delete_commands SET state='TOMBSTONED',lease_owner=NULL,lease_until=NULL,last_outcome=?,
                       available_at=GREATEST(clock_timestamp(),?::timestamptz)+?*interval '1 millisecond',last_checked_at=clock_timestamp(),
                       tombstoned_at=COALESCE(tombstoned_at,clock_timestamp()),updated_at=clock_timestamp()
                       WHERE asset_id=? AND state='CLAIMED' AND lease_owner=? AND fence_version=?
                         AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",
                    outcome.wire, Timestamp.from(now), retryAfter.toMillis(), lease.assetId.value, lease.leaseOwner,
                    lease.fenceVersion, Timestamp.from(now),
                ) == 1) { "media delete tombstone transition lost" }
                true
            }
            MediaDeleteOutcome.RETRYABLE_FAILURE, MediaDeleteOutcome.UNKNOWN -> jdbc.update(
                """UPDATE media_delete_commands SET state='RETRY',lease_owner=NULL,lease_until=NULL,last_outcome=?,
                   available_at=GREATEST(clock_timestamp(),?::timestamptz)+?*interval '1 millisecond',last_checked_at=clock_timestamp(),updated_at=clock_timestamp()
                   WHERE asset_id=? AND state='CLAIMED' AND lease_owner=? AND fence_version=?
                     AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",
                outcome.wire, Timestamp.from(now), retryAfter.toMillis(), lease.assetId.value, lease.leaseOwner,
                lease.fenceVersion, Timestamp.from(now),
            ) == 1
            MediaDeleteOutcome.DIGEST_MISMATCH -> jdbc.update(
                """UPDATE media_delete_commands SET state='BLOCKED',lease_owner=NULL,lease_until=NULL,last_outcome='DIGEST_MISMATCH',
                   last_checked_at=clock_timestamp(),updated_at=clock_timestamp()
                   WHERE asset_id=? AND state='CLAIMED' AND lease_owner=? AND fence_version=?
                     AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",
                lease.assetId.value, lease.leaseOwner, lease.fenceVersion, Timestamp.from(now),
            ) == 1
        }
    } == true

    private fun lockedLiveUpload(lease: MediaUploadLease, now: Instant): Map<String, Any?>? =
        uploadRow(lease.snapshot.draftId, lease.snapshot.uploadId, forUpdate = true)?.takeIf {
            MediaCommandState.fromWire(it["command_state"] as? String) == MediaCommandState.CLAIMED &&
                it["lease_owner"] == lease.leaseOwner.toString() &&
                (it["fence_version"] as Number).toLong() == lease.fenceVersion &&
                it.instant("lease_until") > databaseNow(now) &&
                MediaAssetState.fromWire(it["asset_state"] as? String) == MediaAssetState.AWAITING_BYTES
        }

    private fun uploadRow(draftId: CatalogMediaDraftId, uploadId: UploadId, forUpdate: Boolean): Map<String, Any?>? {
        if (forUpdate) {
            val assetId = jdbc.queryForList(
                "SELECT asset_id FROM media_upload_commands WHERE draft_id=? AND upload_id=?",
                draftId.value, uploadId.value,
            ).singleOrNull()?.get("asset_id") as? UUID ?: return null
            if (jdbc.queryForList("SELECT id FROM media_assets WHERE id=? FOR UPDATE", assetId).isEmpty()) return null
            if (jdbc.queryForList(
                    "SELECT upload_id FROM media_upload_commands WHERE draft_id=? AND upload_id=? FOR UPDATE",
                    draftId.value, uploadId.value,
                ).isEmpty()
            ) return null
        }
        return jdbc.queryForList(
            """SELECT c.state command_state,c.*,a.state asset_state,a.original_sha256,a.normalized_sha256,a.format,a.width,a.height,
                      a.normalized_size,a.provider_kind,a.provider_key
               FROM media_upload_commands c JOIN media_assets a ON a.id=c.asset_id
               WHERE c.draft_id=? AND c.upload_id=?""",
            draftId.value, uploadId.value,
        ).singleOrNull()
    }

    /** Global media lock order: asset, upload command, then delete command. */
    private fun lockedAssetUpload(assetId: MediaAssetId): Map<String, Any?>? {
        if (jdbc.queryForList("SELECT id FROM media_assets WHERE id=? FOR UPDATE", assetId.value).isEmpty()) return null
        if (jdbc.queryForList("SELECT asset_id FROM media_upload_commands WHERE asset_id=? FOR UPDATE", assetId.value).isEmpty()) return null
        return jdbc.queryForList(
            """SELECT a.*,c.state command_state,c.lease_owner,c.fence_version,c.deterministic_key
               FROM media_assets a JOIN media_upload_commands c ON c.asset_id=a.id WHERE a.id=?""",
            assetId.value,
        ).singleOrNull()
    }

    private fun lockedAssetUploadDelete(assetId: MediaAssetId): Map<String, Any?>? {
        val assetAndUpload = lockedAssetUpload(assetId) ?: return null
        if (jdbc.queryForList("SELECT asset_id FROM media_delete_commands WHERE asset_id=? FOR UPDATE", assetId.value).isEmpty()) return null
        val queue = jdbc.queryForList(
            "SELECT state,lease_owner,lease_until,fence_version FROM media_delete_commands WHERE asset_id=?",
            assetId.value,
        ).singleOrNull() ?: return null
        return assetAndUpload + queue + mapOf(
            "asset_state" to assetAndUpload["state"],
            "provider_key" to (assetAndUpload["provider_key"] ?: assetAndUpload["deterministic_key"]),
        )
    }

    private fun mapSnapshot(row: Map<String, Any?>) = MediaUploadSnapshot(
        requireNotNull(CatalogMediaDraftId.fromWire((row["draft_id"] as UUID).toString())),
        requireNotNull(MediaOwnerId.fromWire(row["owner_user_id"])),
        requireNotNull(UploadId.fromWire((row["upload_id"] as UUID).toString())),
        requireNotNull(MediaAssetId.fromWire((row["asset_id"] as UUID).toString())),
        MediaCommandState.fromWire(row["command_state"] as? String),
        MediaAssetState.fromWire(row["asset_state"] as? String),
        requireNotNull(MediaRequestHash.fromWire(row["original_hash"] as? String)),
        requireNotNull(ContentDigest.fromWire(row["normalized_hash"] as? String)),
        MediaProviderKind.fromWire(row["provider_kind"] as? String),
        ProviderObjectKey.fromWire(row["provider_key"] as? String),
    )

    private fun mapUploadLease(row: Map<String, Any?>, owner: UUID) = MediaUploadLease(
        mapSnapshot(row),
        requireNotNull(ProviderObjectKey.fromWire(row["deterministic_key"] as? String)),
        MediaFormat.fromWire(row["format"] as? String),
        requireNotNull(PixelDimensions.fromWire((row["width"] as Number).toInt(), (row["height"] as Number).toInt())),
        requireNotNull(MediaByteSize.fromWire(row["normalized_size"])),
        owner,
        row.instant("lease_until"),
        (row["fence_version"] as Number).toLong(),
    )

    private fun databaseNow(now: Instant): Instant = maxOf(now, jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant())
    private fun Map<String, Any?>.instant(key: String): Instant = (get(key) as Timestamp).toInstant()
}
