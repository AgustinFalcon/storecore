package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import java.time.Duration
import java.time.Instant

class CalendarPageRequest private constructor(val page: Int,val size: Int) {
    val offset get()=page.toLong()*size
    companion object { fun create(page: Int=0,size: Int=25)=if(page<0 || size !in 1..100) null else CalendarPageRequest(page,size) }
}
class CalendarEventQuery private constructor(val from: Instant,val to: Instant,val lifecycle: CalendarLifecycle?,val audience: CalendarAudience?,val paging: CalendarPageRequest) {
    companion object { fun create(from: Instant,to: Instant,lifecycle: CalendarLifecycle?=null,audience: CalendarAudience?=null,paging: CalendarPageRequest=CalendarPageRequest.create()!!)=
        if(!from.isBefore(to) || Duration.between(from,to)>Duration.ofDays(366) || lifecycle==CalendarLifecycle.UNKNOWN || audience==CalendarAudience.UNKNOWN) null else CalendarEventQuery(from,to,lifecycle,audience,paging) }
}
class CalendarPage<T>(val items: List<T>,val total: Long,val paging: CalendarPageRequest) { val hasMore get()=paging.offset+items.size<total }
sealed interface CalendarQueryResult<out T> {
    class Found<T>(val value: T): CalendarQueryResult<T>
    data object Missing: CalendarQueryResult<Nothing>
    data object Unauthorized: CalendarQueryResult<Nothing>
    data object Unknown: CalendarQueryResult<Nothing>
}
interface CalendarQueryPort {
    fun list(actor: InternalUserPrincipal,query: CalendarEventQuery): CalendarQueryResult<CalendarPage<CalendarEvent>>
    fun detail(actor: InternalUserPrincipal,id: CalendarEventId): CalendarQueryResult<CalendarEvent>
    fun audit(actor: InternalUserPrincipal,id: CalendarEventId,paging: CalendarPageRequest): CalendarQueryResult<CalendarPage<CalendarReceipt>>
    fun reminderSwitch(actor: InternalUserPrincipal): CalendarQueryResult<CalendarReminderSwitch>
}
class CalendarQueryService(private val queries: CalendarQueryPort) {
    private fun reader(actor: InternalUserPrincipal)=actor.roles.any { it==InternalRole.ADMIN || it==InternalRole.OPERATOR }
    fun list(actor: InternalUserPrincipal,query: CalendarEventQuery)=if(reader(actor)) queries.list(actor,query) else CalendarQueryResult.Unauthorized
    fun detail(actor: InternalUserPrincipal,id: CalendarEventId)=if(reader(actor)) queries.detail(actor,id) else CalendarQueryResult.Unauthorized
    fun audit(actor: InternalUserPrincipal,id: CalendarEventId,paging: CalendarPageRequest)=if(InternalRole.ADMIN in actor.roles) queries.audit(actor,id,paging) else CalendarQueryResult.Unauthorized
    fun reminderSwitch(actor: InternalUserPrincipal)=if(InternalRole.ADMIN in actor.roles) queries.reminderSwitch(actor) else CalendarQueryResult.Unauthorized
}
class CalendarCommandService(private val persistence: CalendarPersistencePort) {
    fun create(actor: InternalUserPrincipal,request: CalendarCreateRequest)=if(InternalRole.ADMIN in actor.roles) persistence.create(actor,request) else CalendarPersistenceResult.Unauthorized
    fun change(actor: InternalUserPrincipal,request: CalendarChangeRequest)=if(InternalRole.ADMIN in actor.roles && !request.step.operation.system) persistence.change(actor,request) else CalendarPersistenceResult.Unauthorized
    fun preflight(actor: InternalUserPrincipal,request: CalendarPreflightRequest)=if(InternalRole.ADMIN in actor.roles) persistence.preflight(actor,request) else CalendarPreflightResult.Unauthorized
    fun receipt(actor: InternalUserPrincipal,id: CalendarCommandId,event: CalendarEventId?=null)=if(InternalRole.ADMIN in actor.roles) persistence.receipt(actor,id,event) else CalendarPersistenceResult.Unauthorized
}
