type Rule = { pattern: RegExp; check?: (s: string) => boolean }
const digits = (s: string) => [...s].map(c => /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55)
const sum = (s: string, weights: number[]) => weights.reduce((a, w, i) => a + w * digits(s)[i], 0)
const rules: Record<string, Rule> = {
  PESEL: { pattern: /^\d{11}$/, check: s => (10 - sum(s, [1,3,7,9,1,3,7,9,1,3]) % 10) % 10 === digits(s)[10] },
  NIP: { pattern: /^\d{10}$/, check: s => sum(s, [6,5,7,2,3,4,5,6,7]) % 11 === digits(s)[9] },
  REGON_9: { pattern: /^\d{9}$/, check: s => sum(s, [8,9,2,3,4,5,6,7]) % 11 % 10 === digits(s)[8] },
  REGON_14: { pattern: /^\d{14}$/, check: s => sum(s, [2,4,8,5,0,9,7,3,6,1,2,4,8]) % 11 % 10 === digits(s)[13] },
  ID_CARD: { pattern: /^[A-Z]{3}\d{6}$/, check: s => sum(s, [7,3,1,9,7,3,1,7,3]) % 10 === 0 },
  PASSPORT: { pattern: /^[A-Z]{2}\d{7}$/, check: s => sum(s, [7,3,9,1,7,3,1,7,3]) % 10 === 0 },
  NRB: { pattern: /^\d{26}$/, check: s => BigInt(s.slice(2) + '2521' + s.slice(0,2)) % 97n === 1n },
  LUHN: { pattern: /^\d{13,19}$/, check: s => [...s].reverse().reduce((a,c,i) => { let n = +c; if (i % 2) { n *= 2; if (n > 9) n -= 9 } return a + n }, 0) % 10 === 0 },
  EAN_13: { pattern: /^\d{13}$/, check: s => [...s].reduce((a,c,i) => a + +c * (i % 2 ? 3 : 1), 0) % 10 === 0 },
  LAND_REGISTER: { pattern: /^[A-Z0-9]{4}\/\d{8}\/\d$/, check: s => [...s.replace(/\//g, '')].slice(0,12).reduce((a,c,i) => a + [1,3,7][i % 3] * '0123456789XABCDEFGHIJKLMNOPRSTUWYZ'.indexOf(c), 0) % 10 === +s.slice(-1) },
  PWZ: { pattern: /^\d{7}$/, check: s => [1,2,3,4,5,6].reduce((a,w,i) => a + w * digits(s)[i+1], 0) % 11 === digits(s)[0] },
  KRS: { pattern: /^\d{10}$/ }, ZIP_CODE: { pattern: /^\d{2}-\d{3}$/ },
  PHONE_PL: { pattern: /^(\+48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$/ }, PHONE_E164: { pattern: /^\+[1-9]\d{1,14}$/ },
  EMAIL: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, check: s => s.length <= 254 }, PKD: { pattern: /^\d{2}\.\d{2}\.[A-Z]$/ },
  SWIFT_BIC: { pattern: /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/ }, CVV: { pattern: /^\d{3,4}$/ },
  CARD_EXPIRY: { pattern: /^(0[1-9]|1[0-2])\/\d{2}$/, check: s => new Date(2000 + +s.slice(3), +s.slice(0,2), 1) > new Date() },
  AMOUNT: { pattern: /^\d+([.,]\d{1,2})?$/, check: s => parseFloat(s.replace(',', '.')) > 0 },
  FULL_NAME: { pattern: /^\p{L}[\p{L}'\- ]*$/u }, VIN: { pattern: /^[A-HJ-NPR-Z0-9]{17}$/ },
  TERYT_WOJEWODZTWO: { pattern: /^\d{2}$/ }, TERYT_POWIAT: { pattern: /^\d{4}$/ }, TERYT_GMINA: { pattern: /^\d{7}$/ },
  IPV4: { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, check: s => s.split('.').every(o => +o <= 255) },
  UUID: { pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/ },
  DATE_ISO: { pattern: /^\d{4}-\d{2}-\d{2}$/, check: s => new Date(s).toISOString().slice(0,10) === s }, VAT_RATE: { pattern: /^(0|5|8|23|zw|np)$/ },
}

export function validateValue(validations: unknown, value: string | string[] | undefined): string | undefined {
  if (!Array.isArray(validations)) return validations == null ? undefined : 'Nieprawidłowa konfiguracja walidacji.'
  const empty = value == null || (Array.isArray(value) ? value.length === 0 : value.trim() === '')
  for (const id of validations) {
    if (id === 'REQUIRED') { if (empty) return 'To pole jest wymagane.'; continue }
    const rule = typeof id === 'string' && Object.hasOwn(rules, id) ? rules[id] : undefined
    if (!rule) return `Nieznany walidator: ${String(id)}.`
    if (empty) continue
    const values = Array.isArray(value) ? value : [value!]
    try { if (!values.every(s => rule.pattern.test(s) && (!rule.check || rule.check(s)))) return `Niepoprawna wartość (${id}).` }
    catch { return `Niepoprawna wartość (${id}).` }
  }
}
