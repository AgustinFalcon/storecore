package com.storecore.overview.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import com.storecore.overview.application.OverviewPeriodInvalid
import com.storecore.overview.application.OverviewTimezoneUnavailable
import com.storecore.overview.application.OverviewUseCases
import com.storecore.overview.domain.OverviewPeriod
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/user/overview")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class OverviewController(private val overview: OverviewUseCases, private val auth: RequestAuth) {
    @GetMapping
    fun read(http: HttpServletRequest, @RequestParam period: String): ResponseEntity<BaseResponse<Any?>> {
        auth.operatorOrAdmin(http)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(BaseResponse.ok<Any?>(overview.read(OverviewPeriod.fromWire(period))))
    }
}

@RestControllerAdvice(assignableTypes = [OverviewController::class])
class OverviewExceptionAdvice {
    @ExceptionHandler(OverviewPeriodInvalid::class)
    fun invalidPeriod() = error(HttpStatus.BAD_REQUEST, "OVERVIEW_PERIOD_INVALID")

    @ExceptionHandler(OverviewTimezoneUnavailable::class)
    fun unavailableTimezone() = error(HttpStatus.SERVICE_UNAVAILABLE, "OVERVIEW_TIMEZONE_UNAVAILABLE")

    private fun error(status: HttpStatus, code: String) = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, false, null))
}
