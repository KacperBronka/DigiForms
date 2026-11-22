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
  - **Not fields:** the signature and its accompanying signing date. The platform handles both. Model
    dates that the form asks for as answers in their own right using the type-selection rules in §3.

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

### Choose the most specific field type

For every input field, determine what the answer represents before assigning `field.type`. Use the
field label, section heading, nearby instructions, units, and expected answer format together.
Apply this rule to original OCR fields, fields copied from the reference, and pre-filled fields.
The source of the value is decided separately under §4.

| Expected answer | Required type selection |
|---|---|
| A numerical quantity, measurement, amount, percentage, count, or numerical year | Use the supported numeric type. Use the integer subtype when the answer must be whole and the platform supports it. Allow decimals for measurements or amounts that can be fractional. |
| A complete calendar date explicitly requested as an answer | Use the supported date type. A numerical year or a month without a day does not by itself justify a full date control. |
| A fixed choice or dictionary entry | Use `RADIO` with the specified options or `SELECT` with the configured dictionary, as appropriate. |
| A textual identifier or a formatted code | Use `TEXT_FIELD` for values such as PESEL, NIP, postal codes, phone numbers, parcel numbers, and house numbers. Preserve leading zeros, letters, and separators. |
| Another semantically specific answer | Use a more specific type, such as time or e-mail, when both the form's intent and the platform's support for that type are established. |
| Free text or ambiguous input | Use `TEXT_FIELD`. When the intended type is unclear, report the field for review. |

Use the exact type token specified by the target platform's type catalog, schema enum, or confirmed
configuration. If those sources do not specify numeric or date tokens, use `NUMBER` and `DATE`,
respectively, as the FormDefinition conventions for this prompt. For other semantic types, use only
tokens confirmed by the target configuration. If the target explicitly lacks the appropriate control,
use its supported fallback and report the limitation. Never downgrade a numeric or date field solely
because the reference form uses `TEXT_FIELD`.

Use `field.type` to specify the control. Keep `defaultValue` and `defaultValueType` in their existing
schema-defined representation, including external reference strings. The field type alone does not
change the JSON type of `defaultValue`.

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

Determine the value source of every field from its meaning, the role of the person or entity it describes,
and the pre-fill rules in `GuideLines.md`. Apply this decision to fields derived from OCR, copied from
a reference, and shown only in conditional branches.

- **External data:** once a source and attribute are confirmed, write both properties on the same field:
  `"defaultValue": "<SOURCE>.<attribute>"` and `"defaultValueType": "EXTERNAL_SYSTEM"`. Use exactly one
  case-sensitive source/attribute pair from the catalog in §10.
- **Literal or dictionary default:** keep the value in the form required by the schema, without
  `defaultValueType: "EXTERNAL_SYSTEM"`. Fixed read-only text such as the addressee uses
  `readOnly: true` and omits `defaultValueType`.
- **Manual input:** omit both properties when there is no default. If pre-fill is required but the mapping
  cannot be confirmed, omit both properties and report the field for review.

Choose a source only when it is authorized for the field and the person's role. A matching label alone
is insufficient. For data of the logged-in applicant, prefer `MLPZ`. Use `PESEL` or `PESEL_ADDRESS` for
explicitly requested registry data unavailable in `MLPZ`. In `PESEL`, `birthDate` uses a date picker and the other attributes use text fields.

Set `readOnly: true` on external fields unless the standard-block exception in §7 applies.
Optionality, editability and visibility do not change how an external reference is serialized.

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

Map the body sentence blank-by-blank to fields using the type-selection rules in §3. Use one `SECTION`
per logical group. For `test1`:

> `Wnoszę o ustalenie numeru porządkowego budynkowi zlokalizowanemu w miejscowości… przy ulicy… nr ewidencyjny działki… w obrębie…`

→ tab `Informacje o budynku`, section `Lokalizacja budynku` (`lokalizacja_budynku`), children in sentence order:
`Miejscowość` (`miejscowosc`), `Ulica` (`ulica_budynku`), `Numer ewidencyjny działki` (`numer_ewidencyjny_dzialki`), `Obręb` (`obreb_numer`).
All `readOnly: false`, no `defaultValue`.

Use the noun phrase before the blank as the field `title` (capitalised, with no trailing punctuation). Apply §4
to decide how the field gets its value. Use `FILE_UPLOADER` only when the OCR mentions an attachment
(`załącznik`, `do wniosku dołączam`).
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
   This exception applies only to `readOnly`. Every external reference still requires the pair from §4.
5. **Reference defects not to copy:** `SELECT` titles that are dictionary names (`TERYT_DOWODOWY`) — use `Województwo`;
   `Zgoda_sekcja` → `Zgoda`; typo `pełnomonictwo`; empty-string `defaultValue` on `ulica_siedziba`; trailing `\r\n` in queries.
   (Keep them only if asked to reproduce `test1-output.json` byte-for-byte.)
