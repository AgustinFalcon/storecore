package com.storecore.platform.infrastructure.web

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1")
class HealthController {
    @GetMapping("/health")
    fun health(): ResponseEntity<HealthResponse> =
        ResponseEntity.ok(HealthResponse(status = "UP"))
}

data class HealthResponse(val status: String)
