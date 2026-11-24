package com.storecore.notification.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.CsrfInvalid
import com.storecore.identity.infrastructure.web.*
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

data class NotificationEmailPreferenceDto(val state: String,val revision: String,val categories: List<String>,val severities: List<String>,val boundEmailVersion: String?)
data class NotificationEmailPreferenceViewDto(val preference: NotificationEmailPreferenceDto,val verified: Boolean,val readiness: String)
data class NotificationEmailPreferenceReceiptDto(val commandId: String,val outcome: String,val preference: NotificationEmailPreferenceDto,val recordedAt: String)
internal object NotificationEmailPreferenceHttpMapper {
    fun preference(value: NotificationEmailPreference)=NotificationEmailPreferenceDto(value.state.wire,value.revision.value.toString(),value.filters?.categories()?.map { it.wire } ?: emptyList(),value.filters?.severities()?.map { it.wire } ?: emptyList(),value.binding?.version?.toString())
    fun view(value: NotificationEmailPreferenceView)=NotificationEmailPreferenceViewDto(preference(value.preference),value.verified,value.readiness.wire)
    fun receipt(value: NotificationEmailPreferenceReceipt)=NotificationEmailPreferenceReceiptDto(value.commandId.value.toString(),value.outcome.wire,preference(value.preference),value.recordedAt.toString())
}

@RestController
@RequestMapping("/api/v1/user/notifications/email-preferences")
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class NotificationEmailPreferencesController(private val preferences: NotificationEmailPreferencePort,private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,mapper: ObjectMapper) {
    private val translator=NotificationHttpTranslator(mapper)
    @GetMapping fun get(http: HttpServletRequest): ResponseEntity<BaseResponse<NotificationEmailPreferenceViewDto>> {
        val actor=auth.operatorOrAdmin(http)
        return when(val result=preferences.get(actor)) {
            is NotificationEmailPreferenceResult.Current -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(NotificationEmailPreferenceHttpMapper.view(result.view)))
            NotificationEmailPreferenceResult.Unauthorized -> throw AuthorizationDenied()
            else -> throw NotificationUnavailable()
        }
    }
    @PostMapping("/commands") fun command(http: HttpServletRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor=auth.operatorOrAdmin(http)
        val media=runCatching { MediaType.parseMediaType(http.contentType ?: "") }.getOrNull() ?: throw NotificationUnsupportedMedia()
        if(!media.type.equals("application",true) || !media.subtype.equals("json",true) || (media.charset!=null && media.charset!=Charsets.UTF_8)) throw NotificationUnsupportedMedia()
        val keys=http.getHeaders("Idempotency-Key").toList(); if(keys.size!=1) throw InvalidNotificationRequest()
        val csrf=http.getHeader(RequestAuth.CSRF_HEADER) ?: throw CsrfInvalid()
        val command=translator.emailPreference(keys.single(),http.inputStream.readNBytes(8193))
        val mutation=mutations.execute(actor,csrf) {
            preferences.execute(actor,command).also {
                if(it==NotificationEmailPreferenceResult.Unauthorized) throw AuthorizationDenied()
                if(it==NotificationEmailPreferenceResult.Unknown) throw NotificationUnavailable()
            }
        }
        val result=mutation.value
        val status=if(result is NotificationEmailPreferenceResult.Recorded && result.receipt.outcome==NotificationEmailPreferenceOutcome.APPLIED) 200 else 409
        val body: BaseResponse<Any?> = when(result) {
            is NotificationEmailPreferenceResult.Recorded -> BaseResponse.ok(NotificationEmailPreferenceHttpMapper.receipt(result.receipt),status)
            NotificationEmailPreferenceResult.IdempotencyConflict -> BaseResponse(status,null,"Request rejected","IDEMPOTENCY_CONFLICT",false,null)
            else -> throw NotificationUnavailable()
        }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER,mutation.nextCsrf).body(body)
    }
}
