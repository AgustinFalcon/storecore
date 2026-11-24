package com.storecore.notification.application

import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.notification.domain.*
import java.time.Instant

class NotificationInboxQuery private constructor(val page: Int, val size: Int,
    val severity: NotificationSeverity?, val category: NotificationCategory?, val lifecycle: NotificationLifecycle?, val source: NotificationSourceType?) {
    val offset: Long get() = page.toLong()*size
    companion object {
        fun create(page: Int=0,size: Int=25,severity: NotificationSeverity?=null,category: NotificationCategory?=null,
                   lifecycle: NotificationLifecycle?=null,source: NotificationSourceType?=null): NotificationInboxQuery? =
            if(page<0 || size !in 1..100 || severity==NotificationSeverity.UNKNOWN || category==NotificationCategory.UNKNOWN ||
                lifecycle==NotificationLifecycle.UNKNOWN || source==NotificationSourceType.UNKNOWN) null
            else NotificationInboxQuery(page,size,severity,category,lifecycle,source)
    }
}
class NotificationReadAlert private constructor(val alert: NotificationAlert,val createdAt: Instant,val mayTransition: Boolean) {
    companion object {
        fun create(alert: NotificationAlert,createdAt: Instant,mayTransition: Boolean=false): NotificationReadAlert? =
            if(alert.source.type==NotificationSourceType.UNKNOWN || alert.category==NotificationCategory.UNKNOWN ||
                alert.severity==NotificationSeverity.UNKNOWN || alert.lifecycle==NotificationLifecycle.UNKNOWN) null
            else NotificationReadAlert(alert,createdAt,mayTransition)
    }
}
class NotificationInboxPage(val items: List<NotificationReadAlert>,val total: Long,val query: NotificationInboxQuery) {
    val hasMore: Boolean get() = query.offset+items.size<total
}
sealed interface NotificationQueryResult<out T> {
    class Found<T>(val value: T) : NotificationQueryResult<T>
    data object Missing : NotificationQueryResult<Nothing>
    data object Unauthorized : NotificationQueryResult<Nothing>
    data object Unknown : NotificationQueryResult<Nothing>
}
interface NotificationQueryPort {
    fun list(actor: InternalUserPrincipal,query: NotificationInboxQuery): NotificationQueryResult<NotificationInboxPage>
    fun detail(actor: InternalUserPrincipal,id: NotificationId): NotificationQueryResult<NotificationReadAlert>
    fun receipt(actor: InternalUserPrincipal,id: NotificationId,commandId: NotificationCommandId): NotificationQueryResult<NotificationCommandReceipt>
}
class NotificationQueryService(private val queries: NotificationQueryPort) {
    fun list(actor: InternalUserPrincipal,query: NotificationInboxQuery) =
        if(canRead(actor)) queries.list(actor,query) else NotificationQueryResult.Unauthorized
    fun detail(actor: InternalUserPrincipal,id: NotificationId) =
        if(canRead(actor)) queries.detail(actor,id) else NotificationQueryResult.Unauthorized
    fun receipt(actor: InternalUserPrincipal,id: NotificationId,commandId: NotificationCommandId) =
        if(InternalRole.ADMIN in actor.roles) queries.receipt(actor,id,commandId) else NotificationQueryResult.Unauthorized
    private fun canRead(actor: InternalUserPrincipal) = actor.roles.any { it==InternalRole.ADMIN || it==InternalRole.OPERATOR }
}
