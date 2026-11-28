package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Duration
import java.util.UUID

class MediaCommandScopePostgresTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @BeforeAll fun start() = postgres.start()
        @JvmStatic @AfterAll fun stop() = postgres.stop()
    }

    @Test fun `foreign actor cannot register find claim execute or delete another owner's staging`() {
        val f = fixture()
        val own = f.registered()
        val foreign = f.command(own.draftId, owner = f.foreignOwner, uploadId = own.uploadId)
        val sibling = f.command(own.draftId, owner = f.foreignOwner)

        assertEquals(MediaUploadRegistrationResult.ScopeDenied, f.commands.registerUpload(foreign))
        assertEquals(MediaUploadRegistrationResult.ScopeDenied, f.commands.registerUpload(sibling))
        assertNull(f.commands.findUpload(f.foreignOwner, own.draftId, own.uploadId))
        assertEquals(
            MediaUploadClaimResult.ScopeDenied,
            f.commands.claimUpload(f.foreignOwner, own.draftId, own.uploadId, UUID.randomUUID(), f.clock.instant(), Duration.ofMinutes(1)),
        )
        assertEquals(MediaUploadRun.Denied, f.uploadWorker().executeRegistered(foreign, f.normalizedBytes(), UUID.randomUUID()))
        assertEquals(
            MediaDeleteRequestResult.ScopeDenied,
            f.commands.requestDelete(f.foreignOwner, own.assetId, MediaDeletePurpose.USER_DELETE, f.clock.instant()),
        )
        assertEquals(MediaDraftRegistrationResult.Conflict, f.commands.registerDraft(
            MediaDraftRegistration(own.draftId, f.foreignOwner, null, f.clock.instant().plus(Duration.ofHours(1))),
        ))

        assertEquals(MediaAssetState.AWAITING_BYTES, f.assetState(own))
        assertEquals(MediaCommandState.AWAITING_BYTES, f.commandState(own))
        assertEquals(0L, f.fence(own))
        assertEquals(1, f.count("media_assets"))
        assertEquals(0, f.count("media_delete_commands"))
        assertEquals(0, f.objects.size())
    }

    @Test fun `a draft binds staging to exactly one product target`() {
        val f = fixture()
        val productX = f.product()
        val productY = f.product()
        val editX = f.draft(target = productX)
        val create = f.draft()

        assertEquals(MediaUploadRegistrationResult.ScopeDenied, f.commands.registerUpload(f.command(editX, target = productY)))
        assertEquals(MediaUploadRegistrationResult.ScopeDenied, f.commands.registerUpload(f.command(editX, target = null)))
        assertEquals(MediaUploadRegistrationResult.ScopeDenied, f.commands.registerUpload(f.command(create, target = productX)))
        assertEquals(MediaDraftRegistrationResult.Conflict, f.commands.registerDraft(
            MediaDraftRegistration(editX, f.owner, productY, f.clock.instant().plus(Duration.ofHours(1))),
        ))
        assertEquals(0, f.count("media_assets"))
        assertEquals(0, f.count("media_upload_commands"))
    }

    @Test fun `composition denies foreign drafts foreign staging cross draft staging and cross product images`() {
        val f = fixture()
        val productX = f.product()
        val productY = f.product()
        val foreignImage = f.legacyImage(productY)
        val staged = f.stored(target = productX)
        val secondOwnDraft = f.draft(target = productX)
        val foreignDraft = f.draft(owner = f.foreignOwner, target = productX)
        val repository = f.runtimeComposition()
        val stagedEntry = composition(MediaImageReference.StagedAsset(staged.assetId))
        val first = MediaCompositionRevision.fromWire(1)!!

        assertEquals(MediaCompositionResult.ScopeDenied, repository.replace(
            MediaCompositionCommand(f.foreignOwner, staged.draftId, productX, first, stagedEntry),
        ))
        assertEquals(MediaCompositionResult.AssetUnavailable, repository.replace(
            MediaCompositionCommand(f.foreignOwner, foreignDraft, productX, first, stagedEntry),
        ))
        assertEquals(MediaCompositionResult.ScopeDenied, repository.replace(
            MediaCompositionCommand(f.owner, staged.draftId, productY, first, stagedEntry),
        ))
        assertEquals(MediaCompositionResult.AssetUnavailable, repository.replace(
            MediaCompositionCommand(f.owner, secondOwnDraft, productX, first, stagedEntry),
        ))
        assertEquals(MediaCompositionResult.InvalidAssociation, repository.replace(
            MediaCompositionCommand(f.owner, staged.draftId, productX, first, composition(MediaImageReference.ExistingProductImage(foreignImage))),
        ))

        assertEquals(1L, f.jdbc.queryForObject("SELECT media_revision FROM products WHERE id=?", Long::class.java, productX.value))
        assertEquals(0, f.jdbc.queryForObject("SELECT count(*) FROM product_images WHERE product_id=?", Int::class.java, productX.value))
        assertEquals(MediaAssetState.STORED_PRIVATE, f.assetState(staged))
        assertEquals(0, f.jdbc.queryForObject(
            "SELECT count(*) FROM audit_events WHERE event_type='CATALOG_MEDIA_COMPOSITION_REPLACED'", Int::class.java,
        ))
    }

    @Test fun `after publication another admin maintains the association but never the staging asset`() {
        val f = fixture()
        val productX = f.product()
        val staged = f.stored(target = productX)
        val foreignDraft = f.draft(owner = f.foreignOwner, target = productX)
        val repository = f.runtimeComposition()
        val published = repository.replace(MediaCompositionCommand(
            f.owner, staged.draftId, productX, MediaCompositionRevision.fromWire(1)!!,
            composition(MediaImageReference.StagedAsset(staged.assetId)),
        )) as MediaCompositionResult.Saved
        val imageId = published.snapshot.productImages.single().productImageId

        val maintained = repository.replace(MediaCompositionCommand(
            f.foreignOwner, foreignDraft, productX, MediaCompositionRevision.fromWire(2)!!,
            composition(MediaImageReference.ExistingProductImage(imageId), "Mantenida por otro ADMIN"),
        )) as MediaCompositionResult.Saved
        assertEquals(imageId, maintained.snapshot.productImages.single().productImageId)
        assertEquals(MediaAssetState.ATTACHED, f.assetState(staged))

        assertEquals(
            MediaDeleteRequestResult.ScopeDenied,
            f.commands.requestDelete(f.foreignOwner, staged.assetId, MediaDeletePurpose.USER_DELETE, f.clock.instant()),
        )
        assertEquals(
            MediaDeleteRequestResult.Referenced,
            f.commands.requestDelete(f.owner, staged.assetId, MediaDeletePurpose.USER_DELETE, f.clock.instant()),
        )
        assertNull(f.commands.findUpload(f.foreignOwner, staged.draftId, staged.uploadId))
        assertEquals(0, f.count("media_delete_commands"))
    }

    private fun composition(reference: MediaImageReference, alt: String = "Producto"): MediaComposition =
        (MediaComposition.create(
            listOf(ProductMediaCompositionEntry(reference, 0, true, AltText.fromWire(alt)!!)),
            emptyList(),
        ) as MediaCompositionValidationResult.Valid).composition

    private fun fixture() = MediaCommandFixture.create(postgres, "media_scope")
}
