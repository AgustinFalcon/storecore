package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.media.worker.supply.ImageIoProviderId
import com.storecore.catalog.media.worker.supply.ImageIoProviderRecord
import com.storecore.catalog.media.worker.supply.ImageIoSpiCategory
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.util.UUID

class MediaWorkerSelfTestRequest private constructor(
    val challengeId: UUID,
    nonce: ByteArray,
) {
    val version = MediaWorkerProtocolVersion.V1
    val operation = MediaWorkerOperation.SELF_TEST
    private val nonceValue = nonce.copyOf()

    fun nonce(): ByteArray = nonceValue.copyOf()

    companion object {
        fun create(challengeId: UUID?, nonce: ByteArray?): MediaWorkerSelfTestRequest? =
            if (challengeId == null || nonce?.size != SELF_TEST_NONCE_BYTES) null
            else MediaWorkerSelfTestRequest(challengeId, nonce.copyOf())
    }
}

class MediaWorkerSelfTestReport private constructor(
    val challengeId: UUID,
    nonce: ByteArray,
    val fingerprint: MediaWorkerRuntimeFingerprint,
) {
    private val nonceValue = nonce.copyOf()
    fun nonce(): ByteArray = nonceValue.copyOf()

    companion object {
        fun create(
            challengeId: UUID?,
            nonce: ByteArray?,
            fingerprint: MediaWorkerRuntimeFingerprint?,
        ): MediaWorkerSelfTestReport? =
            if (challengeId == null || nonce?.size != SELF_TEST_NONCE_BYTES || fingerprint == null) null
            else MediaWorkerSelfTestReport(challengeId, nonce.copyOf(), fingerprint)
    }
}

sealed interface MediaWorkerSelfTestResult {
    class Observed private constructor(val report: MediaWorkerSelfTestReport) : MediaWorkerSelfTestResult {
        companion object {
            fun create(report: MediaWorkerSelfTestReport?): Observed? = report?.let(::Observed)
        }
    }
    data object Unavailable : MediaWorkerSelfTestResult
    data object Unknown : MediaWorkerSelfTestResult
}

object MediaWorkerSelfTestCodec {
    fun encodeRequest(request: MediaWorkerSelfTestRequest): ByteArray = frame(SELF_TEST_REQUEST_KIND) {
        writeByte(request.version.code)
        writeByte(request.operation.code)
        writeShort(0)
        writeUuid(request.challengeId)
        write(request.nonce())
    }

    fun decodeRequest(bytes: ByteArray): MediaWorkerSelfTestRequest? = parse(bytes, SELF_TEST_REQUEST_KIND) {
        val version = MediaWorkerProtocolVersion.fromWire(readUnsignedByte())
        val operation = MediaWorkerOperation.fromWire(readUnsignedByte())
        if (readUnsignedShort() != 0 || version != MediaWorkerProtocolVersion.V1 || operation != MediaWorkerOperation.SELF_TEST) {
            return@parse null
        }
        val challenge = readUuid()
        val nonce = readNBytes(SELF_TEST_NONCE_BYTES)
        MediaWorkerSelfTestRequest.create(challenge, nonce)
    }

    fun encodeReport(report: MediaWorkerSelfTestReport): ByteArray = frame(SELF_TEST_RESPONSE_KIND) {
        writeByte(MediaWorkerProtocolVersion.V1.code)
        writeByte(MediaWorkerOperation.SELF_TEST.code)
        writeShort(0)
        writeUuid(report.challengeId)
        write(report.nonce())
        writeDigest(report.fingerprint.jarSha256())
        writeString(report.fingerprint.javaVendor)
        writeString(report.fingerprint.javaRuntimeVersion)
        writeString(report.fingerprint.operatingSystem.wire)
        writeString(report.fingerprint.architecture.wire)
        writeShort(report.fingerprint.moduleVersions.size)
        report.fingerprint.moduleVersions.sortedBy { it.module }.forEach {
            writeString(it.module)
            writeString(it.version)
        }
        writeShort(report.fingerprint.providers.size)
        report.fingerprint.providers.sortedWith(compareBy({ it.category.wire }, { it.provider.wire })).forEach {
            writeString(it.category.wire)
            writeString(it.provider.wire)
        }
        writeDigest(report.fingerprint.profileSha256())
        val corpus = report.fingerprint.corpusSha256()
        writeShort(corpus.size)
        corpus.toSortedMap().forEach { (name, digest) ->
            writeString(name)
            writeDigest(digest)
        }
    }

