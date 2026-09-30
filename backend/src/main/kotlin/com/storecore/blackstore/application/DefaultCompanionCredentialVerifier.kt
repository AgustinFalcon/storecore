package com.storecore.blackstore.application

import com.storecore.blackstore.application.port.CompanionCredentialLookup
import com.storecore.blackstore.application.port.CompanionCredentialVerifier
import com.storecore.blackstore.application.port.CompanionSecretProvider
import com.storecore.blackstore.application.port.CompanionVerifyResult
import com.storecore.blackstore.application.port.SecretResolveResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import org.springframework.stereotype.Component
import java.security.MessageDigest

@Component
class DefaultCompanionCredentialVerifier(
    private val lookup: CompanionCredentialLookup,
    private val secrets: CompanionSecretProvider,
) : CompanionCredentialVerifier {
    override fun verify(rawBearer: ByteArray): CompanionVerifyResult {
        if (rawBearer.size < 32) {
            rawBearer.fill(0)
            return CompanionVerifyResult.Invalid
        }
        val fingerprint = CompanionTokenGenerator.fingerprint(rawBearer)
        val record = lookup.findByFingerprint(fingerprint) ?: run {
            rawBearer.fill(0)
            return CompanionVerifyResult.Invalid
        }
        if (!record.authReady || record.credentialStatus != "ACTIVE" || record.companionStatus == CompanionLifecycleStatus.REVOKED) {
            rawBearer.fill(0)
            return CompanionVerifyResult.Invalid
        }
        if (record.serviceRole != CompanionServiceRole.SERVICE || record.scopes.isEmpty()) {
            rawBearer.fill(0)
            return CompanionVerifyResult.Invalid
        }
        return when (val resolved = secrets.resolve(record.secretRef)) {
            is SecretResolveResult.TransientFailure -> {
                rawBearer.fill(0)
                CompanionVerifyResult.ProviderUnavailable
            }
            is SecretResolveResult.Missing -> {
                rawBearer.fill(0)
                CompanionVerifyResult.Invalid
            }
            is SecretResolveResult.SecretBytes -> {
                val matched = MessageDigest.isEqual(rawBearer, resolved.bytes)
                rawBearer.fill(0)
                resolved.bytes.fill(0)
                if (!matched) {
                    CompanionVerifyResult.Invalid
                } else {
                    CompanionVerifyResult.Verified(
                        VerifiedCompanionPrincipal(
                            clientInstanceId = record.clientInstanceId,
                            companionId = record.companionId,
                            credentialId = record.credentialId,
                            credentialVersion = record.credentialVersion,
                            serviceRole = record.serviceRole,
                            scopes = record.scopes,
                            companionStatus = record.companionStatus,
                        ),
                    )
                }
            }
        }
    }
}
