package com.storecore.notification.domain

import java.net.URI
import java.time.Duration
import java.time.Instant

enum class NotificationEmailReadiness(val wire: String) {
    UNCONFIGURED("UNCONFIGURED"), UNAVAILABLE("UNAVAILABLE"), READY("READY"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class NotificationEmailPreferenceState(val wire: String) {
    DISABLED("DISABLED"), ENABLED("ENABLED"), INVALIDATED("INVALIDATED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class NotificationEmailOperation(val wire: String) {
    ENABLE("ENABLE"), DISABLE("DISABLE"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class NotificationCommandFamily(val wire: String) {
    LIFECYCLE("LIFECYCLE"), EMAIL_PREFERENCE("EMAIL_PREFERENCE"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class NotificationEmailTemplate(val wire: String) {
    OPERATIONAL_ALERT_V1("OPERATIONAL_ALERT_V1"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class NotificationEmailDeliveryState(val wire: String) {
    PENDING("PENDING"), LEASED("LEASED"), RETRY("RETRY"), SENT("SENT"), UNCERTAIN("UNCERTAIN"), DEAD("DEAD"), CANCELLED("CANCELLED"), UNKNOWN("UNKNOWN");
    val terminal: Boolean get()=this in setOf(SENT,UNCERTAIN,DEAD,CANCELLED)
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
enum class NotificationEmailDeliveryReason(val wire: String) {
    NONE("NONE"),EXPIRED("EXPIRED"),INVALIDATED("INVALIDATED"),LEASE_LOST("LEASE_LOST"),PRE_DATA_FAILURE("PRE_DATA_FAILURE"),PERMANENT_FAILURE("PERMANENT_FAILURE"),UNCERTAIN("UNCERTAIN"),UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
sealed class NotificationEmailDeliveryStep {
    abstract fun accepts(before: NotificationEmailDeliveryState,after: NotificationEmailDeliveryState): Boolean
    data object Lease : NotificationEmailDeliveryStep() {
        override fun accepts(before: NotificationEmailDeliveryState,after: NotificationEmailDeliveryState)=before in setOf(NotificationEmailDeliveryState.PENDING,NotificationEmailDeliveryState.RETRY) && after==NotificationEmailDeliveryState.LEASED
    }
    data object Cancel : NotificationEmailDeliveryStep() {
        override fun accepts(before: NotificationEmailDeliveryState,after: NotificationEmailDeliveryState)=before in setOf(NotificationEmailDeliveryState.PENDING,NotificationEmailDeliveryState.RETRY) && after==NotificationEmailDeliveryState.CANCELLED
    }
    data object Settle : NotificationEmailDeliveryStep() {
        override fun accepts(before: NotificationEmailDeliveryState,after: NotificationEmailDeliveryState)=before==NotificationEmailDeliveryState.LEASED && after in setOf(NotificationEmailDeliveryState.SENT,NotificationEmailDeliveryState.RETRY,NotificationEmailDeliveryState.UNCERTAIN,NotificationEmailDeliveryState.DEAD,NotificationEmailDeliveryState.CANCELLED)
    }
}

class NotificationEmailFilters private constructor(categories: Set<NotificationCategory>,severities: Set<NotificationSeverity>) {
    private val categoryValues=categories.toSet(); private val severityValues=severities.toSet()
    fun categories()=categoryValues.sortedBy { it.wire }
    fun severities()=severityValues.sortedBy { it.wire }
    fun includes(alert: NotificationAlert)=alert.category in categoryValues && alert.severity in severityValues
    companion object {
        private val allowedCategories=setOf(NotificationCategory.STOCK,NotificationCategory.ORDER,NotificationCategory.PAYMENT,NotificationCategory.RETURN,NotificationCategory.INTEGRATION)
        private val allowedSeverities=setOf(NotificationSeverity.WARNING,NotificationSeverity.CRITICAL)
        fun create(categories: List<NotificationCategory>,severities: List<NotificationSeverity>): NotificationEmailFilters? =
            if(categories.isEmpty() || severities.isEmpty() || categories.distinct().size!=categories.size || severities.distinct().size!=severities.size ||
                categories.any { it !in allowedCategories } || severities.any { it !in allowedSeverities }) null
            else NotificationEmailFilters(categories.toSet(),severities.toSet())
    }
}
class NotificationEmailBinding private constructor(val version: Long,val digest: NotificationFingerprint) {
    companion object { fun create(version: Long,digest: String?): NotificationEmailBinding? =
        if(version<=0) null else NotificationFingerprint.fromWire(digest)?.let { NotificationEmailBinding(version,it) } }
}
class NotificationEmailPreference private constructor(val state: NotificationEmailPreferenceState,val revision: NotificationRevision,
    val filters: NotificationEmailFilters?,val binding: NotificationEmailBinding?) {
    companion object {
        fun disabled()=NotificationEmailPreference(NotificationEmailPreferenceState.DISABLED,requireNotNull(NotificationRevision.fromWire(0)),null,null)
        fun restore(state: NotificationEmailPreferenceState,revision: NotificationRevision,filters: NotificationEmailFilters?,binding: NotificationEmailBinding?): NotificationEmailPreference? =
            if(state==NotificationEmailPreferenceState.UNKNOWN || ((state==NotificationEmailPreferenceState.ENABLED)!=(filters!=null && binding!=null)) ||
                (state!=NotificationEmailPreferenceState.ENABLED && (filters!=null || binding!=null))) null
            else NotificationEmailPreference(state,revision,filters,binding)
    }
}
class NotificationEmailPreferenceCommand private constructor(val id: NotificationCommandId,val operation: NotificationEmailOperation,
    val expectedRevision: NotificationRevision,val filters: NotificationEmailFilters?) {
    fun payloadHash(actor: NotificationActorId)=lengthFramedSha256(listOf("notification-email-preference-command-v1",operation.wire,actor.value.toString(),expectedRevision.value.toString(),
        (filters?.categories()?.size ?: 0).toString())+(filters?.categories()?.map { it.wire } ?: emptyList())+
        listOf((filters?.severities()?.size ?: 0).toString())+(filters?.severities()?.map { it.wire } ?: emptyList()))
    companion object { fun create(id: NotificationCommandId,operation: NotificationEmailOperation,expectedRevision: NotificationRevision,filters: NotificationEmailFilters?): NotificationEmailPreferenceCommand? =
        if(operation==NotificationEmailOperation.UNKNOWN || (operation==NotificationEmailOperation.ENABLE)!=(filters!=null)) null
        else NotificationEmailPreferenceCommand(id,operation,expectedRevision,filters) }
}
enum class NotificationEmailPreferenceOutcome(val wire: String) {
    APPLIED("APPLIED"), REVISION_CONFLICT("REVISION_CONFLICT"), EMAIL_UNVERIFIED("EMAIL_UNVERIFIED"), REVISION_EXHAUSTED("REVISION_EXHAUSTED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}
class NotificationEmailPreferenceDecision(val outcome: NotificationEmailPreferenceOutcome,val preference: NotificationEmailPreference)
object ApplyNotificationEmailPreference {
    fun apply(before: NotificationEmailPreference,command: NotificationEmailPreferenceCommand,binding: NotificationEmailBinding?): NotificationEmailPreferenceDecision {
        if(before.revision!=command.expectedRevision) return NotificationEmailPreferenceDecision(NotificationEmailPreferenceOutcome.REVISION_CONFLICT,before)
        if(command.operation==NotificationEmailOperation.ENABLE && binding==null) return NotificationEmailPreferenceDecision(NotificationEmailPreferenceOutcome.EMAIL_UNVERIFIED,before)
        val next=before.revision.next() ?: return NotificationEmailPreferenceDecision(NotificationEmailPreferenceOutcome.REVISION_EXHAUSTED,before)
        val state=if(command.operation==NotificationEmailOperation.ENABLE) NotificationEmailPreferenceState.ENABLED else NotificationEmailPreferenceState.DISABLED
        return NotificationEmailPreferenceDecision(NotificationEmailPreferenceOutcome.APPLIED,requireNotNull(NotificationEmailPreference.restore(state,next,command.filters,
            binding.takeIf { state==NotificationEmailPreferenceState.ENABLED })))
    }
}

sealed interface NotificationEmailTransportResult {
    data object Sent : NotificationEmailTransportResult
    data object ProvenPreDataFailure : NotificationEmailTransportResult
    data object PermanentPreDataFailure : NotificationEmailTransportResult
    data object Uncertain : NotificationEmailTransportResult
    data object Unknown : NotificationEmailTransportResult
}
fun interface NotificationEmailJitter { fun factor(): Double }
class NotificationEmailSettlement(val state: NotificationEmailDeliveryState,val retryAt: Instant?)
class NotificationEmailRetryPolicy(private val jitter: NotificationEmailJitter=NotificationEmailJitter { 1.0 }) {
    fun settle(result: NotificationEmailTransportResult,attempt: Int,now: Instant): NotificationEmailSettlement = when(result) {
        NotificationEmailTransportResult.Sent -> NotificationEmailSettlement(NotificationEmailDeliveryState.SENT,null)
        NotificationEmailTransportResult.PermanentPreDataFailure -> NotificationEmailSettlement(NotificationEmailDeliveryState.DEAD,null)
        NotificationEmailTransportResult.ProvenPreDataFailure -> retry(attempt,now)
        NotificationEmailTransportResult.Uncertain,NotificationEmailTransportResult.Unknown -> NotificationEmailSettlement(NotificationEmailDeliveryState.UNCERTAIN,null)
    }
    fun retry(attempt: Int,now: Instant): NotificationEmailSettlement {
        if(attempt !in 1..4) return NotificationEmailSettlement(NotificationEmailDeliveryState.DEAD,null)
        val factor=jitter.factor()
        require(factor.isFinite() && factor in 0.8..1.2)
        val seconds=listOf(30L,120L,600L,1800L)[attempt-1]
        return NotificationEmailSettlement(NotificationEmailDeliveryState.RETRY,now.plusMillis((seconds*1000*factor).toLong()))
    }
    companion object { val TTL: Duration=Duration.ofHours(24); val LEASE: Duration=Duration.ofSeconds(60); const val MAX_ATTEMPTS=5 }
}
class NotificationEmailCenterLink private constructor(val value: String) {
    companion object {
        fun fromOrigin(raw: String): NotificationEmailCenterLink? = runCatching {
            val origin=URI(raw)
            require(origin.scheme in setOf("https","http") && !origin.host.isNullOrBlank() && origin.userInfo==null && origin.query==null && origin.fragment==null && origin.path.isNullOrEmpty())
            NotificationEmailCenterLink(URI(origin.scheme,null,origin.host,origin.port,"/user/notifications",null,null).toASCIIString())
        }.getOrNull()
    }
}
class NotificationEmailRendered(val subject: String,val body: String)
object RenderNotificationEmail {
    fun render(template: NotificationEmailTemplate,link: NotificationEmailCenterLink): NotificationEmailRendered? = when(template) {
        NotificationEmailTemplate.OPERATIONAL_ALERT_V1 -> NotificationEmailRendered("Nueva notificación operativa","Revisá el centro de notificaciones: ${link.value}")
        NotificationEmailTemplate.UNKNOWN -> null
    }
}
