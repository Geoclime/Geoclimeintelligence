/** A country in the phone number's country-code dropdown. `dial` is the calling code without the "+". */
export interface PhoneCountry {
  iso: string;
  name: string;
  dial: string;
}

const country = (iso: string, name: string, dial: string): PhoneCountry => ({ iso, name, dial });

/** The platform starts in Nigeria, so it is the default and sits at the top of the list. */
export const DEFAULT_PHONE_COUNTRY = country("NG", "Nigeria", "234");

/** The rest of Africa, which the platform grows into next. */
export const AFRICAN_PHONE_COUNTRIES: readonly PhoneCountry[] = [
  country("DZ", "Algeria", "213"),
  country("AO", "Angola", "244"),
  country("BJ", "Benin", "229"),
  country("BW", "Botswana", "267"),
  country("BF", "Burkina Faso", "226"),
  country("BI", "Burundi", "257"),
  country("CV", "Cabo Verde", "238"),
  country("CM", "Cameroon", "237"),
  country("CF", "Central African Republic", "236"),
  country("TD", "Chad", "235"),
  country("KM", "Comoros", "269"),
  country("CG", "Congo", "242"),
  country("CI", "Côte d'Ivoire", "225"),
  country("CD", "Democratic Republic of the Congo", "243"),
  country("DJ", "Djibouti", "253"),
  country("EG", "Egypt", "20"),
  country("GQ", "Equatorial Guinea", "240"),
  country("ER", "Eritrea", "291"),
  country("SZ", "Eswatini", "268"),
  country("ET", "Ethiopia", "251"),
  country("GA", "Gabon", "241"),
  country("GM", "Gambia", "220"),
  country("GH", "Ghana", "233"),
  country("GN", "Guinea", "224"),
  country("GW", "Guinea-Bissau", "245"),
  country("KE", "Kenya", "254"),
  country("LS", "Lesotho", "266"),
  country("LR", "Liberia", "231"),
  country("LY", "Libya", "218"),
  country("MG", "Madagascar", "261"),
  country("MW", "Malawi", "265"),
  country("ML", "Mali", "223"),
  country("MR", "Mauritania", "222"),
  country("MU", "Mauritius", "230"),
  country("MA", "Morocco", "212"),
  country("MZ", "Mozambique", "258"),
  country("NA", "Namibia", "264"),
  country("NE", "Niger", "227"),
  country("RW", "Rwanda", "250"),
  country("ST", "São Tomé and Príncipe", "239"),
  country("SN", "Senegal", "221"),
  country("SC", "Seychelles", "248"),
  country("SL", "Sierra Leone", "232"),
  country("SO", "Somalia", "252"),
  country("ZA", "South Africa", "27"),
  country("SS", "South Sudan", "211"),
  country("SD", "Sudan", "249"),
  country("TZ", "Tanzania", "255"),
  country("TG", "Togo", "228"),
  country("TN", "Tunisia", "216"),
  country("UG", "Uganda", "256"),
  country("ZM", "Zambia", "260"),
  country("ZW", "Zimbabwe", "263"),
];

/** Where responders, researchers and the diaspora are most likely to be calling from. */
export const OTHER_PHONE_COUNTRIES: readonly PhoneCountry[] = [
  country("AU", "Australia", "61"),
  country("BE", "Belgium", "32"),
  country("BR", "Brazil", "55"),
  country("CN", "China", "86"),
  country("DK", "Denmark", "45"),
  country("FR", "France", "33"),
  country("DE", "Germany", "49"),
  country("IN", "India", "91"),
  country("IE", "Ireland", "353"),
  country("IT", "Italy", "39"),
  country("JP", "Japan", "81"),
  country("MY", "Malaysia", "60"),
  country("MX", "Mexico", "52"),
  country("NL", "Netherlands", "31"),
  country("NZ", "New Zealand", "64"),
  country("NO", "Norway", "47"),
  country("PK", "Pakistan", "92"),
  country("PT", "Portugal", "351"),
  country("QA", "Qatar", "974"),
  country("SA", "Saudi Arabia", "966"),
  country("SG", "Singapore", "65"),
  country("KR", "South Korea", "82"),
  country("ES", "Spain", "34"),
  country("SE", "Sweden", "46"),
  country("CH", "Switzerland", "41"),
  country("TR", "Türkiye", "90"),
  country("AE", "United Arab Emirates", "971"),
  country("GB", "United Kingdom", "44"),
  country("US", "United States and Canada", "1"),
];

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [DEFAULT_PHONE_COUNTRY, ...AFRICAN_PHONE_COUNTRIES, ...OTHER_PHONE_COUNTRIES];
