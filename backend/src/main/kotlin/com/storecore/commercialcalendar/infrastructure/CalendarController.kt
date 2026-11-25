package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.application.*
import com.storecore.identity.infrastructure.web.*
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpServletResponseWrapper
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.dao.DataAccessException
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.util.MultiValueMap
import org.springframework.web.bind.annotation.*
import org.springframework.web.filter.OncePerRequestFilter

@RestController
@RequestMapping("/api/v1/user/commercial-calendar")
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class CalendarController(private val queries: CalendarQueryService,private val commands: CalendarCommandService,private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,mapper: ObjectMapper,hasher: CalendarHasher) {
    private val translator=CalendarHttpTranslator(mapper,hasher)
    @GetMapping("/events") fun list(http: HttpServletRequest,@RequestParam params: MultiValueMap<String,String>): ResponseEntity<BaseResponse<CalendarPageDto<CalendarEventDto>>> {
        val actor=auth.operatorOrAdmin(http)
        return ok(CalendarHttpMapper.page(found(queries.list(actor,translator.query(params))),CalendarHttpMapper::event))
    }
    @GetMapping("/events/{eventId}") fun detail(http: HttpServletRequest,@PathVariable eventId: String): ResponseEntity<BaseResponse<CalendarEventDto>> {
        val actor=auth.operatorOrAdmin(http); noQuery(http)
        return ok(CalendarHttpMapper.event(found(queries.detail(actor,translator.eventId(eventId)))))
    }
    @GetMapping("/commands/{commandId}") fun createReceipt(http: HttpServletRequest,@PathVariable commandId: String): ResponseEntity<BaseResponse<CalendarReceiptDto>> {
        val actor=auth.admin(http); noQuery(http)
        val receipt=receiptFound(commands.receipt(actor,translator.commandId(commandId)))
        if(receipt.operation!=CalendarOperation.CREATE) throw ResourceNotFound()
        return ok(CalendarHttpMapper.receipt(receipt))
    }
    @GetMapping("/events/{eventId}/commands/{commandId}") fun eventReceipt(http: HttpServletRequest,@PathVariable eventId: String,@PathVariable commandId: String): ResponseEntity<BaseResponse<CalendarReceiptDto>> {
        val actor=auth.admin(http); noQuery(http)
        return ok(CalendarHttpMapper.receipt(receiptFound(commands.receipt(actor,translator.commandId(commandId),translator.eventId(eventId)))))
    }
    @GetMapping("/events/{eventId}/audit") fun audit(http: HttpServletRequest,@PathVariable eventId: String,@RequestParam params: MultiValueMap<String,String>): ResponseEntity<BaseResponse<CalendarPageDto<CalendarReceiptDto>>> {
        val actor=auth.admin(http)
        return ok(CalendarHttpMapper.page(found(queries.audit(actor,translator.eventId(eventId),translator.paging(params))),CalendarHttpMapper::receipt))
    }
    @GetMapping("/reminder-switch") fun reminderSwitch(http: HttpServletRequest): ResponseEntity<BaseResponse<CalendarReminderSwitchDto>> {
        val actor=auth.admin(http); noQuery(http)
        val value=found(queries.reminderSwitch(actor))
        return ok(CalendarReminderSwitchDto(value.state.wire,value.revision.value.toString(),CalendarReminderReadiness.UNAVAILABLE.wire))
    }
    @PostMapping("/events") fun create(http: HttpServletRequest): ResponseEntity<BaseResponse<Any?>> {
        val actor=mutationActor(http)
        val request=translator.create(key(http),body(http))
        val mutation=mutations.execute(actor,csrf(http)) { commands.create(actor,request).also(::verifyResult) }
        return commandResponse(mutation.value,mutation.nextCsrf)
    }
    @PostMapping("/events/{eventId}/commands") fun change(http: HttpServletRequest,@PathVariable eventId: String): ResponseEntity<BaseResponse<Any?>> {
        val actor=mutationActor(http)
        val request=translator.change(eventId,key(http),body(http))
        val mutation=mutations.execute(actor,csrf(http)) { commands.change(actor,request).also(::verifyResult) }
        return commandResponse(mutation.value,mutation.nextCsrf)
    }
    @PostMapping("/events/{eventId}/preflights") fun preflight(http: HttpServletRequest,@PathVariable eventId: String): ResponseEntity<BaseResponse<Any?>> {
        val actor=mutationActor(http)
        val request=translator.preflight(eventId,key(http),body(http))
        val mutation=mutations.execute(actor,csrf(http)) { commands.preflight(actor,request).also {
            if(it==CalendarPreflightResult.Unknown || it is CalendarPreflightResult.Recorded && (it.outcome==CalendarOutcome.UNKNOWN || it.preflight?.issues?.contains(CalendarPreflightIssue.UNKNOWN)==true)) throw CalendarUnavailable()
            if(it==CalendarPreflightResult.Unauthorized) throw AuthorizationDenied()
        } }
        val value=mutation.value
        val status=when(value) { is CalendarPreflightResult.Recorded -> if(value.outcome==CalendarOutcome.APPLIED) 200 else 409; CalendarPreflightResult.IdempotencyConflict -> 409; CalendarPreflightResult.Missing -> 404; else -> throw CalendarUnavailable() }
        val result: BaseResponse<Any?> = when(value) { is CalendarPreflightResult.Recorded -> BaseResponse.ok(CalendarHttpMapper.preflight(value),status); else -> rejected(status,if(value==CalendarPreflightResult.Missing) "RESOURCE_NOT_FOUND" else "IDEMPOTENCY_CONFLICT") }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER,mutation.nextCsrf).body(result)
    }
    private fun noQuery(http: HttpServletRequest) { if(http.parameterMap.isNotEmpty()) throw InvalidCalendarRequest() }
    private fun mutationActor(http: HttpServletRequest): com.storecore.identity.domain.InternalUserPrincipal {
        auth.requireSameOrigin(http); val actor=auth.admin(http); noQuery(http)
        val media=runCatching { MediaType.parseMediaType(http.contentType ?: "") }.getOrNull() ?: throw CalendarUnsupportedMedia()
        if(!media.type.equals("application",true) || !media.subtype.equals("json",true) || media.charset!=null && media.charset!=Charsets.UTF_8) throw CalendarUnsupportedMedia()
        return actor
    }
    private fun key(http: HttpServletRequest): String { val values=http.getHeaders("Idempotency-Key").toList(); if(values.size!=1) throw InvalidCalendarRequest(); return values.single() }
    private fun csrf(http: HttpServletRequest)=http.getHeader(RequestAuth.CSRF_HEADER) ?: throw CsrfInvalid()
    private fun body(http: HttpServletRequest)=http.inputStream.readNBytes(CalendarHttpTranslator.MAX_BYTES+1)
    private fun verifyResult(result: CalendarPersistenceResult) {
        if(result==CalendarPersistenceResult.Unknown || result is CalendarPersistenceResult.Recorded && (result.receipt.outcome==CalendarOutcome.UNKNOWN || result.receipt.operation==CalendarOperation.UNKNOWN)) throw CalendarUnavailable()
        if(result==CalendarPersistenceResult.Unauthorized) throw AuthorizationDenied()
    }
    private fun commandResponse(value: CalendarPersistenceResult,csrf: String): ResponseEntity<BaseResponse<Any?>> {
        val status=when(value) { is CalendarPersistenceResult.Recorded -> if(value.receipt.outcome!=CalendarOutcome.APPLIED) 409 else if(value.receipt.operation==CalendarOperation.CREATE) 201 else 200; CalendarPersistenceResult.Missing -> 404; CalendarPersistenceResult.IdempotencyConflict -> 409; else -> throw CalendarUnavailable() }
        val result: BaseResponse<Any?> = when(value) { is CalendarPersistenceResult.Recorded -> BaseResponse.ok(CalendarHttpMapper.receipt(value.receipt),status); else -> rejected(status,if(value==CalendarPersistenceResult.Missing) "RESOURCE_NOT_FOUND" else "IDEMPOTENCY_CONFLICT") }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER,csrf).body(result)
    }
    private fun receiptFound(value: CalendarPersistenceResult): CalendarReceipt=when(value) { is CalendarPersistenceResult.Recorded -> value.receipt; CalendarPersistenceResult.Unauthorized -> throw AuthorizationDenied(); CalendarPersistenceResult.Missing -> throw ResourceNotFound(); else -> throw CalendarUnavailable() }
    private fun <T> found(value: CalendarQueryResult<T>): T=when(value) { is CalendarQueryResult.Found -> value.value; CalendarQueryResult.Unauthorized -> throw AuthorizationDenied(); CalendarQueryResult.Missing -> throw ResourceNotFound(); CalendarQueryResult.Unknown -> throw CalendarUnavailable() }
    private fun <T> ok(value: T): ResponseEntity<BaseResponse<T>> = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(value))
    private fun rejected(status: Int,code: String): BaseResponse<Any?> = BaseResponse(status,null,"Request rejected",code,false,null)
}

