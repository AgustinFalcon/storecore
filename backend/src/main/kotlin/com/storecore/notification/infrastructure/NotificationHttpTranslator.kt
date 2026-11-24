package com.storecore.notification.infrastructure

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import org.springframework.util.MultiValueMap
import java.util.UUID

internal class InvalidNotificationRequest : RuntimeException()
internal class NotificationUnavailable : RuntimeException()
internal class NotificationUnsupportedMedia : RuntimeException()

internal class NotificationHttpTranslator(mapper: ObjectMapper) {
    private val json=mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
    private val unsigned=Regex("0|[1-9][0-9]*")
    fun uuid(raw: String?): UUID = runCatching { UUID.fromString(raw) }.getOrNull()
        ?.takeIf { it!=UUID(0,0) && it.toString()==raw } ?: throw InvalidNotificationRequest()
    fun alertId(raw: String) = requireNotNull(NotificationId.fromWire(uuid(raw)))
    fun commandId(raw: String?) = requireNotNull(NotificationCommandId.fromWire(uuid(raw)))
    fun command(alert: String,key: String?,raw: ByteArray): NotificationLifecycleRequest {
        // 500 supplementary code points can occupy 6000 bytes when JSON uses surrogate escapes.
        if(raw.size>8192) throw InvalidNotificationRequest()
        val text=raw.toString(Charsets.UTF_8)
        if(!text.toByteArray(Charsets.UTF_8).contentEquals(raw)) throw InvalidNotificationRequest()
        val node=runCatching { json.readTree(text) }.getOrNull() ?: throw InvalidNotificationRequest()
        if(!node.isObject || node.fieldNames().asSequence().toSet()!=setOf("operation","expectedRevision","reason") ||
            node.elements().asSequence().any { !it.isTextual }) throw InvalidNotificationRequest()
        val step=NotificationTransitionStep.fromWire(node.path("operation").textValue())
        if(step==NotificationTransitionStep.Unknown) throw InvalidNotificationRequest()
        val revision=node.path("expectedRevision").textValue()
        if(!unsigned.matches(revision)) throw InvalidNotificationRequest()
        return NotificationLifecycleRequest(commandId(key),alertId(alert),
            NotificationRevision.fromWire(revision.toLongOrNull()) ?: throw InvalidNotificationRequest(),step,
            NotificationReason.fromWire(node.path("reason").textValue()) ?: throw InvalidNotificationRequest())
    }
    fun query(params: MultiValueMap<String,String>): NotificationInboxQuery {
        if(params.keys.any { it !in setOf("page","size","severity","category","lifecycle","source") } || params.values.any { it.size!=1 }) throw InvalidNotificationRequest()
        fun integer(key: String,default: Int): Int {
            val value=params.getFirst(key) ?: return default
            if(!unsigned.matches(value)) throw InvalidNotificationRequest()
            return value.toIntOrNull() ?: throw InvalidNotificationRequest()
        }
        return NotificationInboxQuery.create(integer("page",0),integer("size",25),
            params.getFirst("severity")?.let(NotificationSeverity::fromWire),params.getFirst("category")?.let(NotificationCategory::fromWire),
            params.getFirst("lifecycle")?.let(NotificationLifecycle::fromWire),params.getFirst("source")?.let(NotificationSourceType::fromWire))
            ?: throw InvalidNotificationRequest()
    }
}

data class NotificationSnapshotDto(val id: String,val sourceType: String,val sourceId: String,val fingerprint: String,
    val category: String,val severity: String,val lifecycle: String,val revision: String)
data class NotificationAlertDto(val notification: NotificationSnapshotDto,val createdAt: String,val availableOperations: List<String>)
data class NotificationInboxDto(val items: List<NotificationAlertDto>,val total: Long,val page: Int,val size: Int,val hasMore: Boolean)
data class NotificationReceiptDto(val commandId: String,val alertId: String,val actorId: String,val operation: String,
    val expectedRevision: String,val reason: String,val occurredAt: String,val outcome: String,
    val before: NotificationSnapshotDto,val after: NotificationSnapshotDto?,val currentRevision: String)

internal object NotificationHttpMapper {
    fun snapshot(alert: NotificationAlert)=NotificationSnapshotDto(alert.id.value.toString(),alert.source.type.wire,alert.source.id.value,
        alert.fingerprint.value,alert.category.wire,alert.severity.wire,alert.lifecycle.wire,alert.revision.value.toString())
    fun alert(read: NotificationReadAlert)=NotificationAlertDto(snapshot(read.alert),read.createdAt.toString(),
        if(read.mayTransition) read.alert.lifecycle.availableSteps().map { it.wire } else emptyList())
    fun page(page: NotificationInboxPage)=NotificationInboxDto(page.items.map(::alert),page.total,page.query.page,page.query.size,page.hasMore)
    fun receipt(receipt: NotificationCommandReceipt): NotificationReceiptDto {
        val outcome=NotificationReceiptOutcome.of(receipt.result)
        if(outcome==NotificationReceiptOutcome.UNKNOWN) throw NotificationUnavailable()
        val after=(receipt.result as? NotificationCommandResult.Applied)?.alert
        return NotificationReceiptDto(receipt.command.id.value.toString(),receipt.command.notificationId.value.toString(),receipt.command.actorId.value.toString(),
            receipt.command.step.wire,receipt.command.expectedRevision.value.toString(),receipt.command.reason.value,receipt.command.occurredAt.toString(),outcome.wire,
            snapshot(receipt.before),after?.let(::snapshot),(after?.revision ?: receipt.before.revision).value.toString())
    }
}
