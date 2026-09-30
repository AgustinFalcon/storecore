package com.storecore.shared.http

sealed class HttpCode(val status: Int) {
    val label: String get() = when (this) {
        Ok -> "OK"
        Created -> "CREATED"
        BadRequest -> "BAD_REQUEST"
        Unauthorized -> "UNAUTHORIZED"
        Forbidden -> "FORBIDDEN"
        NotFound -> "NOT_FOUND"
        Conflict -> "CONFLICT"
        Gone -> "GONE"
        Unprocessable -> "UNPROCESSABLE"
        TooManyRequests -> "TOO_MANY_REQUESTS"
        Internal -> "INTERNAL"
        ServiceUnavailable -> "SERVICE_UNAVAILABLE"
        is Unknown -> "UNKNOWN"
    }

    data object Ok : HttpCode(200)
    data object Created : HttpCode(201)
    data object BadRequest : HttpCode(400)
    data object Unauthorized : HttpCode(401)
    data object Forbidden : HttpCode(403)
    data object NotFound : HttpCode(404)
    data object Conflict : HttpCode(409)
    data object Gone : HttpCode(410)
    data object Unprocessable : HttpCode(422)
    data object TooManyRequests : HttpCode(429)
    data object Internal : HttpCode(500)
    data object ServiceUnavailable : HttpCode(503)
    class Unknown(raw: Int) : HttpCode(if (raw in 100..599) raw else 500)

    companion object {
        fun fromWire(raw: Int?): HttpCode = when (raw) {
            200 -> Ok
            201 -> Created
            400 -> BadRequest
            401 -> Unauthorized
            403 -> Forbidden
            404 -> NotFound
            409 -> Conflict
            410 -> Gone
            422 -> Unprocessable
            429 -> TooManyRequests
            500 -> Internal
            503 -> ServiceUnavailable
            else -> Unknown(raw ?: 0)
        }
    }
}
