package com.storecore.catalog

import com.storecore.catalog.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant

class CatalogProjectionDomainTest {
    @Test fun `truncation records authoritative rows after the returned page`() {
        assertTrue(BoundedPage(listOf("first"),2,0,1).truncated)
        assertFalse(BoundedPage(listOf("last"),2,1,1).truncated)
        assertFalse(BoundedPage(emptyList<String>(),2,2,1).truncated)
        assertFalse(BoundedPage(listOf("first","last"),2,0,50).truncated)
        assertFalse(BoundedPage(emptyList<String>(),0,0,50).truncated)
        assertFalse(BoundedPage(emptyList<String>(),0,3,50).truncated)
    }
    @Test fun `wire status translation fails closed`() {
        ProductStatus.entries.forEach { assertEquals(it,ProductStatus.fromWire(it.name)) }
        assertEquals(ProductStatus.UNKNOWN,ProductStatus.fromWire("future"));assertEquals(ProductStatus.UNKNOWN,ProductStatus.fromWire(null))
        assertEquals(VariantStatus.UNKNOWN,VariantStatus.fromWire(null));assertEquals(VariantStatus.ACTIVE,VariantStatus.fromWire(true));assertEquals(VariantStatus.INACTIVE,VariantStatus.fromWire(false))
        assertEquals(com.storecore.offers.domain.DiscountKind.UNKNOWN,com.storecore.offers.domain.DiscountKind.fromWire("future"))
    }
    @Test fun `missing takes precedence invalid facts unknown and reservation net formulas do not subtract twice`() {
        fun fact(present:Boolean,a:Long?,r:Long?,s:Long?)=InventoryProjection.fromBalance("1","sku","name","label",present,a,r,s,Instant.EPOCH)
        val missing=fact(false,-1,null,null);assertEquals(InventoryState.MISSING,missing.state);assertEquals(VariantAvailability.UNAVAILABLE,missing.availability());assertNull(missing.onHand)
        assertEquals(VariantAvailability.UNKNOWN,fact(true,-1,0,0).availability());assertEquals(VariantAvailability.UNKNOWN,fact(true,null,0,0).availability())
        val known=fact(true,8,3,2);assertEquals(11L,known.onHand);assertEquals(6L,known.saleable);assertEquals(VariantAvailability.AVAILABLE,known.availability())
        assertEquals(VariantAvailability.OUT_OF_STOCK,fact(true,2,5,3).availability());assertEquals(VariantAvailability.OUT_OF_STOCK,fact(true,0,0,0).availability())
        assertEquals(4294967294L,fact(true,Int.MAX_VALUE.toLong(),Int.MAX_VALUE.toLong(),0).onHand)
    }
}
