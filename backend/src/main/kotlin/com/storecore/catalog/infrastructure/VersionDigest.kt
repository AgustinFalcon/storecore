package com.storecore.catalog.infrastructure

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64

object VersionDigest {
    fun sha256Url(parts: List<String>): String {
        val sha = MessageDigest.getInstance("SHA-256")
        parts.forEach { part ->
            val bytes = part.toByteArray(StandardCharsets.UTF_8)
            sha.update(ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(bytes.size).array())
            sha.update(bytes)
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(sha.digest())
    }
}
