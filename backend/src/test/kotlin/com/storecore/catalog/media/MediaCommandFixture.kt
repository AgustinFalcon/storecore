package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.JdbcMediaCommandRepository
import com.storecore.catalog.infrastructure.media.JdbcMediaCompositionRepository
import com.storecore.catalog.infrastructure.media.SpringExternalMediaIoGuard
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.security.MessageDigest
import java.sql.DriverManager
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

internal class MutableMediaClock(private var current: Instant) : Clock() {
    override fun getZone(): ZoneId = ZoneId.of("UTC")
    override fun withZone(zone: ZoneId): Clock = this
    override fun instant(): Instant = current
    fun advance(duration: Duration) { current = current.plus(duration) }
}

/** One migrated database per test; every repository runs as `storecore_runtime`. */
internal class MediaCommandFixture private constructor(
    private val postgres: PostgreSQLContainer<*>,
    val url: String,
) {
    val jdbc = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
    val clock = MutableMediaClock(Instant.now())
    val objects = TestMediaObjectStore(clock)
    val bytes = "media-recovery-fixture".toByteArray()
    val owner = user("owner")
    val foreignOwner = user("foreign")
    val commands = runtimeCommands()

    fun runtimeConnection(): java.sql.Connection = DriverManager.getConnection(url, postgres.username, postgres.password).apply {
        createStatement().use { it.execute("SET ROLE storecore_runtime"); it.execute("SET statement_timeout='10s'") }
    }

    fun runtimeCommands() = JdbcMediaCommandRepository(JdbcTemplate(SingleConnectionDataSource(runtimeConnection(), true)))

    fun runtimeComposition() = JdbcMediaCompositionRepository(
        JdbcTemplate(SingleConnectionDataSource(runtimeConnection(), true)),
        setOf("images.example.test"),
    )

    fun uploadWorker(store: MediaObjectStore = objects) = MediaUploadWorker(commands, store, SpringExternalMediaIoGuard(), clock)

    fun recoveryWorker(store: MediaObjectStore = objects, repository: MediaCommandRepository = commands) =
        MediaUploadRecoveryWorker(repository, store, SpringExternalMediaIoGuard(), clock)

    fun normalizedBytes() = NormalizedMediaBytes.from(bytes)!!

    fun metadata(command: MediaUploadRegistration) = MediaObjectMetadata.create(command.format, command.dimensions)!!

    fun draft(owner: MediaOwnerId = this.owner, target: MediaProductId? = null): CatalogMediaDraftId {
        val id = CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
        assertEquals(MediaDraftRegistrationResult.Created, commands.registerDraft(
            MediaDraftRegistration(id, owner, target, clock.instant().plus(Duration.ofHours(1))),
        ))
        return id
    }

    fun command(
        draftId: CatalogMediaDraftId,
        owner: MediaOwnerId = this.owner,
        target: MediaProductId? = null,
        uploadId: UploadId = UploadId.fromWire(UUID.randomUUID().toString())!!,
    ): MediaUploadRegistration = MediaUploadRegistration.create(
        draftId, owner, target, uploadId, MediaAssetId.fromWire(UUID.randomUUID().toString())!!,
        ContentDigest.fromWire("b".repeat(64))!!, ContentDigest.fromWire(sha256(bytes))!!, MediaFormat.WEBP,
        PixelDimensions.fromWire(800, 600)!!, MediaByteSize.fromWire(bytes.size.toLong())!!,
        ProviderObjectKey.fromWire("catalog/${draftId.value}/${uploadId.value}/${UUID.randomUUID()}")!!,
    )!!

    /** Same scope and payload with a client-regenerated assetId/key, as after a lost response. */
    fun reissued(command: MediaUploadRegistration) = command(command.draftId, command.ownerId, command.targetProductId, command.uploadId)

    fun registered(owner: MediaOwnerId = this.owner, target: MediaProductId? = null): MediaUploadRegistration {
        val command = command(draft(owner, target), owner, target)
        assertTrue(commands.registerUpload(command) is MediaUploadRegistrationResult.Created)
        return command
    }

    fun stored(owner: MediaOwnerId = this.owner, target: MediaProductId? = null): MediaUploadRegistration {
        val command = registered(owner, target)
        assertTrue(uploadWorker().executeRegistered(command, normalizedBytes(), UUID.randomUUID()) is MediaUploadRun.Stored)
        return command
    }

    fun claim(command: MediaUploadRegistration, lease: Duration = Duration.ofSeconds(1)): MediaUploadLease =
        (commands.claimUpload(command.ownerId, command.draftId, command.uploadId, UUID.randomUUID(), clock.instant(), lease)
            as MediaUploadClaimResult.Claimed).lease

    fun product(): MediaProductId = MediaProductId.fromWire(jdbc.queryForObject(
        "INSERT INTO products(name,slug,base_price) VALUES ('Media product',?,100) RETURNING id",
        Long::class.java, "media-${UUID.randomUUID()}",
    ))!!

    fun variant(productId: MediaProductId): MediaVariantId = MediaVariantId.fromWire(jdbc.queryForObject(
        "INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Base') RETURNING id",
        Long::class.java, productId.value, "SKU-${UUID.randomUUID()}",
    ))!!

    fun legacyImage(productId: MediaProductId): ProductImageId = ProductImageId.fromWire(jdbc.queryForObject(
        """INSERT INTO product_images(product_id,url,sort_order,is_primary,source_kind,alt_text)
           VALUES (?,'https://images.example.test/legacy.jpg',0,true,'LEGACY_URL','Legacy') RETURNING id""",
        Long::class.java, productId.value,
    ))!!

    fun assetState(command: MediaUploadRegistration) = MediaAssetState.fromWire(
        jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, command.assetId.value),
    )

    fun commandState(command: MediaUploadRegistration) = MediaCommandState.fromWire(
        jdbc.queryForObject("SELECT state FROM media_upload_commands WHERE asset_id=?", String::class.java, command.assetId.value),
    )

    fun failureCode(command: MediaUploadRegistration) = MediaFailureCode.fromWire(
        jdbc.queryForObject("SELECT failure_code FROM media_assets WHERE id=?", String::class.java, command.assetId.value),
    )

    fun fence(command: MediaUploadRegistration): Long =
        jdbc.queryForObject("SELECT fence_version FROM media_upload_commands WHERE asset_id=?", Long::class.java, command.assetId.value)!!

    fun count(table: String): Int = jdbc.queryForObject("SELECT count(*) FROM $table", Int::class.java)!!

    private fun user(label: String) = MediaOwnerId.fromWire(jdbc.queryForObject(
        "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','Media','Owner') RETURNING id",
        Long::class.java, "$label-${UUID.randomUUID()}@example.test",
    ))!!

    companion object {
        fun create(postgres: PostgreSQLContainer<*>, prefix: String): MediaCommandFixture {
            val database = "${prefix}_${UUID.randomUUID().toString().replace("-", "")}"
            postgres.createConnection("").use { it.createStatement().use { statement -> statement.execute("CREATE DATABASE $database") } }
            val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/$database"
            Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            return MediaCommandFixture(postgres, url)
        }

        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
