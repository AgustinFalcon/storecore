package com.storecore.branding

import com.storecore.branding.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MerchantBrandingDomainTest {
    @Test
    fun `colors normalize exact hex and reject css and short values`() {
        assertEquals("#abcdef", BrandColor.fromWire("#ABCDEF")!!.hex)
        listOf(null, "red", "#fff", " #abcdef", "#abcdef;", "#abcdex", "#abcdef00").forEach {
            assertNull(BrandColor.fromWire(it))
        }
    }

    @Test
    fun `contrast is symmetric and enforces the unrounded WCAG threshold`() {
        val white = BrandColor.fromWire("#ffffff")!!
        val black = BrandColor.fromWire("#000000")!!
        assertEquals(21.0, black.contrast(white), 0.000001)
        assertEquals(black.contrast(white), white.contrast(black))
        assertEquals(1.0, black.contrast(black), 0.000001)
        MerchantBranding.create(1, "Shop", BrandLogo.None, BrandColor.fromWire("#767676")!!, white)
        assertThrows(BrandingInvalid::class.java) {
            MerchantBranding.create(1, "Shop", BrandLogo.None, BrandColor.fromWire("#777777")!!, white)
        }
    }

    @Test
    fun `logo is a closed type with canonical safe serialization`() {
        assertSame(BrandLogo.None, BrandLogo.fromWire(null))
        assertSame(BrandLogo.None, BrandLogo.fromWire(""))
        assertInstanceOf(BrandLogo.RootRelative::class.java, BrandLogo.fromWire("/assets/logo.png"))
        assertEquals("https://example.com/logo.png?q=1", BrandLogo.fromWire("HTTPS://EXAMPLE.COM:443/logo.png?q=1").url)
        assertEquals("https://example.com/", BrandLogo.fromWire("https://example.com").url)
        assertEquals("/assets/caf%C3%A9.png", BrandLogo.fromWire("/assets/café.png").url)
        listOf("data:image/png,abc", "javascript:alert(1)", "http://example.com/a", "//example.com/a",
            "https://user:pass@example.com/a", "https://example.com/a#fragment", "/other/logo.png",
            "/assets/../secret", "/assets/%2e%2e/secret", "/assets/%2fsecret", "/assets/%5csecret",
            "/assets/a%0a.png", "/assets/a\\b.png", "https://example.com/a\n.png", "https://example.com:99999/a",
            "https://example.com/a%C2%85.png", "/assets/" + "é".repeat(1000)).forEach {
            assertSame(BrandLogo.Unknown, BrandLogo.fromWire(it), it)
        }
    }

    @Test
    fun `business name and positive revision validate in domain and trim at the boundary`() {
        fun value(name: String, revision: Long = 1, logo: BrandLogo = BrandLogo.None) = MerchantBranding.create(
            revision, name, logo, BrandColor.DefaultPrimary, BrandColor.DefaultOnPrimary)
        assertEquals("My Shop", value("  My Shop  ").businessName)
        assertEquals("é".repeat(160), value("é".repeat(160)).businessName)
        for (name in listOf("a", "  ", "a  ", "a".repeat(161), "bad\nname", "\tShop", "hidden\u200bname")) {
            assertThrows(BrandingInvalid::class.java, { value(name) }, name)
        }
        assertThrows(BrandingInvalid::class.java) { value("Shop", 0) }
        assertThrows(BrandingInvalid::class.java) { value("Shop", -1) }
        assertThrows(BrandingInvalid::class.java) { value("Shop", logo = BrandLogo.Unknown) }
    }
}
