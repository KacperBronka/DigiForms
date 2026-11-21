# AGENTS.md — OCR output → FormDefinition JSON

This file tells an agent how to turn the OCR result of a scanned Polish government form into a
**FormDefinition** JSON file for the "Cyfryzacja formularzy" project.

```
test.pdf ──PaddleOCR──▶ testN-input.json ─┐
                        testN-input.txt ──┤ (the script that produced the JSON; context only)
guidelines.json (schema) ─────────────────┼──▶  agent  ──▶ testN-output.json
GuideLines.md (initial-data rules) ──────┤
test1-output.json (reference example) ────┘
```

## 1. Files and their roles

| File | Role | Authority |
|---|---|---|
| `testN-input.json` | PaddleOCR result for page 0 of the PDF. **Only source of the form's content.** | content |
| `testN-input.txt` | Python script that generated the OCR JSON (PP-OCRv6, `lang="en"`, CPU). Read-only context; re-run it for a new PDF. Do not edit it. | context |
| `guidelines.json` | JSON Schema (draft 2020-12) of `FormDefinition`. | structure |
| `GuideLines.md` | Rules for fields pre-filled from external registries ("dane inicjalne"). | pre-fill rules |
| `test1-output.json` | Reference output for `test1`. Shows the house conventions the schema does not capture. | conventions |

Naming: `testN-input.json` → `testN-output.json`, written next to the inputs. Output is UTF-8,
4-space indent, `ensure_ascii=False`.

**Precedence when sources disagree:** `GuideLines.md` (pre-fill rules) > `guidelines.json` (shape) >
`test1-output.json` (conventions). Content always comes from the OCR, never from the reference.
Report every conflict you resolve (see §9).

## 2. Reading the OCR JSON

Use only these keys; ignore `model_settings`, `text_det_params`, `dt_polys`, `rec_polys`, angles.

- `rec_texts[i]` — recognized text; `rec_boxes[i] = [x1, y1, x2, y2]` — its box on the page image; `rec_scores[i]` — confidence.
- Rebuild reading order by sorting on `y1`, then `x1`. The array order is already roughly top-to-bottom, but the
  page has two columns (applicant on the left, addressee on the right at `x ≳ 760`), so group by column first.
- Treat `rec_scores < 0.97` as uncertain and re-check against context (e.g. `"..w obrębie"`, `" przy ulicy)."`).
- OCR artefacts to clean: dot leaders (`....`), stray `)` / `²)` / `¹)` footnote markers, missing Polish
  diacritics (`PORZADKOWEGO` → `porządkowego`), ALL-CAPS headings.
- Classify each line:
  - **Form title** — the large centred/caps line (`WNIOSEK O USTALENIE NUMERU PORZĄDKOWEGO`).
  - **Placeholder labels** — text in parentheses under a blank line, e.g. `(imię i nazwisko/nazwa wnioskodawcy)`,
    `(adres)`, `(nr telefonu/adres e-mail)`. These describe a field the applicant fills; they are **not** field titles.
  - **Fixed text** — e.g. addressee `Wójt Gminy Elbląg`. Becomes a read-only prefilled field.
  - **Body sentence** — `Wnoszę o … w miejscowości … przy ulicy … nr ewidencyjny działki … w obrębie …`. Every blank
    in it becomes one input field, in sentence order.
  - **Footnotes** (`1) Dane nieobowiązkowe.`, `2) Podpis …`) — use them to decide optionality, then drop the text.
  - **Not fields:** date `(data)`, signature `(podpis wnioskodawcy)`. Signing is handled by the platform; do not model it.

## 3. Output structure

```jsonc
{
  "title": "...",                       // form title, sentence case, with diacritics
  "tabs": [ { "id", "title", "type", "questions": [ Question ] } ],
  "flow": { "links": [ { "id", "source", "target" } ] }
}
```

### Tabs (in this order)

| # | `title` | `type` | Content |
|---|---|---|---|
| 1 | `Dane` | `MAIN` | Standard applicant block (§5) |
| 2…n | form-specific, e.g. `Informacje o budynku` | `MAIN` | The body sentence of the OCR form (§6) |
| n+1 | `Kontakt z urzędem` | `MAIN` | Contact data + consent (§5) |
| last | `Strona końcowa` | `FINISH` | Preview text block (§5) |

`flow.links` chains the tabs in order: link *k* has `source` = tab *k* id, `target` = tab *k+1* id.
Number of links = number of tabs − 1. All ids are fresh UUID v4.

### Question (grid cell) and field

```jsonc
{ "x": 0, "y": 0, "rows": 1, "cols": 3,          // grid position; cols is always 3, x always 0
  "field": { "id", "type", "techName", "title", "description", "options", "validation", "readOnly",
             "repeatingSectionGrid", "states", "questionOrder", "tooltipMessage",
             /* optional: */ "defaultValue", "defaultValueType", "dictionaryName",
                             "consentSectionConfig", "multiLevelTree", "searchEnabled" } }
```