    fun decodeReport(bytes: ByteArray): MediaWorkerSelfTestReport? = parse(bytes, SELF_TEST_RESPONSE_KIND) {
        val version = MediaWorkerProtocolVersion.fromWire(readUnsignedByte())
        val operation = MediaWorkerOperation.fromWire(readUnsignedByte())
        if (readUnsignedShort() != 0 || version != MediaWorkerProtocolVersion.V1 || operation != MediaWorkerOperation.SELF_TEST) {
            return@parse null
        }
        val challenge = readUuid()
        val nonce = readNBytes(SELF_TEST_NONCE_BYTES)
        val jarDigest = readDigest() ?: return@parse null
        val vendor = readString() ?: return@parse null
        val runtime = readString() ?: return@parse null
        val os = MediaWorkerOperatingSystem.fromWire(readString())
        val arch = MediaWorkerArchitecture.fromWire(readString())
        if (os == MediaWorkerOperatingSystem.UNKNOWN || arch == MediaWorkerArchitecture.UNKNOWN) return@parse null
        val modules = readRecords(MAX_MODULES) {
            val module = readString() ?: return@readRecords null
            val moduleVersion = readString() ?: return@readRecords null
            MediaWorkerModuleVersion(module, moduleVersion)
        } ?: return@parse null
        val providers = readRecords(MAX_PROVIDERS) {
            val category = ImageIoSpiCategory.fromWire(readString())
            val provider = ImageIoProviderId.fromWire(readString())
            if (category == ImageIoSpiCategory.UNKNOWN || provider == ImageIoProviderId.UNKNOWN) null
            else ImageIoProviderRecord(category, provider)
        }?.toSet() ?: return@parse null
        val profileDigest = readDigest() ?: return@parse null
        val corpusRecords = readRecords(MAX_CORPUS) {
            val name = readString() ?: return@readRecords null
            val digest = readDigest() ?: return@readRecords null
            name to digest
        } ?: return@parse null
        if (corpusRecords.map { it.first }.toSet().size != corpusRecords.size) return@parse null
        val fingerprint = MediaWorkerRuntimeFingerprint.create(
            vendor, runtime, os, arch, modules, providers, jarDigest, profileDigest, corpusRecords.toMap(),
        ) ?: return@parse null
        MediaWorkerSelfTestReport.create(challenge, nonce, fingerprint)
    }

    private fun frame(kind: Int, writer: DataOutputStream.() -> Unit): ByteArray {
        val payload = ByteArrayOutputStream().also { DataOutputStream(it).use { out -> out.writer() } }.toByteArray()
        require(payload.size in 1..MAX_SELF_TEST_FRAME_BYTES)
        return ByteArrayOutputStream().also { raw ->
            DataOutputStream(raw).use {
                it.writeInt(SELF_TEST_MAGIC)
                it.writeByte(kind)
                it.writeByte(0)
                it.writeShort(0)
                it.writeInt(payload.size)
                it.write(payload)
            }
        }.toByteArray()
    }

    private fun <T> parse(bytes: ByteArray, expectedKind: Int, reader: DataInputStream.() -> T?): T? = runCatching {
        if (bytes.size !in 13..(MAX_SELF_TEST_FRAME_BYTES + 12)) return null
        val outer = DataInputStream(ByteArrayInputStream(bytes))
        if (outer.readInt() != SELF_TEST_MAGIC || outer.readUnsignedByte() != expectedKind) return null
        if (outer.readUnsignedByte() != 0 || outer.readUnsignedShort() != 0) return null
        val length = outer.readInt()
        if (length !in 1..MAX_SELF_TEST_FRAME_BYTES || length != outer.available()) return null
        val payload = outer.readNBytes(length)
        val input = DataInputStream(ByteArrayInputStream(payload))
        input.reader()?.takeIf { input.available() == 0 }
    }.getOrNull()

    private fun DataOutputStream.writeUuid(value: UUID) {
        writeLong(value.mostSignificantBits)
        writeLong(value.leastSignificantBits)
    }

    private fun DataInputStream.readUuid(): UUID = UUID(readLong(), readLong())

    private fun DataOutputStream.writeDigest(value: ByteArray) {
        require(value.size == SELF_TEST_DIGEST_BYTES)
        write(value)
    }

    private fun DataInputStream.readDigest(): ByteArray? =
        readNBytes(SELF_TEST_DIGEST_BYTES).takeIf { it.size == SELF_TEST_DIGEST_BYTES }

    private fun DataOutputStream.writeString(value: String) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        require(bytes.size in 1..MAX_SELF_TEST_STRING_BYTES)
        writeShort(bytes.size)
        write(bytes)
    }

    private fun DataInputStream.readString(): String? {
        val length = readUnsignedShort()
        if (length !in 1..MAX_SELF_TEST_STRING_BYTES || length > available()) return null
        val bytes = readNBytes(length)
        val value = bytes.toString(Charsets.UTF_8)
        return value.takeIf { it.toByteArray(Charsets.UTF_8).contentEquals(bytes) && it.isNotBlank() }
    }

    private fun <T> DataInputStream.readRecords(max: Int, reader: DataInputStream.() -> T?): List<T>? {
        val count = readUnsignedShort()
        if (count !in 1..max) return null
        val result = ArrayList<T>(count)
        repeat(count) { result += reader() ?: return null }
        return result
    }
}

private const val SELF_TEST_MAGIC = 0x53434d57
private const val SELF_TEST_REQUEST_KIND = 1
private const val SELF_TEST_RESPONSE_KIND = 2
private const val SELF_TEST_NONCE_BYTES = 32
private const val SELF_TEST_DIGEST_BYTES = 32
private const val MAX_SELF_TEST_FRAME_BYTES = 16_384
private const val MAX_SELF_TEST_STRING_BYTES = 512
private const val MAX_MODULES = 16
private const val MAX_PROVIDERS = 128
private const val MAX_CORPUS = 32
