package com.storecore.commercialcalendar.infrastructure

import com.storecore.commercialcalendar.domain.*
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

class SystemCalendarClock(private val clock: Clock=Clock.systemUTC()): CalendarClock { override fun now()=clock.instant().truncatedTo(ChronoUnit.MICROS) }
class RandomCalendarIds: CalendarIds {
    override fun event()=requireNotNull(CalendarEventId.fromWire(UUID.randomUUID()))
    override fun preflight()=requireNotNull(CalendarPreflightId.fromWire(UUID.randomUUID()))
    override fun occurrence()=requireNotNull(CalendarOccurrenceId.fromWire(UUID.randomUUID()))
}
class Sha256CalendarHasher: CalendarHasher {
    override fun hash(fields: List<String>): CalendarHash {
        val digest=MessageDigest.getInstance("SHA-256")
        fields.forEach { field -> val encoded=field.toByteArray(Charsets.UTF_8); digest.update(ByteBuffer.allocate(4).putInt(encoded.size).array()); digest.update(encoded) }
        return requireNotNull(CalendarHash.fromWire(digest.digest().joinToString("") { "%02x".format(it) }))
    }
    override fun systemCommand(event: CalendarEventId,revision: CalendarRevision,operation: CalendarOperation,boundary: Instant): CalendarCommandId {
        require(operation.system)
        val hash=hash(listOf("calendar-system-command-v1",event.value.toString(),revision.value.toString(),operation.wire,boundary.toString())).value
        val bytes=ByteArray(16) { i -> hash.substring(i*2,i*2+2).toInt(16).toByte() }
        bytes[6]=((bytes[6].toInt() and 15) or 80).toByte(); bytes[8]=((bytes[8].toInt() and 63) or 128).toByte()
        val buffer=ByteBuffer.wrap(bytes)
        return requireNotNull(CalendarCommandId.fromWire(UUID(buffer.long,buffer.long)))
    }
}
