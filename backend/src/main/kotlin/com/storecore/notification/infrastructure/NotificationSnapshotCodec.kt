package com.storecore.notification.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import org.springframework.jdbc.core.RowMapper
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

internal class NotificationAlertRowMapper : RowMapper<NotificationAlert> {
    override fun mapRow(rs: ResultSet, rowNum: Int): NotificationAlert = NotificationAlert.restore(
        requireNotNull(NotificationId.fromWire(rs.getObject("id", UUID::class.java))),
        NotificationSourceIdentity.restore(NotificationSourceType.fromWire(rs.getString("source_type")), requireNotNull(NotificationSourceId.fromWire(rs.getString("source_id")))),
        requireNotNull(NotificationFingerprint.fromWire(rs.getString("fingerprint"))), NotificationCategory.fromWire(rs.getString("category")),
        NotificationSeverity.fromWire(rs.getString("severity")), NotificationLifecycle.fromWire(rs.getString("lifecycle")),
        requireNotNull(NotificationRevision.fromWire(rs.getLong("revision"))),
    )
}

/** Historical snapshots cross one strict JSON boundary; future/malformed results never become success. */
internal class NotificationSnapshotCodec(private val mapper: ObjectMapper) {
    fun encode(alert: NotificationAlert): String = mapper.writeValueAsString(linkedMapOf(
        "id" to alert.id.value.toString(), "sourceType" to alert.source.type.wire, "sourceId" to alert.source.id.value,
        "fingerprint" to alert.fingerprint.value, "category" to alert.category.wire, "severity" to alert.severity.wire,
        "lifecycle" to alert.lifecycle.wire, "revision" to alert.revision.value.toString(),
    ))
    fun decode(raw: String): NotificationAlert? = runCatching {
        val node = mapper.readTree(raw)
        require(node.isObject && node.fieldNames().asSequence().toSet() == setOf("id","sourceType","sourceId","fingerprint","category","severity","lifecycle","revision"))
        require(node.elements().asSequence().all(JsonNode::isTextual))
        fun text(key: String) = node.get(key).textValue()
        val revision = requireNotNull(text("revision").toLongOrNull()); require(revision.toString() == text("revision"))
        NotificationAlert.restore(requireNotNull(NotificationId.fromWire(UUID.fromString(text("id")))),
            requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.fromWire(text("sourceType")), requireNotNull(NotificationSourceId.fromWire(text("sourceId"))))),
            requireNotNull(NotificationFingerprint.fromWire(text("fingerprint"))), NotificationCategory.fromWire(text("category")),
            NotificationSeverity.fromWire(text("severity")), NotificationLifecycle.fromWire(text("lifecycle")), requireNotNull(NotificationRevision.fromWire(revision)))
            .also { require(it.category != NotificationCategory.UNKNOWN && it.severity != NotificationSeverity.UNKNOWN && it.lifecycle != NotificationLifecycle.UNKNOWN) }
    }.getOrNull()

    fun receipt(command: NotificationCommand.ChangeLifecycle, hash: String, outcome: String, raw: String): NotificationCommandReceipt? {
        if (command.payloadHash().value != hash) return null
        val before = decode(raw) ?: return null
        val result = before.apply(command)
        val typed = NotificationReceiptOutcome.fromWire(outcome)
        if (typed == NotificationReceiptOutcome.UNKNOWN || NotificationReceiptOutcome.of(result) != typed) return null
        return NotificationCommandReceipt(command, before, result)
    }
}
