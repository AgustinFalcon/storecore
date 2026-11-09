package com.storecore.favorites

import com.storecore.favorites.domain.FavoriteAvailability
import com.storecore.favorites.domain.FavoriteMutationOutcome
import kotlin.test.Test
import kotlin.test.assertEquals

class FavoriteClosedTypesTest {
    @Test fun `unknown availability never becomes available`() {
        assertEquals(FavoriteAvailability.UNKNOWN, FavoriteAvailability.fromWire("AVAILABLE "))
        assertEquals(FavoriteAvailability.UNAVAILABLE, FavoriteAvailability.fromWire("UNAVAILABLE"))
    }

    @Test fun `unknown mutation outcome is closed`() {
        assertEquals(FavoriteMutationOutcome.UNKNOWN, FavoriteMutationOutcome.fromWire("DELETED"))
        assertEquals(FavoriteMutationOutcome.ALREADY_ABSENT, FavoriteMutationOutcome.fromWire("ALREADY_ABSENT"))
    }
}
