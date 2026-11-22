import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('./datasets/ferreteria-demo.json', import.meta.url));
const targetPath = fileURLToPath(new URL('./datasets/ferreteria-full-showcase.json', import.meta.url));
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const images = [...new Set(source.products.flatMap(product => product.images))];
const catalog = [
  ['MECHA-HSS-19','Juego de mechas HSS 19 piezas','Rothen Tools','Accesorios y consumibles',45900,28],
  ['DISCO-CORTE-115-X10','Discos de corte 115 mm pack x10','Abramax','Accesorios y consumibles',28900,45],
  ['DISCO-FLAP-115-X5','Discos flap grano 80 pack x5','Abramax','Accesorios y consumibles',33700,2],
  ['HOJA-SIERRA-MADERA','Hoja circular para madera 185 mm','Bosch Professional','Accesorios y consumibles',41600,0],
  ['PUNTA-PH2-X20','Puntas PH2 impacto pack x20','DeWalt','Accesorios y consumibles',24800,34],
  ['TARUGO-8-X100','Tarugos nylon 8 mm pack x100','Fischer','Fijaciones',15900,80],
  ['TORNILLO-T2-X200','Tornillos T2 punta aguja pack x200','Fischer','Fijaciones',18700,63],
  ['ANCLAJE-M10-X10','Anclajes metálicos M10 pack x10','Fischer','Fijaciones',32400,12],
  ['BULON-M8-X50','Bulones hexagonales M8 pack x50','Bulonera Sur','Fijaciones',26900,1],
  ['ARANDELA-M8-X100','Arandelas planas M8 pack x100','Bulonera Sur','Fijaciones',11900,0],
  ['DESTORNILLADOR-AISLADO','Set destornilladores aislados 1000V','Bahco','Herramientas manuales',78400,15],
  ['PINZA-UNIVERSAL-KNIPEX-8','Pinza universal profesional 8 pulgadas','Knipex','Herramientas manuales',69600,9],
  ['LLAVE-AJUSTABLE-12','Llave ajustable cromada 12 pulgadas','Bahco','Herramientas manuales',52300,18],
  ['CRIQUE-ENC-72','Criquet encastre 1/2 72 dientes','Stanley','Herramientas manuales',89900,3],
  ['MARTILLO-CARPINTERO-27','Martillo carpintero mango fibra 27 mm','Stanley','Herramientas manuales',41800,26],
  ['NIVEL-LASER-VERDE','Nivel láser verde autonivelante','Bosch Professional','Medición y precisión',284900,7],
  ['CALIBRE-DIGITAL-MITUTOYO-150','Calibre digital inoxidable 150 mm','Mitutoyo','Medición y precisión',126500,5],
  ['CINTA-METRICA-8','Cinta métrica profesional 8 m','Stanley','Medición y precisión',23600,42],
  ['ESCUADRA-COMB-300','Escuadra combinada 300 mm','Bahco','Medición y precisión',47700,0],
  ['MULTIMETRO-TRUE-RMS','Multímetro digital True RMS','Fluke','Electricidad',349000,6],
  ['PINZA-AMPEROMETRICA','Pinza amperométrica digital','Fluke','Electricidad',428000,4],
  ['PROLONGADOR-20M','Prolongador industrial 20 m','Kalop','Electricidad',98700,17],
  ['FICHA-INDUSTRIAL-16A','Ficha industrial 16A IP44','Kalop','Electricidad',17900,31],
  ['TABLERO-OBRA-4T','Tablero portátil de obra 4 tomas','Sica','Electricidad',138900,2],
  ['CASCO-ABS-RATCHET','Casco ABS con ajuste ratchet','3M','Seguridad industrial',38900,24],
  ['ANTEOJO-ANTIEMP','Anteojos transparentes antiempaño','3M','Seguridad industrial',14600,58],
  ['GUANTE-NITRILO-X12','Guantes nitrilo reforzado pack x12','Libus','Seguridad industrial',22900,40],
  ['PROTECTOR-AUDITIVO-COPA','Protector auditivo copa 25 dB','Libus','Seguridad industrial',35700,8],
  ['MASCARA-MEDIA-CARA','Máscara media cara reutilizable','3M','Seguridad industrial',75900,0],
  ['RODILLO-22-KIT','Kit rodillo 22 cm con bandeja','El Galgo','Pintura y terminación',31800,21],
  ['PISTOLA-PINTAR-HVLP','Pistola de pintar HVLP 600 ml','Gamma','Pintura y terminación',112900,5],
  ['LIJA-ORBITAL-X20','Lijas orbitales surtidas pack x20','Norton','Pintura y terminación',26400,38],
  ['ESPATULA-INOX-100','Espátula flexible inoxidable 100 mm','El Galgo','Pintura y terminación',12900,19],
  ['CINTA-ENMASCARAR-X6','Cinta de enmascarar 48 mm pack x6','Norton','Pintura y terminación',21700,2],
  ['MANGUERA-20M','Manguera reforzada 1/2 20 m','Tramontina','Jardín y exterior',68900,14],
  ['TIJERA-PODA-BYPASS','Tijera de poda bypass profesional','Tramontina','Jardín y exterior',39900,23],
  ['PALA-PUNTA-FIBRA','Pala punta con mango de fibra','Tramontina','Jardín y exterior',57400,10],
  ['HACHA-800-FIBRA','Hacha 800 g mango de fibra','Bahco','Jardín y exterior',64900,1],
  ['ASPERSOR-OSCILANTE','Aspersor oscilante 18 boquillas','Tramontina','Jardín y exterior',49600,0],
  ['ORGANIZADOR-22','Organizador modular 22 pulgadas','Stanley','Almacenamiento y obra',118900,13],
];

