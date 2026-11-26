package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.application.StoreCoreCreatedOrderReportRepository
import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpServletResponseWrapper
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.dao.DataAccessException
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.transaction.TransactionException
import org.springframework.util.MultiValueMap
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.filter.OncePerRequestFilter
import javax.sql.DataSource

class InvalidChannelReportRequest : RuntimeException()
class ChannelReportUnavailable : RuntimeException()

@RestController
@RequestMapping("/api/v1/user/channel-reports")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ChannelReportController(
    private val reports: StoreCoreCreatedOrderReportRepository,
    private val auth: RequestAuth,
    private val origins: ChannelReportReadOriginPolicy,
) {
    @GetMapping
    fun report(
        http: HttpServletRequest,
        @RequestParam params: MultiValueMap<String, String>,
    ): ResponseEntity<BaseResponse<ChannelReportDto>> {
        origins.requireAdmitted(http)
        val initialActor = auth.operatorOrAdmin(http)
        val query = ChannelReportQuery.fromWire(params) ?: throw InvalidChannelReportRequest()
        val dto = when (val result = reports.read(query.fromDate, query.toDateExclusive)) {
            is StoreCoreCreatedOrderReadResult.Found -> ChannelReportHttpMapper.toDto(result.report)
            StoreCoreCreatedOrderReadResult.InvalidPeriod -> throw InvalidChannelReportRequest()
            StoreCoreCreatedOrderReadResult.TimezoneUnavailable,
            is StoreCoreCreatedOrderReadResult.SourceUnavailable -> throw ChannelReportUnavailable()
        }
        val finalActor = auth.operatorOrAdmin(http)
        if (finalActor.userId != initialActor.userId || finalActor.sessionId != initialActor.sessionId || finalActor.roles != initialActor.roles) {
            throw AuthenticationFailed()
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(dto))
    }
}

@Configuration
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class ChannelReportConfiguration {
    @Bean open fun channelReportRepository(source: DataSource): StoreCoreCreatedOrderReportRepository =
        JdbcStoreCoreCreatedOrderReportRepository(source, Sha256ReportPeriodHasher())

    @Bean open fun channelReportReadOriginPolicy(origin: com.storecore.identity.infrastructure.web.InstallationOrigin) =
        ChannelReportReadOriginPolicy(origin)
}

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ChannelReportNoStoreFilter : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/api/v1/user/channel-reports")

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("Cache-Control", "no-store")
        val wrapped = object : HttpServletResponseWrapper(response) {
            override fun setHeader(name: String, value: String?) =
                super.setHeader(name, if (name.equals("Cache-Control", true)) "no-store" else value)

            override fun addHeader(name: String, value: String?) {
                if (name.equals("Cache-Control", true)) super.setHeader(name, "no-store") else super.addHeader(name, value)
            }

            override fun reset() {
                super.reset()
                super.setHeader("Cache-Control", "no-store")
            }
        }
        chain.doFilter(request, wrapped)
    }
}

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [ChannelReportController::class])
class ChannelReportExceptionAdvice {
    @ExceptionHandler(InvalidChannelReportRequest::class)
    fun invalid() = error(400, "REQUEST_VALIDATION_FAILED")

    @ExceptionHandler(AuthenticationFailed::class)
    fun unauthenticated() = error(401, "AUTHENTICATION_FAILED")

    @ExceptionHandler(AuthorizationDenied::class)
    fun denied() = error(403, "AUTHORIZATION_DENIED")

    @ExceptionHandler(
        ChannelReportUnavailable::class,
        ChannelReportMappingUnavailable::class,
        DataAccessException::class,
        TransactionException::class,
        IllegalArgumentException::class,
        IllegalStateException::class,
        ClassCastException::class,
    )
    fun unavailable() = error(503, "CHANNEL_REPORT_UNAVAILABLE")

    private fun error(status: Int, code: String): ResponseEntity<BaseResponse<Nothing>> =
        ResponseEntity.status(status).cacheControl(CacheControl.noStore())
            .body(BaseResponse(status, null, "Request rejected", code, false, null))
}
