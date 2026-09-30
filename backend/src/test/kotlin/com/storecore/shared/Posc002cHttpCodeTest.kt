package com.storecore.shared

import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.shared.http.HttpCode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class Posc002cHttpCodeTest {
    @Test
    fun fromWireKeepsKnownCodesAndUnknownDoesNotEchoInvalidStatus() {
        assertEquals(HttpCode.Ok, HttpCode.fromWire(200))
        assertEquals(HttpCode.Created, HttpCode.fromWire(201))
        assertEquals(HttpCode.Conflict, HttpCode.fromWire(409))
        assertEquals(HttpCode.Gone, HttpCode.fromWire(410))
        assertEquals(HttpCode.Unprocessable, HttpCode.fromWire(422))
        assertEquals(HttpCode.TooManyRequests, HttpCode.fromWire(429))
        assertEquals(HttpCode.ServiceUnavailable, HttpCode.fromWire(503))
        assertTrue(HttpCode.fromWire(418) is HttpCode.Unknown)
        assertEquals(418, HttpCode.fromWire(418).status)
        assertEquals(500, HttpCode.fromWire(9).status)
        assertEquals("CONFLICT", HttpCode.Conflict.label)
        assertEquals("UNKNOWN", HttpCode.fromWire(418).label)
    }

    @Test
    fun baseResponseFactoriesKeepHttpStatusEqualToBodyCode() {
        val ok = BaseResponse.ok(mapOf("id" to 1), HttpCode.Ok)
        assertEquals(HttpCode.Ok.status, ok.code)
        assertEquals(1, ok.data!!["id"])
        assertNull(ok.errorCode)
        val created = BaseResponse.created("ready")
        assertEquals(HttpCode.Created.status, created.code)
        val error = BaseResponse.error<Nothing>(HttpCode.Conflict, "COMPANION_ADMIN_COMMAND_ABORTED")
        assertEquals(HttpCode.Conflict.status, error.code)
        assertNull(error.data)
        assertEquals("COMPANION_ADMIN_COMMAND_ABORTED", error.errorCode)
        assertEquals(false, error.retryable)
        assertTrue(!error.traceId.isNullOrBlank())
    }
}