@Component
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class CalendarNoStoreFilter: OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest)=request.requestURI!="/api/v1/user/commercial-calendar" && !request.requestURI.startsWith("/api/v1/user/commercial-calendar/")
    override fun doFilterInternal(request: HttpServletRequest,response: HttpServletResponse,chain: FilterChain) {
        response.setHeader("Cache-Control","no-store")
        val wrapped=object: HttpServletResponseWrapper(response) {
            override fun setHeader(name: String,value: String?)=super.setHeader(name,if(name.equals("Cache-Control",true)) "no-store" else value)
            override fun addHeader(name: String,value: String?) { if(name.equals("Cache-Control",true)) super.setHeader(name,"no-store") else super.addHeader(name,value) }
            override fun reset() { super.reset(); super.setHeader("Cache-Control","no-store") }
        }
        chain.doFilter(request,wrapped)
    }
}
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=[CalendarController::class])
class CalendarExceptionAdvice {
    @ExceptionHandler(InvalidCalendarRequest::class) fun invalid()=error(400,"REQUEST_VALIDATION_FAILED")
    @ExceptionHandler(CalendarUnsupportedMedia::class) fun media()=error(415,"UNSUPPORTED_MEDIA_TYPE")
    @ExceptionHandler(CalendarUnavailable::class,DataAccessException::class,IllegalArgumentException::class,IllegalStateException::class,com.fasterxml.jackson.core.JsonProcessingException::class,ClassCastException::class) fun unavailable()=error(503,"CALENDAR_UNAVAILABLE")
    @ExceptionHandler(AuthenticationFailed::class) fun unauthenticated()=error(401,"AUTHENTICATION_FAILED")
    @ExceptionHandler(AuthorizationDenied::class) fun denied()=error(403,"AUTHORIZATION_DENIED")
    @ExceptionHandler(CsrfInvalid::class) fun csrf()=error(403,"CSRF_INVALID")
    @ExceptionHandler(ResourceNotFound::class) fun missing()=error(404,"RESOURCE_NOT_FOUND")
    private fun error(status: Int,code: String): ResponseEntity<BaseResponse<Nothing>> = ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(BaseResponse(status,null,"Request rejected",code,false,null))
}
