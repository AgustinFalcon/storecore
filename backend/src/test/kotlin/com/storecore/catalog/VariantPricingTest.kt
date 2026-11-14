package com.storecore.catalog

import com.storecore.catalog.domain.*
import com.storecore.offers.domain.DiscountKind
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class VariantPricingTest {
    @Test fun `ARS boundary rejects coercion rounding and overflow`() {
        for(raw in listOf(null,true,"", " 1", "01", "1e2", "1.005", "-1", "1000000000000",Double.NaN,Double.POSITIVE_INFINITY,emptyMap<String,String>())) assertNull(ArsAmount.fromWire(raw),"raw=$raw")
        for(raw in listOf(0,1,"0.00","999999999999.99",BigDecimal("23.45"))) assertNotNull(ArsAmount.fromWire(raw))
    }
    @Test fun `commands preserve absence but never null or contradictory data`() {
        assertEquals(VariantPriceCommand.Preserve,VariantPriceCommand.fromWire(false,null,true))
        assertEquals(VariantPriceCommand.Inherit,VariantPriceCommand.fromWire(false,null,false))
        for(raw in listOf(null,mapOf("mode" to "future"),mapOf("mode" to "INHERIT","base" to null),mapOf("mode" to "OVERRIDE"),mapOf("mode" to "OVERRIDE","base" to "1.001"))) assertEquals(VariantPriceCommand.Unknown,VariantPriceCommand.fromWire(true,raw,true))
        assertEquals(VariantPriceCommand.Unknown,VariantPriceCommand.fromWire(true,mapOf("mode" to "PRESERVE"),false))
        assertTrue(VariantPriceCommand.fromWire(true,mapOf("mode" to "OVERRIDE","base" to "0.00"),true) is VariantPriceCommand.Override)
    }
    @Test fun `inheritance and equal override preserve different policy identity`() {
        val inherited=VariantBasePricePolicy.fromPersistence(BigDecimal("100.00"),null)
        val override=VariantBasePricePolicy.fromPersistence(BigDecimal("100.00"),BigDecimal("100.00"))
        assertEquals(inherited.amount,override.amount)
        assertEquals(VariantPriceMode.INHERITED,inherited.view.mode)
        assertEquals(VariantPriceMode.OVERRIDE,override.view.mode)
        assertEquals(VariantBasePricePolicy.Unknown,VariantBasePricePolicy.fromPersistence(null,null))
    }
    @Test fun `one pure policy applies percent rounding fixed cap and unknown fail closed`() {
        fun price(base:String,kind:DiscountKind,value:String)=SkuPricePolicy.resolve(VariantBasePricePolicy.fromPersistence(BigDecimal(base),null),SkuOffer("1","Offer",kind,BigDecimal(value)))
        assertEquals(BigDecimal("0.67"),price("1.00",DiscountKind.PERCENT,"33.33").knownPrice()!!.effective)
        assertEquals(BigDecimal("0.00"),price("50.00",DiscountKind.FIXED,"100.00").knownPrice()!!.effective)
        assertTrue(price("100.00",DiscountKind.UNKNOWN,"10.00") is SkuPriceResolution.Unknown)
        assertTrue(price("100.00",DiscountKind.PERCENT,"100.01") is SkuPriceResolution.Unknown)
        assertTrue(price("100.00",DiscountKind.FIXED,"-1") is SkuPriceResolution.Unknown)
        assertTrue(price("100.00",DiscountKind.FIXED,"0") is SkuPriceResolution.Unknown)
    }
}