- **Every question at tab level is a `SECTION`.** Inputs live inside it in `repeatingSectionGrid` (same Question shape,
  `x: 0`, `cols: 3`, `rows: 1`). Sections do not nest.
- Always emit these on every field: `id, type, techName, title, description, options, validation, readOnly,
  repeatingSectionGrid, questionOrder, tooltipMessage` (use `""` / `[]` / `false` when empty), plus `states: []`.
- `SECTION.description` = `"<html><head></head><body></body></html>"`. Other fields: `""` unless it is a `TEXT_BLOCK`.
- `id`: UUID v4, unique in the whole file. For `options[].id` use the option's display text (as in the reference).

### Field types seen in the reference

`SECTION`, `TEXT_FIELD`, `RADIO` (needs `options`), `SELECT` (needs `dictionaryName`, `defaultValue` as an array),
`FILE_UPLOADER`, `TEXT_BLOCK` (HTML in `description`), `CONSENT_SECTION` (needs `consentSectionConfig`).
Do not invent other types. Use `TEXT_FIELD` for every free-text blank in the OCR form.

### Layout arithmetic

- Top-level sections stack vertically: `y(next) = y(prev) + rows(prev)`, starting at 0.
- `rows` of a section = number of child rows + 1 (e.g. 1 child → 2, 2 children → 3, 3 → 4).
- Children: `y` = their index inside the section (0, 1, 2 …), `rows: 1`.
- `questionOrder` = the `y` of that question (top-level: section `y`; child: child `y`).
- Section `minItemRows` appears once in the reference (consent section, value 2); only add it for a consent section.

### `techName`

Lowercase ASCII snake_case derived from `title`: transliterate (`ą→a ć→c ę→e ł→l ń→n ó→o ś→s ź→z ż→z`), non-alphanumerics → `_`,
collapse repeats. Must be **unique across the whole file**; disambiguate with a suffix describing the context
(`_zagranica`, `_siedziba`, `_inna_osoba`, `_1`, `_2`). `option.techName` follows the same rule.

### `states` (conditional visibility)

```jsonc
{ "type": "SHOW",
  "query": "(\"<option name>\" in tabs['<tab title>' in title].questions['<section techName>' in field.techName].field.repeatingSectionGrid['<field techName>' in field.techName].field.__userAnswer)" }
```

- Negation: wrap in `$not( … )`. Combine with ` and ` / ` or ` on one line (no `\r\n`).
- Referenced tab title, section techName and field techName **must exist** in the output.
- The string `"<option name>"` must equal an option `name` (or the dictionary value, e.g. `"Polska"`).

## 4. Pre-filled ("initial data") fields — from `GuideLines.md`

Rules:
1. A field fed from a registry is a single field with **one source and one attribute**.
2. Set `"readOnly": true` — the PDF says registry-fed fields must be read-only; the user can never edit or fill them,
   even when the registry has no value.
3. `"defaultValue": "<SOURCE>.<attribute>"`, e.g. `"PESEL.name"`.
4. `"defaultValueType": "EXTERNAL_SYSTEM"`.
5. Only use sources and attributes from the tables below. No others.

Constant (non-registry) read-only text, such as the addressee, uses `readOnly: true` and a plain-text `defaultValue`
and **no** `defaultValueType`.

| Source | Meaning | Attributes |
|---|---|---|
| `PESEL` | Rejestr PESEL | `pesel, name, surname, birthDate, citizenship, motherName, birthPlace, motherSurname, sex, fatherName, secondName, birthCountry, foreignBirthUSC, familyName, fatherSurname, maritalStatus` (`birthDate` → date picker; rest text) |
| `PESEL_ADDRESS` | Dane zameldowania | `temporaryAddress{Voivodeship, District, Community, Place, StreetType, Street, HouseNumber, ApartmentNumber, PostalCode}` and `permanentAddress{Voivodeship, District, Community, Place, StreetType, Street, PostalCode, HouseNumber, ApartmentNumber}` (18 attributes; write them as e.g. `PESEL_ADDRESS.permanentAddressPlace`) |
| `MLPZ` | Dane zalogowanego użytkownika | `name, secondName, surname, pesel, phoneNumber, email, country, voivodeship, district, community, place, postCode, street, building, apartment, institutionName, descriptiveOrganizationName` |

Default choice: data about the **logged-in applicant** uses `MLPZ.*` (as in the reference). Use `PESEL.*` /
`PESEL_ADDRESS.*` only when the form explicitly asks for registry data MLPZ does not have (birth date, parents' names,
marital status, registered address).

## 5. Standard blocks (reuse verbatim in structure; titles/texts as in `test1-output.json`)

