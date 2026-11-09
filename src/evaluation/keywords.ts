import type { Niche } from "./types.js";

/** Keyword dictionaries (RU/UA/EN) used to guess a niche from Wayback-sampled page text. */
export const NICHE_KEYWORDS: Record<Exclude<Niche, "none">, string[]> = {
  auto: [
    "автозапчаст", "автосервис", "шины", "диски", "двигател", "коробка передач",
    "б/у запчаст", "авторазбор", "кпп", "автомоб", "СТО", "техосмотр",
    "автозапчастини", "автосервіс", "шини", "диски", "двигун",
    "auto parts", "car parts", "tires", "wheels", "engine", "transmission", "garage",
  ],
  energy: [
    "электроэнерг", "энергосбыт", "газоснабжен", "котел", "котёл", "отоплен",
    "солнечн", "панел", "тариф на электро", "энергоэффективн",
    "електроенерг", "енергопостачання", "опалення", "сонячн",
    "solar panel", "energy supply", "power grid", "utility bill", "electricity tariff",
  ],
  news: [
    "новости", "новина", "репортаж", "журналист", "редакция", "подробности",
    "сми", "хроника", "последние новости",
    "новини", "репортаж", "журналіст", "редакція", "зми",
    "breaking news", "latest news", "headline", "editorial", "newsroom",
  ],
  deals_us: [
    "deal of the day", "coupon", "discount code", "promo code", "clearance sale",
    "free shipping", "limited time offer", "cashback", "best price", "shop now",
  ],
};

/** Signals of spam / dorway / PBN content, independent of niche. */
export const SPAM_KEYWORDS: string[] = [
  "casino", "казино", "poker", "покер", "bet online", "ставки на спорт",
  "viagra", "cialis", "виагра", "pharmacy online", "аптека без рецепт",
  "porn", "xxx", "sex video", "adult content", "порно",
  // common CJK spam / dorway markers that show up on hijacked PBN pages
  "激安", "通販", "送料無料", "亚洲", "中文",
];

/** Boilerplate used by registrar/marketplace parking pages (GoDaddy, Sedo, Afternic, ...). */
export const PARKED_MARKERS: string[] = [
  "this domain is for sale",
  "this domain may be for sale",
  "buy this domain",
  "domain is parked",
  "related searches",
  "the sponsor of this domain",
  "this web page is parked",
  "domain parking",
  "checkout the full domain profile",
];

export const ZONE_NICHE_PRIOR: Record<string, Partial<Record<Niche, number>>> = {
  ua: { auto: 1, energy: 1, news: 1 },
  "com.ua": { auto: 1, energy: 1, news: 1 },
  com: { deals_us: 1 },
};
