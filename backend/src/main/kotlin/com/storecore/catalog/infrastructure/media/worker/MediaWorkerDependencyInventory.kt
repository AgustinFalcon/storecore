package com.storecore.catalog.infrastructure.media.worker

import java.io.InputStream
import java.nio.file.Path
import java.util.Properties
import java.util.zip.ZipFile

enum class MediaWorkerDependency(val coordinate: String) {
    KOTLIN_STDLIB("org.jetbrains.kotlin:kotlin-stdlib"),
    JETBRAINS_ANNOTATIONS("org.jetbrains:annotations"),
    TWELVEMONKEYS_COMMON_IMAGE("com.twelvemonkeys.common:common-image"),
    TWELVEMONKEYS_COMMON_IO("com.twelvemonkeys.common:common-io"),
    TWELVEMONKEYS_COMMON_LANG("com.twelvemonkeys.common:common-lang"),
    TWELVEMONKEYS_IMAGEIO_CORE("com.twelvemonkeys.imageio:imageio-core"),
    TWELVEMONKEYS_IMAGEIO_JPEG("com.twelvemonkeys.imageio:imageio-jpeg"),
    TWELVEMONKEYS_IMAGEIO_METADATA("com.twelvemonkeys.imageio:imageio-metadata"),
    TWELVEMONKEYS_IMAGEIO_WEBP("com.twelvemonkeys.imageio:imageio-webp"),
    UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): MediaWorkerDependency =
            entries.firstOrNull { it.coordinate == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

class MediaWorkerDependencyInventory private constructor(val modules: List<MediaWorkerModuleVersion>) {
    companion object {
        const val RESOURCE = "META-INF/storecore/media-worker-runtime.properties"
        private const val FORMAT_VERSION = "1"
        private val expected = MediaWorkerDependency.entries.filterNot { it == MediaWorkerDependency.UNKNOWN }.toSet()
        private val versionPattern = Regex("[A-Za-z0-9][A-Za-z0-9._+\\-]{0,63}")

        fun fromJar(jar: Path): MediaWorkerDependencyInventory? = runCatching {
            ZipFile(jar.toFile()).use { zip ->
                val entry = zip.getEntry(RESOURCE) ?: return null
                zip.getInputStream(entry).use(::decode)
            }
        }.getOrNull()

        internal fun decode(source: InputStream): MediaWorkerDependencyInventory? = runCatching {
            val properties = Properties().apply { load(source) }
            if (properties.getProperty("inventory.version") != FORMAT_VERSION) return null
            val count = properties.getProperty("module.count")?.toIntOrNull() ?: return null
            if (count != expected.size) return null
            val seen = mutableSetOf<MediaWorkerDependency>()
            val modules = (0 until count).map { index ->
                val dependency = MediaWorkerDependency.fromWire(properties.getProperty("module.$index.coordinate")?.trim())
                val version = properties.getProperty("module.$index.version")?.trim().orEmpty()
                if (dependency == MediaWorkerDependency.UNKNOWN || !seen.add(dependency) || !versionPattern.matches(version)) return null
                MediaWorkerModuleVersion(dependency.coordinate, version)
            }
            if (seen != expected) return null
            MediaWorkerDependencyInventory(modules.sortedBy { it.module })
        }.getOrNull()
    }
}