**Tab `Dane`** — sections in this order, each with the visibility rules from the reference:
1. `Organ, do którego jest składany wniosek` → `nazwa_organu` (`TEXT_FIELD`, `readOnly: true`, `defaultValue` = addressee name from OCR, e.g. `Wójt Gminy Elbląg`; street/postcode lines are not modelled).
2. `Podmiot wniosku` → `RADIO` "Wybierz, w czyim imieniu wnioskujesz" (`Swoim`, `Innej osoby`, `Osoby prawnej lub jednostki organizacyjnej`) and `RADIO` "Wybierz, jako kto wnioskujesz" (`Pełnomocnik`, `Reprezentant`; shown only for legal person).
3. `Twoje dane` → `imie` (`MLPZ.name`), `nazwisko` (`MLPZ.surname`), both read-only.
4. `Adres zamieszkania` → `Kraj` (dictionary `Kraje`, default `["Polska"]`), Poland-only fields (województwo via dictionary `TERYT_DOWODOWY` with `multiLevelTree: true, searchEnabled: true`, kod pocztowy `MLPZ.postCode`, ulica `MLPZ.street`, numer budynku `MLPZ.building`, numer lokalu `MLPZ.apartment`) and abroad-only fields (`$not("Polska" …)`: miejscowość, kod pocztowy, ulica).
5. `Dane podmiotu` (nazwa, NIP, REGON, numer KRS) and `Adres siedziby` (same country/abroad pattern, dictionary `TERYT_4G_DOWODOWY`) — legal person only.
6. `Potwierdzenie, że jesteś reprezentantem` (`FILE_UPLOADER`) — legal person **and** Reprezentant.
7. `Dane innej osoby`, `Adres zamieszkania innej osoby` — "Innej osoby" only.
8. `Pełnomocnictwo` (`FILE_UPLOADER`) and the two `Opłata skarbowa` sections (`RADIO` Tak/Nie, `TEXT_BLOCK` with the 17 zł info, `FILE_UPLOADER` for the transfer confirmation) — copy conditions from the reference.

**Tab `Kontakt z urzędem`** — `Dane do kontaktu`: `numer_telefonu` (`MLPZ.phoneNumber`), `adres_e_mail` (`MLPZ.email`) —
OCR footnote "Dane nieobowiązkowe" means these are optional. Then `Zgoda_sekcja` with one `CONSENT_SECTION`
(`consentSectionConfig.consents[0].required: true`, `files: []`, GDPR text copied from the reference).

**Tab `Strona końcowa`** (`FINISH`) — `Podgląd uzupełnionego wniosku` with one `TEXT_BLOCK` (preview text from the reference).

The standard `Dane` / `Kontakt z urzędem` / `Strona końcowa` blocks are identical across forms; only the organ name,
the title and the middle tab(s) change.

## 6. Form-specific tab(s) — derived from the OCR body

Map the body sentence blank-by-blank to `TEXT_FIELD`s, one `SECTION` per logical group. For `test1`:

> `Wnoszę o ustalenie numeru porządkowego budynkowi zlokalizowanemu w miejscowości… przy ulicy… nr ewidencyjny działki… w obrębie…`

→ tab `Informacje o budynku`, section `Lokalizacja budynku` (`lokalizacja_budynku`), children in sentence order:
`Miejscowość` (`miejscowosc`), `Ulica` (`ulica_budynku`), `Numer ewidencyjny działki` (`numer_ewidencyjny_dzialki`), `Obręb` (`obreb_numer`).
All `readOnly: false`, no `defaultValue`.

Rules: field `title` = the noun phrase that precedes the blank (capitalised, no trailing punctuation); no
`defaultValueType`; use `FILE_UPLOADER` only when the OCR mentions an attachment (`załącznik`, `do wniosku dołączam`).
Title of the form: from the heading, sentence case, diacritics restored. The reference uses
`Wniosek o ustalenie numeru porządkowego nieruchomości` while the OCR body says "budynkowi" — if the heading and the
reference differ, prefer the OCR heading and flag it.

## 7. Known mismatches between the sources (decide explicitly, then log)

1. **Typo in schema:** `guidelines.json` names the array `repetingSectionGrid`; the reference uses
   `repeatingSectionGrid`. **Use `repeatingSectionGrid`** (matches the reference) and flag it.
2. **Fields outside the schema** that the reference uses: `minItemRows`, `multiLevelTree`, `searchEnabled`. Keep them
   where the reference does; the schema doesn't forbid extra properties.
3. **Schema says `defaultValue` is a string**, but `SELECT` fields in the reference use arrays (`[]`, `["Polska"]`). Keep arrays for `SELECT`.
4. **readOnly vs. the PDF:** the PDF requires registry-fed fields to be read-only, yet in the reference the MLPZ address,
   phone and e-mail fields are editable (only name/surname are read-only). Default: follow the reference for the standard blocks;
   for any **new** registry-fed field follow the PDF (`readOnly: true`). Ask the owner if unsure.
