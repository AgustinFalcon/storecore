package com.storecore.catalog.infrastructure.media.worker

import java.nio.file.Path

class MediaBrokerHelperCommand private constructor(val executable: Path) {
    fun argv(): List<String> = listOf(executable.toString())

    companion object {
        const val FILE_NAME = "storecore-media-broker-client"

        fun create(executable: Path?): MediaBrokerHelperCommand? {
            val absolute = executable?.takeIf { it.isAbsolute }?.normalize() ?: return null
            if (absolute.fileName.toString() != FILE_NAME) return null
            return MediaBrokerHelperCommand(absolute)
        }
    }
}
