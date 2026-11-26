package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.application.StoreCoreCreatedOrderReportRepository
import com.storecore.channelreporting.application.ChannelReportCsvPreparationPort
import com.storecore.channelreporting.application.ChannelReportCsvPreparationRequest
import com.storecore.channelreporting.application.ChannelReportCsvPreparationResult
import com.storecore.channelreporting.application.PreparedChannelReportCsv
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
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
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
import java.io.OutputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicReference

class InvalidChannelReportRequest : RuntimeException()
class ChannelReportUnavailable : RuntimeException()
class ChannelReportPeriodStale : RuntimeException()
class ChannelReportExportTooLarge : RuntimeException()

@RestController
@RequestMapping("/api/v1/user")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ChannelReportController(
    private val reports: StoreCoreCreatedOrderReportRepository,
    private val exports: ChannelReportCsvPreparationPort,
    private val auth: RequestAuth,
    private val origins: ChannelReportReadOriginPolicy,
) {
    @GetMapping("/channel-reports")
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

    @GetMapping("/channel-reports.csv")
    fun export(
        http: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam params: MultiValueMap<String, String>,
    ) {
        origins.requireAdmitted(http)
        val initialActor = auth.operatorOrAdmin(http)
        val query = ChannelReportCsvQuery.fromWire(params) ?: throw InvalidChannelReportRequest()
        val request = ChannelReportCsvPreparationRequest.create(query.fromDate, query.toDateExclusive, query.periodToken)
            ?: throw InvalidChannelReportRequest()
        val artifact = when (val result = exports.prepare(request)) {
            is ChannelReportCsvPreparationResult.Prepared -> result.artifact
            ChannelReportCsvPreparationResult.InvalidPeriod -> throw InvalidChannelReportRequest()
            ChannelReportCsvPreparationResult.StalePeriod -> throw ChannelReportPeriodStale()
            ChannelReportCsvPreparationResult.TooLarge -> throw ChannelReportExportTooLarge()
            ChannelReportCsvPreparationResult.SourceUnavailable -> throw ChannelReportUnavailable()
        }
        val finalActor = try {
            auth.operatorOrAdmin(http)
        } catch (failure: RuntimeException) {
            artifact.close()
            throw failure
        }
        if (finalActor.userId != initialActor.userId || finalActor.sessionId != initialActor.sessionId || finalActor.roles != initialActor.roles) {
            artifact.close()
            throw AuthenticationFailed()
        }
        val transport = PreparedChannelReportCsvTransport.takeOwnership(artifact) ?: throw ChannelReportUnavailable()
        val filename = "storecore-channel-report-${query.fromDate}-to-${query.toDateExclusive}.csv"
        transport.use {
            response.status = HttpServletResponse.SC_OK
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store")
            response.contentType = MediaType("text", "csv", StandardCharsets.UTF_8).toString()
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            it.writeTo(response.outputStream)
        }
    }
}

internal enum class PreparedChannelReportCsvTransportState { READY, WRITING, RELEASED }

internal class PreparedChannelReportCsvTransport private constructor(source: ByteArray) : AutoCloseable {
    private val ownedBytes = AtomicReference<ByteArray?>(source)
    private val state = AtomicReference(PreparedChannelReportCsvTransportState.READY)

    fun writeTo(output: OutputStream) {
        if (!state.compareAndSet(PreparedChannelReportCsvTransportState.READY, PreparedChannelReportCsvTransportState.WRITING)) return
        val bytes = requireNotNull(ownedBytes.getAndSet(null))
        try {
            output.write(bytes)
            output.flush()
        } finally {
            bytes.fill(0)
            state.set(PreparedChannelReportCsvTransportState.RELEASED)
        }
    }

    override fun close() {
        if (state.compareAndSet(PreparedChannelReportCsvTransportState.READY, PreparedChannelReportCsvTransportState.RELEASED)) {
            ownedBytes.getAndSet(null)?.fill(0)
        }
    }

    fun isReleased(): Boolean = state.get() == PreparedChannelReportCsvTransportState.RELEASED

    companion object {
        fun takeOwnership(artifact: PreparedChannelReportCsv): PreparedChannelReportCsvTransport? = try {
            artifact.readBytes()?.let(::PreparedChannelReportCsvTransport)
        } finally {
            artifact.close()
        }
    }
}

@Configuration
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class ChannelReportConfiguration {
    @Bean open fun channelReportRepository(source: DataSource): JdbcStoreCoreCreatedOrderReportRepository =
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

    @ExceptionHandler(ChannelReportPeriodStale::class)
    fun stale() = error(409, "REPORT_PERIOD_STALE")

    @ExceptionHandler(ChannelReportExportTooLarge::class)
    fun tooLarge() = error(422, "REPORT_EXPORT_TOO_LARGE")

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
