package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.media.worker.supply.ImageIoProviderRecord
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.OpenOption
import java.nio.file.Path
import java.nio.file.StandardOpenOption.READ
import java.security.MessageDigest
import java.util.zip.ZipFile

enum class MediaWorkerOperatingSystem(val wire: String) {
    LINUX("linux"),
    WINDOWS("windows"),
    UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): MediaWorkerOperatingSystem = when {
            raw.equals("linux", ignoreCase = true) -> LINUX
            raw?.startsWith("windows", ignoreCase = true) == true -> WINDOWS
            else -> UNKNOWN
        }
    }
}

enum class MediaWorkerArchitecture(val wire: String) {
    AMD64("amd64"),
    ARM64("arm64"),
    UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): MediaWorkerArchitecture = when (raw?.lowercase()) {
            "amd64", "x86_64" -> AMD64
            "arm64", "aarch64" -> ARM64
            else -> UNKNOWN
        }
    }
}

data class MediaWorkerModuleVersion(val module: String, val version: String)

class MediaWorkerRuntimeFingerprint private constructor(
    val javaVendor: String,
    val javaRuntimeVersion: String,
    val operatingSystem: MediaWorkerOperatingSystem,
    val architecture: MediaWorkerArchitecture,
    val moduleVersions: List<MediaWorkerModuleVersion>,
    val providers: Set<ImageIoProviderRecord>,
    jarSha256: ByteArray,
    profileSha256: ByteArray,
    corpusSha256: Map<String, ByteArray>,
) {
    private val jarDigest = jarSha256.copyOf()
    private val profileDigest = profileSha256.copyOf()
    private val corpusDigests = corpusSha256.mapValues { it.value.copyOf() }

    fun jarSha256(): ByteArray = jarDigest.copyOf()
    fun profileSha256(): ByteArray = profileDigest.copyOf()
    fun corpusSha256(): Map<String, ByteArray> = corpusDigests.mapValues { it.value.copyOf() }

    companion object {
        const val JAR_PATH_PROPERTY = "storecore.media.worker.jar"
        private const val JPEG_QUALITY_WIRE = "0.90"
        const val JPEG_QUALITY = 0.90f
        const val JPEG_PROGRESSIVE = false
        const val JPEG_CHROMA = "4:4:4"
        const val PNG_COMPRESSION = "Deflate"
        private const val PNG_COMPRESSION_QUALITY_WIRE = "0.0"
        const val PNG_COMPRESSION_QUALITY = 0.0f
        const val TWELVEMONKEYS_VERSION = "3.15.3"

        private val expectedDependencies = listOf(
            "org.jetbrains.kotlin" to "kotlin-stdlib",
            "org.jetbrains" to "annotations",
            "com.twelvemonkeys.common" to "common-image",
            "com.twelvemonkeys.common" to "common-io",
            "com.twelvemonkeys.common" to "common-lang",
            "com.twelvemonkeys.imageio" to "imageio-core",
            "com.twelvemonkeys.imageio" to "imageio-jpeg",
            "com.twelvemonkeys.imageio" to "imageio-metadata",
            "com.twelvemonkeys.imageio" to "imageio-webp",
        )
        private val profilePolicy = listOf(
            "profile=IMAGE_IO_V1",
            "inputs=JPEG,PNG,WEBP_STATIC",
            "output=JPEG_OPAQUE,PNG_ALPHA",
            "color=sRGB_8_BIT_ONLY",
            "metadata=STRIP_ALL",
            "orientation=EXIF_1_TO_8",
            "jpeg.quality=$JPEG_QUALITY_WIRE",
            "jpeg.progressive=$JPEG_PROGRESSIVE",
            "jpeg.chroma=$JPEG_CHROMA",
            "png.compression=$PNG_COMPRESSION",
            "png.compressionQuality=$PNG_COMPRESSION_QUALITY_WIRE",
        ).joinToString("\n")
        private val builtInCorpus = linkedMapOf(
            "jpeg-framing-v1" to "storecore:self-test:jpeg:ffd8-ffd9:v1".toByteArray(),
            "png-framing-v1" to "storecore:self-test:png:signature-iend:v1".toByteArray(),
            "webp-framing-v1" to "storecore:self-test:webp:riff-webp:v1".toByteArray(),
        )

        fun hashPackagedJar(path: Path?): ByteArray? {
            val jar = resolveExecutingJar(path, null) ?: return null
            return hashRegularFile(jar)
        }

        internal fun profileDigest(): ByteArray = sha256(profilePolicy.toByteArray())
        internal fun corpusDigests(): Map<String, ByteArray> = builtInCorpus.mapValues { sha256(it.value) }

        fun create(
            javaVendor: String?,
            javaRuntimeVersion: String?,
            operatingSystem: MediaWorkerOperatingSystem,
            architecture: MediaWorkerArchitecture,
            moduleVersions: List<MediaWorkerModuleVersion>?,
            providers: Set<ImageIoProviderRecord>?,
            jarSha256: ByteArray?,
            profileSha256: ByteArray?,
            corpusSha256: Map<String, ByteArray>?,
        ): MediaWorkerRuntimeFingerprint? {
            if (javaVendor.isNullOrBlank() || javaRuntimeVersion.isNullOrBlank()) return null
            if (!allowedPlatform(operatingSystem, architecture)) return null
            if (moduleVersions.isNullOrEmpty() || moduleVersions.map { it.module }.toSet().size != moduleVersions.size) return null
            if (moduleVersions.any { it.module.isBlank() || it.version.isBlank() }) return null
            if (providers.isNullOrEmpty()) return null
            if (jarSha256?.size != 32 || profileSha256?.size != 32 || corpusSha256.isNullOrEmpty()) return null
            if (corpusSha256.any { it.key.isBlank() || it.value.size != 32 }) return null
            return MediaWorkerRuntimeFingerprint(
                javaVendor,
                javaRuntimeVersion,
                operatingSystem,
                architecture,
                moduleVersions.sortedBy { it.module },
                providers.toSet(),
                jarSha256.copyOf(),
                profileSha256.copyOf(),
                corpusSha256.mapValues { it.value.copyOf() },
            )
        }

        private fun allowedPlatform(os: MediaWorkerOperatingSystem, arch: MediaWorkerArchitecture): Boolean =
            (os == MediaWorkerOperatingSystem.LINUX && arch in setOf(MediaWorkerArchitecture.AMD64, MediaWorkerArchitecture.ARM64)) ||
                (os == MediaWorkerOperatingSystem.WINDOWS && arch == MediaWorkerArchitecture.AMD64)

        internal fun resolveExecutingJar(codeSource: Path?, configured: Path?): Path? {
            val packagedSource = packagedJarPath(codeSource) ?: return packagedJarPath(configured)
            val configuredJar = configured?.let(::packagedJarPath)
            if (configured != null && configuredJar != packagedSource) return null
            return packagedSource
        }

        private fun packagedJarPath(path: Path?): Path? {
            if (path == null) return null
            val absolute = runCatching { path.toAbsolutePath().normalize() }.getOrNull() ?: return null
            if (!absolute.fileName.toString().endsWith(".jar")) return null
            if (!Files.isRegularFile(absolute, NOFOLLOW_LINKS) || Files.isSymbolicLink(absolute)) return null
            if (!hasZipMagic(absolute) || !hasZipEntries(absolute)) return null
            return absolute
        }

        private fun hasZipMagic(path: Path): Boolean = runCatching {
            Files.newByteChannel(path, setOf<OpenOption>(READ, NOFOLLOW_LINKS)).use { channel ->
                val header = ByteArray(4)
                if (channel.read(java.nio.ByteBuffer.wrap(header)) != 4) return false
                header[0] == 0x50.toByte() &&
                    header[1] == 0x4B.toByte() &&
                    (
                        (header[2] == 0x03.toByte() && header[3] == 0x04.toByte()) ||
                            (header[2] == 0x05.toByte() && header[3] == 0x06.toByte()) ||
                            (header[2] == 0x07.toByte() && header[3] == 0x08.toByte())
                    )
            }
        }.getOrDefault(false)

        private fun hasZipEntries(path: Path): Boolean = runCatching {
            ZipFile(path.toFile()).use { zip -> zip.entries().hasMoreElements() }
        }.getOrDefault(false)

        private fun hashRegularFile(path: Path): ByteArray? = runCatching {
            val digest = MessageDigest.getInstance("SHA-256")
            Files.newInputStream(path, NOFOLLOW_LINKS).use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                }
            }
            digest.digest()
        }.getOrNull()

        internal fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)
    }
}
