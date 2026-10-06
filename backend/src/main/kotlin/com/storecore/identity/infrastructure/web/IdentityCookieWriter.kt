package com.storecore.identity.infrastructure.web

import com.storecore.identity.domain.IdentityRealm
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Component
import java.time.Duration

@Component
class IdentityCookieWriter {
    fun session(realm: IdentityRealm, token: String): ResponseCookie =
        secure(cookieName(realm), token, Duration.ofHours(12))

    fun expireSession(realm: IdentityRealm): ResponseCookie = expire(cookieName(realm))

    fun challengeBinding(nonce: String): ResponseCookie =
        secure(CHALLENGE_COOKIE, nonce, Duration.ofSeconds(120))

    fun expireChallenge(): ResponseCookie = expire(CHALLENGE_COOKIE)

    private fun secure(name: String, value: String, maxAge: Duration): ResponseCookie =
        ResponseCookie.from(name, value).secure(true).httpOnly(true).sameSite("Lax").path("/").maxAge(maxAge).build()

    private fun expire(name: String): ResponseCookie =
        ResponseCookie.from(name, "").secure(true).httpOnly(true).sameSite("Lax").path("/").maxAge(Duration.ZERO).build()

    private fun cookieName(realm: IdentityRealm): String = when (realm) {
        IdentityRealm.CUSTOMER -> RequestAuth.CUSTOMER_COOKIE
        IdentityRealm.USER -> RequestAuth.INTERNAL_COOKIE
    }

    companion object { const val CHALLENGE_COOKIE = "__Host-storecore_access_challenge" }
}
