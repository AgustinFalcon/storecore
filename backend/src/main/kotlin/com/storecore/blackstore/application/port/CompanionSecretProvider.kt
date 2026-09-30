package com.storecore.blackstore.application.port

sealed class SecretResolveResult {
    class SecretBytes(val bytes: ByteArray) : SecretResolveResult()
    data object Missing : SecretResolveResult()
    data object TransientFailure : SecretResolveResult()
}

interface CompanionSecretProvider {
    fun resolve(credentialSecretRef: String): SecretResolveResult
    fun prepare(requestId: String, rawBearer: ByteArray): String
    fun discard(credentialSecretRef: String, requestId: String)
}
