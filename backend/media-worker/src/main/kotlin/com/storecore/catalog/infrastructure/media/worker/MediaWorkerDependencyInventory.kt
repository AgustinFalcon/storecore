package com.storecore.catalog.infrastructure.media.worker

import java.io.InputStream
import java.util.Properties

internal enum class PackagedMediaWorkerDependency(val coordinate: String) {
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
        fun fromWire(raw: String?): PackagedMediaWorkerDependency =
            entries.firstOrNull { it.coordinate == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

internal class MediaWorkerDependencyInventory private constructor(
    val modules: List<MediaWorkerModuleVersion>,
) {
    companion object {
        const val RESOURCE = "META-INF/storecore/media-worker-runtime.properties"
        private const val FORMAT_VERSION = "1"
        private val versionPattern = Regex("[A-Za-z0-9][A-Za-z0-9._+\\-]{0,63}")
        private val expected = PackagedMediaWorkerDependency.entries
            .filterNot { it == PackagedMediaWorkerDependency.UNKNOWN }
            .toSet()

        fun load(
            resource: () -> InputStream? = {
                MediaWorkerDependencyInventory::class.java.classLoader.getResourceAsStream(RESOURCE)
            },
        ): MediaWorkerDependencyInventory? = resource()?.use(::decode)

        internal fun decode(source: InputStream): MediaWorkerDependencyInventory? = runCatching {
            val properties = Properties().apply { load(source) }
            if (properties.getProperty("inventory.version") != FORMAT_VERSION) return null
            val count = properties.getProperty("module.count")?.toIntOrNull() ?: return null
            if (count != expected.size) return null
            val seen = mutableSetOf<PackagedMediaWorkerDependency>()
            val modules = (0 until count).map { index ->
                val dependency = PackagedMediaWorkerDependency.fromWire(properties.getProperty("module.$index.coordinate")?.trim())
                val version = properties.getProperty("module.$index.version")?.trim().orEmpty()
                if (dependency == PackagedMediaWorkerDependency.UNKNOWN || !seen.add(dependency) || !versionPattern.matches(version)) return null
                MediaWorkerModuleVersion(dependency.coordinate, version)
            }
            if (seen != expected) return null
            MediaWorkerDependencyInventory(modules.sortedBy { it.module })
        }.getOrNull()
    }
}