5. **Reference defects not to copy:** `SELECT` titles that are dictionary names (`TERYT_DOWODOWY`) — use `Województwo`;
   `Zgoda_sekcja` → `Zgoda`; typo `pełnomonictwo`; empty-string `defaultValue` on `ulica_siedziba`; trailing `\r\n` in queries.
   (Keep them only if asked to reproduce `test1-output.json` byte-for-byte.)
6. `validation` is `[]` everywhere in the reference and the schema gives no item shape. Always emit `[]`.

## 8. Procedure

1. Read `testN-input.json`; rebuild lines in reading order (§2). Note low-confidence lines.
2. Extract: title, addressee, body blanks, footnote-based optionality.
3. Build tabs from §5 + §6. Generate UUIDs; compute `x/y/rows/cols/questionOrder` (§3); derive unique `techName`s.
4. Add `states` queries and `defaultValue`/`defaultValueType` for registry fields (§4).
5. Build `flow.links`.
6. Write `testN-output.json`, then run the validator (§10). Fix until it prints `OK`.
7. Report in the final message: title, tabs, count of fields, low-confidence OCR lines, and every decision from §7.

## 9. Hard rules (checklist)

- Valid JSON, UTF-8, real Polish diacritics in `title`/`description`/`name`; ASCII only in `techName`.
- Every UUID unique; every `flow` source/target is an existing tab id; no orphan tab.
- Every tab-level question is a `SECTION`; `repeatingSectionGrid` only on sections.
- Every `techName` unique file-wide; every `states.query` points at existing tab titles / techNames.
- Registry-fed fields: `defaultValue` matches `^(PESEL|PESEL_ADDRESS|MLPZ)\.[A-Za-z]+$` and an allowed attribute (§4) and `defaultValueType == "EXTERNAL_SYSTEM"`.
- Do not invent form content that is neither in the OCR nor in the standard blocks. Do not model date/signature.
- Never overwrite `testN-input.*`, `guidelines.json`, `GuideLines.md` or `test1-output.json`.

## 10. Validator (save as `validate_output.py`, run `python validate_output.py testN-output.json`)

```python
import json, re, sys

d = json.load(open(sys.argv[1], encoding="utf-8"))
errs, ids, techs, tab_titles = [], set(), set(), {t["title"] for t in d["tabs"]}
SRC = {"PESEL", "PESEL_ADDRESS", "MLPZ"}
REQ = {"id", "type", "techName", "title", "description", "options", "validation",
       "readOnly", "repeatingSectionGrid", "questionOrder", "tooltipMessage"}

def walk(q, top):
    f = q["field"]
    miss = REQ - f.keys()
    if miss: errs.append(f"{f.get('techName')}: missing {sorted(miss)}")
    if f["id"] in ids: errs.append(f"duplicate id {f['id']}")
    ids.add(f["id"])
    if f["techName"] in techs: errs.append(f"duplicate techName {f['techName']}")
    techs.add(f["techName"])
    if not re.fullmatch(r"[a-z0-9_]+", f["techName"]): errs.append(f"bad techName {f['techName']}")
    if top and f["type"] != "SECTION": errs.append(f"{f['techName']}: top-level must be SECTION")
    if not top and f["repeatingSectionGrid"]: errs.append(f"{f['techName']}: nested section")
    if f.get("defaultValueType") == "EXTERNAL_SYSTEM":
        if not re.fullmatch(r"(PESEL|PESEL_ADDRESS|MLPZ)\.[A-Za-z]+", f.get("defaultValue", "")):
            errs.append(f"{f['techName']}: bad defaultValue")
    for c in f["repeatingSectionGrid"]: walk(c, False)

for t in d["tabs"]:
    if t["id"] in ids: errs.append(f"duplicate id {t['id']}")
    ids.add(t["id"])
    for q in t["questions"]: walk(q, True)

tab_ids = [t["id"] for t in d["tabs"]]
links = d["flow"]["links"]
if len(links) != len(tab_ids) - 1: errs.append("flow must chain all tabs")
for l, s, t in zip(links, tab_ids, tab_ids[1:]):
    if (l["source"], l["target"]) != (s, t): errs.append(f"link {l['id']} out of order")

raw = json.dumps(d, ensure_ascii=False)
for tab, sec, fld in re.findall(r"tabs\['([^']+)' in title\]\.questions\['([^']+)' in field\.techName\]"
                               r"\.field\.repeatingSectionGrid\['([^']+)' in field\.techName\]", raw):
    if tab not in tab_titles or sec not in techs or fld not in techs:
        errs.append(f"query references missing {tab}/{sec}/{fld}")

print("OK" if not errs else "\n".join(errs))
sys.exit(bool(errs))

```