const additions = catalog.map(([suffix, name, brand, category, price, stock], index) => ({
  sku: `SHOW-${suffix}`,
  name,
  description: `${name}. Selección profesional para ferretería, taller, mantenimiento y obra, con especificaciones claras y disponibilidad visible.`,
  brand,
  category,
  images: [images[(index * 3) % images.length], images[(index * 3 + 7) % images.length]],
  price,
  stock,
}));
const products = [...source.products, ...additions];
const activeSkus = products.slice(0, 16).map(product => product.sku);
const categories = [...new Set(products.map(product => product.category))].slice(0, 8);
const offer = (key, name, status, priority, skus, discountKind = 'PERCENT', discountValue = 10) => ({
  key, name, priority, startsInDays: -7, endsInDays: 60, discountKind, discountValue, minMarginPercent: 0, skus, status,
});
const experience = {
  profile: 'FULL_DEMO',
  cart: [
    { sku: 'SHOW-AMOLADORA-850', quantity: 1 }, { sku: 'SHOW-SET-MANUAL', quantity: 2 },
    { sku: 'SHOW-MECHA-HSS-19', quantity: 1 }, { sku: 'SHOW-ANTEOJO-ANTIEMP', quantity: 3 },
    { sku: 'SHOW-TARUGO-8-X100', quantity: 2 },
  ],
  favoriteSkus: products.filter(product => product.stock > 0).slice(4, 16).map(product => product.sku),
  addresses: [
    { label: 'Casa', recipient: 'Agustín Demo', street: 'Avenida Siempre Viva', number: '2209', floorApartment: null, city: 'Córdoba', province: 'Córdoba', postalCode: '5000', notes: 'Portón gris', isDefault: true },
    { label: 'Taller', recipient: 'Agustín Demo', street: 'Bulevar Los Artesanos', number: '1450', floorApartment: 'Galpón 3', city: 'Córdoba', province: 'Córdoba', postalCode: '5008', notes: 'Recepción de 8 a 17', isDefault: false },
    { label: 'Obra', recipient: 'Agustín Demo', street: 'Camino Interfábricas', number: '731', floorApartment: null, city: 'Villa Allende', province: 'Córdoba', postalCode: '5105', notes: 'Llamar al llegar', isDefault: false },
  ],
  offers: [
    offer('potencia-15','Potencia profesional 15%','ACTIVE',100,activeSkus.slice(0,4),'PERCENT',15),
    offer('taller-12','Semana del taller 12%','ACTIVE',90,activeSkus.slice(4,8),'PERCENT',12),
    offer('obra-10','Equipá tu obra 10%','ACTIVE',80,activeSkus.slice(8,12),'PERCENT',10),
    offer('manuales-8','Manuales seleccionadas 8%','ACTIVE',70,activeSkus.slice(12,16),'PERCENT',8),
    offer('borrador-electricidad','Especial electricidad','DRAFT',60,products.slice(20,24).map(product=>product.sku)),
    offer('borrador-seguridad','Seguridad para el equipo','DRAFT',50,products.slice(24,28).map(product=>product.sku)),
    offer('borrador-jardin','Temporada jardín','DRAFT',40,products.slice(34,38).map(product=>product.sku)),
    offer('borrador-fijaciones','Volumen fijaciones','DRAFT',30,products.slice(45,49).map(product=>product.sku)),
    offer('pausada-medicion','Precisión profesional','PAUSED',20,products.slice(55,59).map(product=>product.sku)),
    offer('pausada-pintura','Renová tu taller','PAUSED',10,products.slice(69,73).map(product=>product.sku)),
    offer('finalizada-invierno','Campaña invierno','ENDED',5,products.slice(16,20).map(product=>product.sku)),
    offer('finalizada-apertura','Apertura de temporada','ENDED',1,products.slice(60,64).map(product=>product.sku),'FIXED',5000),
  ],
  homeSections: [
    { key:'hero-ferreteria', kind:'HERO', active:true, sortOrder:0, content:{ title:source.home.title, body:source.home.body, ctaLabel:'Explorar catálogo', ctaPath:'/catalog' } },
    { key:'categorias-principales', kind:'CATEGORY_RAIL', active:true, sortOrder:10, content:{ title:'Comprá por categoría', categoryNames:categories } },
    { key:'ofertas-destacadas', kind:'PRODUCT_RAIL', active:true, sortOrder:20, content:{ title:'Ofertas para trabajar mejor', skus:activeSkus.slice(0,8) } },
    { key:'banner-envio', kind:'PROMO_BANNER', active:true, sortOrder:30, content:{ title:'Envíos y retiro coordinado', body:'Elegí entrega local o retiro al preparar tu compra.', ctaLabel:'Ver productos', ctaPath:'/catalog' } },
    { key:'mas-elegidos', kind:'PRODUCT_RAIL', active:true, sortOrder:40, content:{ title:'Los más elegidos del taller', skus:activeSkus.slice(8,16) } },
    { key:'banner-profesionales', kind:'PROMO_BANNER', active:true, sortOrder:50, content:{ title:'Precios claros para profesionales', body:'Stock visible, ofertas vigentes y seguimiento desde tu cuenta.', ctaLabel:'Ver ofertas', ctaPath:'/catalog?offers=1' } },
    { key:'temporada-inactiva', kind:'PRODUCT_RAIL', active:false, sortOrder:60, content:{ title:'Próxima temporada', skus:products.slice(20,28).map(product=>product.sku) } },
  ],
};
const result = { schemaVersion: 3, products, home: source.home, experience };
await writeFile(targetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`generated ${targetPath}: ${products.length} products, ${experience.offers.length} offers`);
