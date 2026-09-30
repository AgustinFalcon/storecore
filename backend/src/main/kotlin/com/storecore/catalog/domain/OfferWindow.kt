package com.storecore.catalog.domain

import java.time.Instant

/** Canonical offer interval is half-open: starts_at inclusive, ends_at exclusive. */
object OfferWindow {
    const val SQL = "o.status='ACTIVE' AND o.starts_at <= ? AND ? < o.ends_at"

    fun contains(asOf: Instant, startsAt: Instant, endsAt: Instant): Boolean =
        !asOf.isBefore(startsAt) && asOf.isBefore(endsAt)
}
