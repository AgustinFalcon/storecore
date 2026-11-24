package com.storecore.notification.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.application.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.infrastructure.web.*
import com.storecore.notification.application.*
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
@RequestMapping("/api/v1/user/notifications")
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class NotificationController(private val queries: NotificationQueryService,private val persistence: NotificationPersistenceService,
    private val auth: RequestAuth,private val mutations: IdentityMutationCoordinator,mapper: ObjectMapper) {
    private val translator=NotificationHttpTranslator(mapper)
    @GetMapping fun list(http: HttpServletRequest,@RequestParam params: MultiValueMap<String,String>): ResponseEntity<BaseResponse<NotificationInboxDto>> {
        val actor=auth.operatorOrAdmin(http)
        val value=found(queries.list(actor,translator.query(params)))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(NotificationHttpMapper.page(value)))
    }
    @GetMapping("/{alertId}") fun detail(http: HttpServletRequest,@PathVariable alertId: String): ResponseEntity<BaseResponse<NotificationAlertDto>> {
        val actor=auth.operatorOrAdmin(http)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(NotificationHttpMapper.alert(found(queries.detail(actor,translator.alertId(alertId))))))
    }
    @GetMapping("/{alertId}/commands/{commandId}") fun receipt(http: HttpServletRequest,@PathVariable alertId: String,@PathVariable commandId: String): ResponseEntity<BaseResponse<NotificationReceiptDto>> {
        val actor=auth.admin(http)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(NotificationHttpMapper.receipt(found(queries.receipt(actor,translator.alertId(alertId),translator.commandId(commandId))))))
    }
    @PostMapping("/{alertId}/commands") fun command(http: HttpServletRequest,@PathVariable alertId: String): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor=auth.admin(http)
        val media=runCatching { MediaType.parseMediaType(http.contentType ?: "") }.getOrNull() ?: throw NotificationUnsupportedMedia()
        if(!media.type.equals("application",true) || !media.subtype.equals("json",true) || (media.charset!=null && media.charset!=Charsets.UTF_8)) throw NotificationUnsupportedMedia()
        val keys=http.getHeaders("Idempotency-Key").toList()
        if(keys.size!=1) throw InvalidNotificationRequest()
        val csrf=http.getHeader(RequestAuth.CSRF_HEADER) ?: throw CsrfInvalid()
        val request=translator.command(alertId,keys.single(),http.inputStream.readNBytes(8193))
        val mutation=mutations.execute(actor,csrf) {
            persistence.execute(actor,request).also { result ->
                // An unavailable result must roll back CSRF rotation as well: clients may retry 503.
                if(result==NotificationExecutionResult.Unknown) throw NotificationUnavailable()
                if(result==NotificationExecutionResult.Unauthorized) throw AuthorizationDenied()
            }
        }
        val result=mutation.value
        val status=when(result) {
            is NotificationExecutionResult.Recorded -> if(NotificationReceiptOutcome.of(result.receipt.result)==NotificationReceiptOutcome.APPLIED) 200 else
                if(NotificationReceiptOutcome.of(result.receipt.result)==NotificationReceiptOutcome.UNKNOWN) 503 else 409
            NotificationExecutionResult.IdempotencyConflict -> 409
            NotificationExecutionResult.Missing -> 404
            NotificationExecutionResult.Unauthorized -> 403
            NotificationExecutionResult.Unknown -> 503
        }
        val body: BaseResponse<Any?> = when(result) {
            is NotificationExecutionResult.Recorded -> BaseResponse.ok(NotificationHttpMapper.receipt(result.receipt),status)
            else -> BaseResponse(status,null,"Request rejected",when(result) {
                NotificationExecutionResult.IdempotencyConflict -> "IDEMPOTENCY_CONFLICT"
                NotificationExecutionResult.Missing -> "RESOURCE_NOT_FOUND"
                NotificationExecutionResult.Unauthorized -> "AUTHORIZATION_DENIED"
                else -> "NOTIFICATION_UNAVAILABLE"
            },false,null)
        }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER,mutation.nextCsrf).body(body)
    }
    private fun <T> found(result: NotificationQueryResult<T>): T = when(result) {
        is NotificationQueryResult.Found -> result.value
        NotificationQueryResult.Unauthorized -> throw AuthorizationDenied()
        NotificationQueryResult.Missing -> throw ResourceNotFound()
        NotificationQueryResult.Unknown -> throw NotificationUnavailable()
    }
}

@Component
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class NotificationNoStoreFilter : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean = request.requestURI!="/api/v1/user/notifications" && !request.requestURI.startsWith("/api/v1/user/notifications/")
    override fun doFilterInternal(request: HttpServletRequest,response: HttpServletResponse,chain: FilterChain) {
        response.setHeader("Cache-Control","no-store")
        val guarded=object : HttpServletResponseWrapper(response) {
            override fun addHeader(name: String,value: String?) {
                if(name.equals("Cache-Control",true)) super.setHeader(name,"no-store") else super.addHeader(name,value)
            }
            override fun setHeader(name: String,value: String?) {
                super.setHeader(name,if(name.equals("Cache-Control",true)) "no-store" else value)
            }
            override fun reset() { super.reset(); super.setHeader("Cache-Control","no-store") }
        }
        chain.doFilter(request,guarded)
    }
}

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=[NotificationController::class])
class NotificationExceptionAdvice {
    @ExceptionHandler(InvalidNotificationRequest::class) fun invalid()=error(400,"REQUEST_VALIDATION_FAILED")
    @ExceptionHandler(NotificationUnsupportedMedia::class) fun media()=error(415,"UNSUPPORTED_MEDIA_TYPE")
    @ExceptionHandler(NotificationUnavailable::class,DataAccessException::class) fun unavailable()=error(503,"NOTIFICATION_UNAVAILABLE")
    @ExceptionHandler(AuthenticationFailed::class) fun unauthenticated()=error(401,"AUTHENTICATION_FAILED")
    @ExceptionHandler(AuthorizationDenied::class) fun unauthorized()=error(403,"AUTHORIZATION_DENIED")
    @ExceptionHandler(CsrfInvalid::class) fun csrf()=error(403,"CSRF_INVALID")
    @ExceptionHandler(ResourceNotFound::class) fun missing()=error(404,"RESOURCE_NOT_FOUND")
    private fun error(status: Int,code: String): ResponseEntity<BaseResponse<Nothing>> = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse(status,null,"Request rejected",code,false,null))
}
