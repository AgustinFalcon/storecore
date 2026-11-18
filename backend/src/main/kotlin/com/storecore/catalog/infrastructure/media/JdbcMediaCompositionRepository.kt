package com.storecore.catalog.infrastructure.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.util.UUID

/** Atomic local composition CAS. This adapter never performs object-store I/O. */
class JdbcMediaCompositionRepository(
    private val jdbc: JdbcTemplate,
    private val allowedLegacyMediaHosts: Set<String>,
    transactions: TransactionTemplate = TransactionTemplate(DataSourceTransactionManager(requireNotNull(jdbc.dataSource))),
) : MediaCompositionRepository {
    private val required = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
    }
    private val repeatableRead = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
        isolationLevel = TransactionDefinition.ISOLATION_REPEATABLE_READ
        isReadOnly = true
    }

    override fun read(productId: MediaProductId): MediaCompositionSnapshot? = repeatableRead.execute {
        snapshot(productId)
    }

    override fun replace(command: MediaCompositionCommand): MediaCompositionResult = required.execute {
        val product = jdbc.queryForList(
            "SELECT id,media_revision FROM products WHERE id=? FOR NO KEY UPDATE",
            command.productId.value,
        ).singleOrNull() ?: return@execute MediaCompositionResult.Missing
        val revision = MediaCompositionRevision.fromWire(product["media_revision"])
            ?: return@execute MediaCompositionResult.Unknown
        if (revision != command.expectedRevision) return@execute MediaCompositionResult.Conflict
        val nextRevision = revision.next() ?: return@execute MediaCompositionResult.RevisionExhausted

        val draft = jdbc.queryForList(
            """SELECT owner_user_id,target_product_id,state,expires_at
               FROM catalog_media_drafts WHERE id=? FOR UPDATE""",
            command.draftId.value,
        ).singleOrNull() ?: return@execute MediaCompositionResult.ScopeDenied
        if ((draft["owner_user_id"] as Number).toLong() != command.ownerId.value ||
            (draft["target_product_id"] as? Number)?.toLong() != command.productId.value
        ) return@execute MediaCompositionResult.ScopeDenied
        if (CatalogMediaDraftState.fromWire(draft["state"] as? String) != CatalogMediaDraftState.OPEN)
            return@execute MediaCompositionResult.DraftClosed

        val productVariantIds = jdbc.queryForList(
            "SELECT id FROM product_variants WHERE product_id=? ORDER BY id FOR UPDATE",
            Long::class.java,
            command.productId.value,
        ).mapNotNull(MediaVariantId::fromWire)
        if (!productVariantIds.containsAll(command.composition.variantImages.map { it.variantId }))
            return@execute MediaCompositionResult.InvalidAssociation

        val currentImages = jdbc.queryForList(
            """SELECT id,media_asset_id,source_kind FROM product_images
               WHERE product_id=? ORDER BY id""",
            command.productId.value,
        )
        val currentById = currentImages.associateBy { (it["id"] as Number).toLong() }
        val requestedExisting = command.composition.productImages.mapNotNull {
            (it.reference as? MediaImageReference.ExistingProductImage)?.productImageId?.value
        }.toSet()
        if (!currentById.keys.containsAll(requestedExisting)) return@execute MediaCompositionResult.InvalidAssociation

        val stagedAssetIds = command.composition.productImages.mapNotNull {
            (it.reference as? MediaImageReference.StagedAsset)?.assetId
        }.toSet()
        val currentAssetIds = currentImages.mapNotNull { (it["media_asset_id"] as? UUID)?.toMediaAssetId() }.toSet()
        val lockedAssets = linkedMapOf<MediaAssetId, Map<String, Any?>>()
        for (assetId in (currentAssetIds + stagedAssetIds).sortedBy { it.value.toString() }) {
            val asset = jdbc.queryForList("SELECT * FROM media_assets WHERE id=? FOR UPDATE", assetId.value).singleOrNull()
                ?: return@execute MediaCompositionResult.AssetUnavailable
            val upload = jdbc.queryForList("SELECT * FROM media_upload_commands WHERE asset_id=? FOR UPDATE", assetId.value).singleOrNull()
                ?: return@execute MediaCompositionResult.AssetUnavailable
            val deletion = jdbc.queryForList("SELECT state FROM media_delete_commands WHERE asset_id=? FOR UPDATE", assetId.value).singleOrNull()
            lockedAssets[assetId] = asset + upload.mapKeys { "upload_${it.key}" } + mapOf("delete_state" to deletion?.get("state"))
        }
        val checkedAt = requireNotNull(jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)).toInstant()
        if ((draft["expires_at"] as Timestamp).toInstant() <= checkedAt)
            return@execute MediaCompositionResult.DraftClosed
        for (assetId in stagedAssetIds) {
            val row = lockedAssets.getValue(assetId)
            if ((row["owner_user_id"] as Number).toLong() != command.ownerId.value ||
                row["draft_id"] != command.draftId.value ||
                MediaCommandState.fromWire(row["upload_state"] as? String) != MediaCommandState.COMPLETED ||
                MediaAssetState.fromWire(row["state"] as? String) != MediaAssetState.STORED_PRIVATE ||
                MediaProviderKind.fromWire(row["provider_kind"] as? String) in setOf(MediaProviderKind.UNKNOWN, MediaProviderKind.UNCONFIGURED) ||
                row["delete_state"] != null
            ) return@execute MediaCompositionResult.AssetUnavailable
        }

        val requestedExistingIds = requestedExisting.toSet()
        val removedRows = currentImages.filter { (it["id"] as Number).toLong() !in requestedExistingIds }
        val removedAssets = removedRows.mapNotNull { (it["media_asset_id"] as? UUID)?.toMediaAssetId() }

        jdbc.update(
            "DELETE FROM variant_images WHERE product_id=?",
            command.productId.value,
        )
        if (currentImages.isNotEmpty()) {
            val temporaryBase = currentImages.size + command.composition.productImages.size +
                (jdbc.queryForObject("SELECT COALESCE(max(sort_order),0) FROM product_images WHERE product_id=?", Int::class.java, command.productId.value) ?: 0) + 1
            currentImages.forEachIndexed { index, row ->
                jdbc.update(
                    "UPDATE product_images SET sort_order=?,is_primary=false WHERE id=? AND product_id=?",
                    temporaryBase + index, (row["id"] as Number).toLong(), command.productId.value,
                )
            }
        }
        removedRows.forEach { row ->
            check(jdbc.update("DELETE FROM product_images WHERE id=? AND product_id=?", (row["id"] as Number).toLong(), command.productId.value) == 1) {
                "media composition image removal lost"
            }
        }

        val resolved = linkedMapOf<MediaImageReference, ProductImageId>()
        for (entry in command.composition.productImages.sortedBy { it.sortOrder }) {
            val imageId = when (val reference = entry.reference) {
                is MediaImageReference.ExistingProductImage -> {
                    check(jdbc.update(
                        """UPDATE product_images SET sort_order=?,is_primary=?,alt_text=?
                           WHERE id=? AND product_id=?""",
                        entry.sortOrder, entry.isPrimary, entry.altText.value,
                        reference.productImageId.value, command.productId.value,
                    ) == 1) { "media composition image update lost" }
                    reference.productImageId
                }
                is MediaImageReference.StagedAsset -> {
                    val id = jdbc.queryForObject(
                        """INSERT INTO product_images(product_id,url,sort_order,is_primary,media_asset_id,source_kind,alt_text)
                           VALUES (?,NULL,?,?,?,'MANAGED',?) RETURNING id""",
                        Long::class.java,
                        command.productId.value, entry.sortOrder, entry.isPrimary, reference.assetId.value, entry.altText.value,
                    ) ?: error("media composition image insert lost")
                    requireNotNull(ProductImageId.fromWire(id))
                }
            }
            resolved[entry.reference] = imageId
        }

        for (variant in command.composition.variantImages) {
            for (entry in variant.images.sortedBy { it.sortOrder }) {
                val imageId = resolved[entry.reference] ?: return@execute MediaCompositionResult.InvalidAssociation
                jdbc.update(
                    """INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary)
                       VALUES (?,?,?,?,?)""",
                    command.productId.value, variant.variantId.value, imageId.value, entry.sortOrder, entry.isPrimary,
                )
            }
        }

        for (assetId in stagedAssetIds) {
            check(jdbc.update(
                "UPDATE media_assets SET state='ATTACHED',updated_at=clock_timestamp() WHERE id=? AND state='STORED_PRIVATE'",
                assetId.value,
            ) == 1) { "media asset attach transition lost" }
            check(jdbc.update(
                """UPDATE media_upload_commands SET state='ATTACHED',outcome=NULL,result=NULL,updated_at=clock_timestamp()
                   WHERE asset_id=? AND state='COMPLETED'""",
                assetId.value,
            ) == 1) { "media upload attach transition lost" }
        }
        for (assetId in removedAssets) {
            check(jdbc.update(
                """UPDATE media_assets SET state='STORED_PRIVATE',updated_at=clock_timestamp()
                   WHERE id=? AND state='ATTACHED' AND NOT EXISTS
                     (SELECT 1 FROM product_images WHERE media_asset_id=?)""",
                assetId.value, assetId.value,
            ) == 1) { "media asset detach transition lost" }
            check(jdbc.update(
                """UPDATE media_upload_commands SET state='COMPLETED',outcome='CREATED',
                     result=jsonb_build_object('assetId',asset_id::text,'state','STORED_PRIVATE'),updated_at=clock_timestamp()
                   WHERE asset_id=? AND state='ATTACHED'""",
                assetId.value,
            ) == 1) { "media upload detach transition lost" }
        }

        check(jdbc.update(
                "UPDATE products SET media_revision=? WHERE id=? AND media_revision=?",
                nextRevision.value, command.productId.value, revision.value,
            ) == 1
        ) { "media composition CAS transition lost after product lock" }
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
               VALUES ('USER',?,'CATALOG_MEDIA_COMPOSITION_REPLACED','products',?,
                 jsonb_build_object('beforeRevision',?::bigint,'afterRevision',?::bigint,
                   'productImageCount',?::integer,'variantGalleryCount',?::integer))""",
            command.ownerId.value.toString(), command.productId.value, revision.value, nextRevision.value,
            command.composition.productImages.size, command.composition.variantImages.size,
        )
        snapshot(command.productId)?.let(MediaCompositionResult::Saved) ?: MediaCompositionResult.Unknown
    }!!

    private fun snapshot(productId: MediaProductId): MediaCompositionSnapshot? {
        val revision = jdbc.queryForList("SELECT media_revision FROM products WHERE id=?", productId.value)
            .singleOrNull()?.get("media_revision")?.let(MediaCompositionRevision::fromWire) ?: return null
        val images = jdbc.queryForList(
            """SELECT id,url,media_asset_id,source_kind,sort_order,is_primary,alt_text
               FROM product_images WHERE product_id=? ORDER BY sort_order,id""",
            productId.value,
        ).map { row ->
            val imageId = ProductImageId.fromWire(row["id"]) ?: error("invalid product image id")
            val source = ProductMediaSource.fromWire(
                row["source_kind"] as? String,
                (row["media_asset_id"] as? UUID)?.toString(),
                row["url"] as? String,
                allowedLegacyMediaHosts,
            )
            ProductMediaSnapshotEntry(
                imageId, source, (row["sort_order"] as Number).toInt(), row["is_primary"] as Boolean,
                AltText.fromWire(row["alt_text"] as? String) ?: INVALID_LEGACY_ALT,
            )
        }
        val variants = jdbc.queryForList(
            """SELECT variant_id,product_image_id,sort_order,is_primary
               FROM variant_images WHERE product_id=? ORDER BY variant_id,sort_order,product_image_id""",
            productId.value,
        ).groupBy { requireNotNull(MediaVariantId.fromWire(it["variant_id"])) }
            .map { (variantId, rows) ->
                VariantMediaSnapshot(variantId, rows.map { row ->
                    VariantMediaSnapshotEntry(
                        requireNotNull(ProductImageId.fromWire(row["product_image_id"])),
                        (row["sort_order"] as Number).toInt(), row["is_primary"] as Boolean,
                    )
                })
            }
        return MediaCompositionSnapshot(productId, revision, images, variants)
    }

    private fun UUID.toMediaAssetId(): MediaAssetId? = MediaAssetId.fromWire(toString())

    private companion object {
        val INVALID_LEGACY_ALT: AltText = requireNotNull(AltText.fromWire("Imagen no disponible"))
    }
}