6. `validation` is `[]` everywhere in the reference and the schema gives no item shape. Always emit `[]`.

## 8. Procedure

1. Read `testN-input.json`; rebuild lines in reading order (§2). Note low-confidence lines.
2. Extract: title, addressee, body blanks, footnote-based optionality.
3. Build tabs from §5 + §6. Choose the most specific type for every input field (§3). Generate UUIDs,
   compute `x/y/rows/cols/questionOrder`, and derive unique `techName`s (§3).
4. Add `states` queries and serialize each field’s value source according to §4.
5. Build `flow.links`.
6. Check §9 and run the deterministic validator in §10 on the draft. Publish only after the checks pass.
7. Report in the final message: title, tabs, count of fields, low-confidence OCR lines, and every decision from §7.

## 9. Hard rules (checklist)

- Valid JSON, UTF-8, real Polish diacritics in `title`/`description`/`name`; ASCII only in `techName`.
- Every UUID unique; every `flow` source/target is an existing tab id; no orphan tab.
- Every tab-level question is a `SECTION`; `repeatingSectionGrid` only on sections.
- Every `techName` unique file-wide; every `states.query` points at existing tab titles / techNames.
- Every external reference in `defaultValue` must have `defaultValueType: "EXTERNAL_SYSTEM"` on the same field.
  Every `"EXTERNAL_SYSTEM"` field must have exactly one allowed reference as its string `defaultValue` (§4, §10).
- Review each `TEXT_FIELD` before publication. If the field's meaning and the available controls establish
  a more specific type, use that type (§3).
- Do not invent form content that is neither in the OCR nor in the standard blocks. Omit the signature
  and its accompanying signing date.
- Never overwrite `testN-input.*`, `guidelines.json`, `GuideLines.md` or `test1-output.json`.

## 10. Normalize and validate external defaults before output

Run the following Python code with the draft JSON path as its only argument. It inspects every serialized
field and repairs a missing, null or incorrect `defaultValueType` for any allowed reference. An invalid
reference or an external field without a reference fails the check. Resolve each error using §4 and rerun
the validator. Publish the normalized draft as `testN-output.json` only after a successful exit.

The catalog below is the single list of allowed source/attribute pairs. When `GuideLines.md` adds an
authorized system or attribute, update the catalog. The validation logic applies to every catalog entry.

```python
import json
import sys
from pathlib import Path

EXTERNAL_SYSTEM = "EXTERNAL_SYSTEM"
ALLOWED_ATTRIBUTES = {
    "PESEL": set("""
        pesel name surname birthDate citizenship motherName birthPlace motherSurname
        sex fatherName secondName birthCountry foreignBirthUSC familyName fatherSurname maritalStatus
    """.split()),
    "PESEL_ADDRESS": {
        prefix + suffix
        for prefix in ("temporaryAddress", "permanentAddress")
        for suffix in (
            "Voivodeship", "District", "Community", "Place", "StreetType",
            "Street", "HouseNumber", "ApartmentNumber", "PostalCode",
        )
    },
    "MLPZ": set("""
        name secondName surname pesel phoneNumber email country voivodeship district community
        place postCode street building apartment institutionName descriptiveOrganizationName
    """.split()),
}
KNOWN_SOURCE_NAMES = {source.casefold() for source in ALLOWED_ATTRIBUTES}


def iter_fields(questions):
    for question in questions:
        field = question["field"]
        yield field
        yield from iter_fields(field.get("repeatingSectionGrid", []))


draft_path = Path(sys.argv[1])
form = json.loads(draft_path.read_text(encoding="utf-8"))
errors = []

for tab in form["tabs"]:
    for field in iter_fields(tab["questions"]):
        value = field.get("defaultValue")
        reference = value if isinstance(value, str) else ""
        source, separator, attribute = reference.partition(".")
        has_known_prefix = bool(separator) and source.strip().casefold() in KNOWN_SOURCE_NAMES
        if not has_known_prefix and field.get("defaultValueType") != EXTERNAL_SYSTEM:
            continue

        if separator and attribute in ALLOWED_ATTRIBUTES.get(source, ()):
            field["defaultValueType"] = EXTERNAL_SYSTEM
        else:
            errors.append(f"{field['techName']}: invalid external defaultValue {value!r}")

if errors:
    raise SystemExit("\n".join(errors))

draft_path.write_text(json.dumps(form, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
```

If the agent only returns JSON and cannot run Python, apply the same checks before returning it. In that setup,
the calling application must run the validator before accepting the result to enforce this rule deterministically.
