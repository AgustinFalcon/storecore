package com.storecore.catalog.infrastructure.media

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.nio.charset.StandardCharsets
import java.sql.Timestamp
import java.util.UUID

/** Atomic local create-only catalog writer. No object-store or network I/O is permitted here. */
class JdbcMediaProductCreationRepository(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    transactions: TransactionTemplate = TransactionTemplate(DataSourceTransactionManager(requireNotNull(jdbc.dataSource))),
) : MediaProductCreationRepository {
    private val required = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
    }
    private val codec = MediaProductCreationResultCodec(mapper)

    override fun create(command: MediaProductCreationCommand): MediaProductCreationResult {
        val hash = MediaProductCreationHash.calculate(command)
        return try {
            required.execute { createInTransaction(command, hash) } ?: MediaProductCreationResult.Unknown
        } catch (abort: CreationAbort) {
            abort.result
        } catch (failure: DataIntegrityViolationException) {
            if (failure.causes().filterIsInstance<java.sql.SQLException>().any { it.sqlState == "23505" })
                MediaProductCreationResult.Conflict
            else throw failure
        }
    }

    private fun createInTransaction(command: MediaProductCreationCommand, hash: MediaRequestHash): MediaProductCreationResult {
        findReceipt(command.draftId, lock = true)?.let { return replay(command, hash, it) }
        val draft = jdbc.queryForList(
            "SELECT owner_user_id,target_product_id,state,expires_at FROM catalog_media_drafts WHERE id=? FOR UPDATE",
            command.draftId.value,
        ).singleOrNull() ?: return MediaProductCreationResult.ScopeDenied
        // A concurrent creator whose row was absent from our first statement may have completed while we waited on the draft.
        findReceipt(command.draftId, lock = true)?.let { return replay(command, hash, it) }
        if ((draft["owner_user_id"] as Number).toLong() != command.ownerId.value) return MediaProductCreationResult.ScopeDenied
        if (draft["target_product_id"] != null || CatalogMediaDraftState.fromWire(draft["state"] as? String) != CatalogMediaDraftState.OPEN)
            return MediaProductCreationResult.DraftClosed

        jdbc.update(
            "INSERT INTO catalog_media_product_creation_commands(draft_id,owner_user_id,request_hash) VALUES (?,?,?)",
            command.draftId.value, command.ownerId.value, hash.value,
        )
        val productId = MediaProductId.fromWire(jdbc.queryForObject(
            """INSERT INTO products(brand_id,category_id,name,slug,description,base_price,status)
               VALUES (?,?,?,?,?,?,?) RETURNING id""",
            Long::class.java, command.brandId, command.categoryId, command.name.value, command.slug.value,
            command.description, command.basePrice.value, command.status.name,
        )) ?: error("invalid generated product id")

        val variantIds = linkedMapOf<ClientVariantRef, MediaVariantId>()
        command.variants.sortedBy { it.sku.value }.forEach { variant ->
            val attributes = variant.attributes.toSortedMap()
            val attributesJson = mapper.writeValueAsString(attributes)
            val attributeOrderJson = mapper.writeValueAsString(attributes.keys)
            val id = MediaVariantId.fromWire(jdbc.queryForObject(
                """INSERT INTO product_variants(product_id,sku,label,attributes,attribute_order,active)
                   VALUES (?,?,?,?::jsonb,ARRAY(SELECT jsonb_array_elements_text(?::jsonb)),?) RETURNING id""",
                Long::class.java, productId.value, variant.sku.value, variant.label.value,
                attributesJson, attributeOrderJson, variant.active,
            )) ?: error("invalid generated variant id")
            variantIds[variant.clientRef] = id
            jdbc.update(
                "INSERT INTO inventory_balances(variant_id,available_quantity) VALUES (?,?)",
                id.value, variant.initialAvailable.value,
            )
            if (variant.initialAvailable.value > 0) appendInitialStock(command, variant, id)
        }

        val assetRows = linkedMapOf<MediaAssetId, Map<String, Any?>>()
        command.productImages.map { it.assetId }.sortedBy { it.value.toString() }.forEach { assetId ->
            val asset = jdbc.queryForList("SELECT * FROM media_assets WHERE id=? FOR UPDATE", assetId.value).singleOrNull()
                ?: throw CreationAbort(MediaProductCreationResult.AssetUnavailable)
            val upload = jdbc.queryForList("SELECT state FROM media_upload_commands WHERE asset_id=? FOR UPDATE", assetId.value).singleOrNull()
                ?: throw CreationAbort(MediaProductCreationResult.AssetUnavailable)
            val deletion = jdbc.queryForList("SELECT state FROM media_delete_commands WHERE asset_id=? FOR UPDATE", assetId.value).singleOrNull()
            assetRows[assetId] = asset + mapOf("upload_state" to upload["state"], "delete_state" to deletion?.get("state"))
        }
        val checkedAt = requireNotNull(jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)).toInstant()
        if ((draft["expires_at"] as Timestamp).toInstant() <= checkedAt) throw CreationAbort(MediaProductCreationResult.DraftClosed)
        assetRows.forEach { (assetId, row) ->
            if ((row["owner_user_id"] as? Number)?.toLong() != command.ownerId.value || row["draft_id"] != command.draftId.value ||
                MediaAssetState.fromWire(row["state"] as? String) != MediaAssetState.STORED_PRIVATE ||
                MediaCommandState.fromWire(row["upload_state"] as? String) != MediaCommandState.COMPLETED ||
                MediaProviderKind.fromWire(row["provider_kind"] as? String) in setOf(MediaProviderKind.UNKNOWN, MediaProviderKind.UNCONFIGURED) ||
                row["delete_state"] != null
            ) throw CreationAbort(MediaProductCreationResult.AssetUnavailable)
        }

        val productImageIds = linkedMapOf<MediaAssetId, ProductImageId>()
        command.productImages.sortedBy { it.sortOrder }.forEach { image ->
            val id = ProductImageId.fromWire(jdbc.queryForObject(
                """INSERT INTO product_images(product_id,url,sort_order,is_primary,media_asset_id,source_kind,alt_text)
                   VALUES (?,NULL,?,?,?,'MANAGED',?) RETURNING id""",
                Long::class.java, productId.value, image.sortOrder, image.isPrimary, image.assetId.value, image.altText.value,
            )) ?: error("invalid generated product image id")
            productImageIds[image.assetId] = id
        }
        val variantSnapshots = mutableListOf<CreatedVariantGallerySnapshot>()
        command.variantGalleries.sortedBy { it.clientRef.value }.forEach { gallery ->
            val variantId = variantIds[gallery.clientRef] ?: throw CreationAbort(MediaProductCreationResult.InvalidAssociation)
            val images = gallery.images.sortedBy { it.sortOrder }.map { image ->
                val assetId = (image.reference as? MediaImageReference.StagedAsset)?.assetId
                    ?: throw CreationAbort(MediaProductCreationResult.InvalidAssociation)
                val productImageId = productImageIds[assetId] ?: throw CreationAbort(MediaProductCreationResult.InvalidAssociation)
                jdbc.update(
                    "INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES (?,?,?,?,?)",
                    productId.value, variantId.value, productImageId.value, image.sortOrder, image.isPrimary,
                )
                VariantMediaSnapshotEntry(productImageId, image.sortOrder, image.isPrimary)
            }
            variantSnapshots += CreatedVariantGallerySnapshot(gallery.clientRef, images)
        }
        assetRows.keys.forEach { assetId ->
            if (jdbc.update("UPDATE media_assets SET state='ATTACHED',updated_at=clock_timestamp() WHERE id=? AND state='STORED_PRIVATE'", assetId.value) != 1)
                throw CreationAbort(MediaProductCreationResult.AssetUnavailable)
            if (jdbc.update("UPDATE media_upload_commands SET state='ATTACHED',outcome=NULL,result=NULL,updated_at=clock_timestamp() WHERE asset_id=? AND state='COMPLETED'", assetId.value) != 1)
                throw CreationAbort(MediaProductCreationResult.AssetUnavailable)
        }
        if (jdbc.update(
                """UPDATE catalog_media_drafts SET target_product_id=?,state='CLAIMED',revision=revision+1
                   WHERE id=? AND owner_user_id=? AND state='OPEN' AND target_product_id IS NULL""",
                productId.value, command.draftId.value, command.ownerId.value,
            ) != 1) throw CreationAbort(MediaProductCreationResult.DraftClosed)
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
               VALUES ('USER',?,'CATALOG_PRODUCT_CREATED_WITH_MEDIA','products',?,
                 jsonb_build_object('draftId',?::text,'variantCount',?::integer,'imageCount',?::integer))""",
            command.ownerId.value.toString(), productId.value, command.draftId.value.toString(), command.variants.size, command.productImages.size,
        )
        val snapshot = MediaProductCreationSnapshot(
            productId, requireNotNull(MediaCompositionRevision.fromWire(1L)),
            command.variants.map { CreatedVariantSnapshot(it.clientRef, requireNotNull(variantIds[it.clientRef])) },
            command.productImages.sortedBy { it.sortOrder }.map { CreatedProductImageSnapshot(it.assetId, requireNotNull(productImageIds[it.assetId]), it.sortOrder, it.isPrimary) },
            variantSnapshots,
        )
        val encoded = codec.encode(snapshot)
        if (jdbc.update(
                """UPDATE catalog_media_product_creation_commands
                   SET state=?,product_id=?,result=?::jsonb,completed_at=clock_timestamp()
                   WHERE draft_id=? AND owner_user_id=? AND request_hash=? AND state=?""",
                MediaProductCreationLedgerState.COMPLETED.wire, productId.value, encoded,
                command.draftId.value, command.ownerId.value, hash.value, MediaProductCreationLedgerState.IN_PROGRESS.wire,
            ) != 1) error("media product creation receipt transition lost")
        return MediaProductCreationResult.Created(snapshot)
    }

    private fun appendInitialStock(command: MediaProductCreationCommand, variant: MediaProductCreationVariant, variantId: MediaVariantId) {
        val key = UUID.nameUUIDFromBytes("media-create-stock-v1:${command.draftId.value}:${variant.clientRef.value}".toByteArray(StandardCharsets.UTF_8))
        val ledgerId = jdbc.queryForObject(
            """INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor)
               VALUES (?,?,'ADJUSTMENT','INTERNAL',?,?) RETURNING id""",
            Long::class.java, variantId.value, key, variant.initialAvailable.value, "USER:${command.ownerId.value}",
        ) ?: error("initial stock ledger insert lost")
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
               VALUES ('USER',?,'INVENTORY_ADJUSTED','INVENTORY_VARIANT',?,
                 jsonb_build_object('ledgerId',?::bigint,'quantityDelta',?::integer,'reason','INITIAL_CATALOG_STOCK'))""",
            command.ownerId.value.toString(), variantId.value, ledgerId, variant.initialAvailable.value,
        )
    }

    private fun findReceipt(draftId: CatalogMediaDraftId, lock: Boolean): Map<String, Any?>? = jdbc.queryForList(
        "SELECT owner_user_id,request_hash,state,product_id,result::text result FROM catalog_media_product_creation_commands WHERE draft_id=?" + if (lock) " FOR UPDATE" else "",
        draftId.value,
    ).singleOrNull()

    private fun replay(command: MediaProductCreationCommand, hash: MediaRequestHash, row: Map<String, Any?>): MediaProductCreationResult {
        if ((row["owner_user_id"] as? Number)?.toLong() != command.ownerId.value) return MediaProductCreationResult.ScopeDenied
        if (row["request_hash"] != hash.value) return MediaProductCreationResult.Conflict
        if (MediaProductCreationLedgerState.fromWire(row["state"] as? String) != MediaProductCreationLedgerState.COMPLETED)
            return MediaProductCreationResult.Unknown
        val snapshot = codec.decode(row["result"] as? String) ?: return MediaProductCreationResult.Unknown
        if ((row["product_id"] as? Number)?.toLong() != snapshot.productId.value) return MediaProductCreationResult.Unknown
        return MediaProductCreationResult.Replayed(snapshot)
    }

    private class CreationAbort(val result: MediaProductCreationResult) : RuntimeException(null, null, false, false)

    private fun Throwable.causes(): Sequence<Throwable> = generateSequence(this) { it.cause }.take(16)
}
