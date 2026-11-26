package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.domain.ReportPeriodHasher
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.security.MessageDigest

class Sha256ReportPeriodHasher : ReportPeriodHasher {
    override fun hash(fields: List<String>): String {
        val framed = ByteArrayOutputStream().also { bytes ->
            DataOutputStream(bytes).use { output ->
                output.writeInt(fields.size)
                fields.forEach { field ->
                    val encoded = field.toByteArray(Charsets.UTF_8)
                    output.writeInt(encoded.size)
                    output.write(encoded)
                }
            }
        }.toByteArray()
        return MessageDigest.getInstance("SHA-256").digest(framed).joinToString("") { "%02x".format(it) }
    }
}
