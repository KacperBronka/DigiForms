# AGENTS.md — OCR output → FormDefinition JSON

This file tells an agent how to turn the OCR result of a scanned Polish government form into a
**FormDefinition** JSON file for the "Cyfryzacja formularzy" project.

**First resolve the source of every answer (§4).** Prefer confirmed system-provided values for the correct
person or entity. Decide what the user must enter after checking pre-fill. Choose validators only after the
value sources have been resolved for the entire form (§8).

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
| `testN-input.json` | PaddleOCR result for page 0 of the PDF. Primary source of the form's content and requirements. | content |
| `testN-input.txt` | Python script that generated the OCR JSON (PP-OCRv6, `lang="en"`, CPU). Read-only context; re-run it for a new PDF. Do not edit it. | context |
| `guidelines.json` | JSON Schema (draft 2020-12) of `FormDefinition`. | structure |
| `GuideLines.md` | Rules for fields pre-filled from external registries ("dane inicjalne"). | pre-fill rules |
| `Hacknation - Słowniki  (1).docx` | Available predefined dictionaries, their scope and permitted controls. The rules are reproduced in §13. | dictionary selection |
| `test1-output.json` | Reference output for `test1`. Shows the house conventions the schema does not capture. | conventions |

Naming: `testN-input.json` → `testN-output.json`, written next to the inputs. Output is UTF-8,
4-space indent, `ensure_ascii=False`.

**Precedence when sources disagree:** `GuideLines.md` (pre-fill rules) > `guidelines.json` (shape) >
`test1-output.json` (conventions). The current OCR and any approved requirements supplied for this form
establish its content, obligations and wording. Use the reference for reusable patterns. Report conflicts (§9).

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
  - **Body sentence** — extract both explicit blanks and answers implied by the text. Preserve the order and
    scope of the requested answers, including inline choices.
  - **Footnotes and instructions** — extract optionality, required documents, conditions and other obligations.
    Preserve user-facing guidance needed to complete the form and implement the corresponding checks (§12).
  - **Not fields:** the signature and its accompanying signing date. The platform handles both. Model
    dates that the form asks for as answers in their own right using the type-selection rules in §3.

### Find inputs implied by the source text

Scan headings, sentences, instructions, option labels and footnotes for every answer the applicant must
supply or choose. Include answers embedded in running text or formatting, even where the source has no
blank or printed field label. Read nearby lines together so OCR line breaks cannot hide a question, its
options or its conditions.

- Treat inline alternatives, lists, checkboxes, strike-out instructions, asterisks and similar markers as
  cues. Use their surrounding text and footnotes to establish whether the applicant must make a choice,
  what that choice means, how many answers are permitted, and when it applies. Punctuation inside a code,
  label or explanatory phrase does not by itself establish a choice. Report unresolved meaning or missing options.
- If the applicant chooses exactly one from a finite list, create one explicit choice field. Use `RADIO`
  with one `options` item per permitted answer for inline alternatives. Use a single-select `SELECT` when the
  target supports the applicable dictionary or explicitly supports the supplied static list. Include every
  permitted option in the same field, regardless of the number of alternatives.
- Give the choice a concise title that states the decision. Preserve the meaning and order of the source
  options, remove markers resolved as editorial instructions or footnotes, and generate stable option
  `id` and `techName` values according to §3. Keep each independent decision in its own field. Apply requiredness
  and visibility from the source, including any follow-up fields triggered by particular answers (§12).
  Set a default selection only when supported by the source or the confirmed value-source decision in §4.
- If the source permits several selections, use a supported multiple-selection control that preserves that
  behavior. If the necessary control or any allowed option cannot be confirmed, report the gap according to §12.

Before finalizing the draft, reconcile the source with the output. Each identified decision must have a
corresponding control with its full confirmed option set, or an explicit unresolved item in the review.

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
| n+1 | `Kontakt z urzędem` | `MAIN` | Contact data and applicable notices or actions (§5, §12) |
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

`SECTION`, `TEXT_FIELD`, `RADIO` (explicit options or a permitted dictionary), `SELECT` (dictionary binding under §13),
`FILE_UPLOADER`, `TEXT_BLOCK` (HTML in `description`), `CONSENT_SECTION` (needs `consentSectionConfig`).

### Choose the most specific field type

For every input field, determine what the answer represents before assigning `field.type`. Use the
field label, section heading, nearby instructions, units, and expected answer format together.
Apply this rule to original OCR fields, fields copied from the reference, and pre-filled fields.
Apply the value-source decision from §4 before selecting the control.

| Expected answer | Required type selection |
|---|---|
| A numerical quantity, measurement, amount, percentage, count, or numerical year | Use the supported numeric type. Use the integer subtype when the answer must be whole and the platform supports it. Allow decimals for measurements or amounts that can be fractional. |
| A complete calendar date explicitly requested as an answer | Use the supported date type. A numerical year or a month without a day does not by itself justify a full date control. |
| A fixed choice or dictionary entry | Check §13 for a matching dictionary and its permitted controls. For a static list, use the selection rules in §2 and preserve every allowed option. |
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

### Field validators

Start validation design only after completing the value-source pass in §4 for all fields and branches.
Populate `field.validation` for every applicable input, including nested, conditional and pre-filled fields.
Use an array of unique validator identifiers as strings. Keep the existing array format, for example
`["REQUIRED", "PESEL"]` for a required PESEL or `["ZIP_CODE"]` for an optional Polish postal code.

1. Add `REQUIRED` only when the source form or a confirmed rule requires an answer in the field's active
   branch. A blank optional field passes format checks. A hidden or inactive field must not block submission.
2. Select the format validator by the meaning and expected representation of the answer. Use the label, section,
   country, instructions and external attribute as evidence. For example, a phone number is not automatically
   E.164, and an address selector that returns a name does not take a TERYT code validator. Apply `FULL_NAME`
   only to a field that requests the complete name. A separate name component uses its own confirmed validator
   when available and keeps `REQUIRED` only where applicable.
3. Emit the exact validator identifier from the target configuration if one is defined for that rule. Otherwise,
   use the identifier in §11 as the output convention. If a closed platform catalog excludes that rule, report the
   unsupported validator and keep the remaining supported identifiers. Emit the identifiers, never regexes or
   JavaScript source in `field.validation`.
4. Attach presence and format checks independently. Where a field accepts alternative formats, select the rule
   for the active branch or use a supported combined validator. In particular, do not attach both REGON length
   variants to the same field as simultaneous requirements.
5. Use `[]` when no supported check applies. Structural and display-only elements have no answer and use `[]`.
   Keep consent requiredness in `consentSectionConfig` only for actual consent (§12). Check applicability,
   value bounds, and relationships separately from format validation (§12).

For each format rule, the identifier refers to the regex and, where present, the additional JavaScript predicate
in §11. The runtime checks the full format before evaluating the predicate. Both must pass. Validate identifiers
as strings to preserve leading zeros. For external fields, choose checks compatible with the source’s documented
format or a confirmed runtime normalization. Validate the resolved answer after retrieval, never the reference string.
Report unresolved format mismatches for review while retaining the confirmed source mapping.

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
- Where a branch negates a particular choice, also establish that the controller has a valid answer (§12).

## 4. Pre-filled ("initial data") fields — from `GuideLines.md`

Perform a pre-fill pass over every field the current form needs. Identify the data item, the person or entity it
belongs to, and each branch where it applies. Check the authorized sources in `GuideLines.md` and the catalog in
§10 before selecting validators or planning manual entry. Apply this pass to fields derived from OCR, copied
from a reference, and shown only in conditional branches.

Prefer an authorized source that can reliably supply the exact answer for the identified person or entity.
Use that source whenever the form and process allow it, including for optional or editable fields. Use an
approved literal or dictionary default where applicable. Ask the user for manual input when the value has no
confirmed automatic source or the process requires the user to supply it. When an external value can be missing
at runtime, allow manual fallback only if the process permits it. Keep unknown mappings visible in the review.

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

## 5. Reusable blocks

**Tab `Dane`** — use the reference order and adapt visibility, requiredness and content to the current form (§12):
1. `Organ, do którego jest składany wniosek` → `nazwa_organu` (`TEXT_FIELD`, `readOnly: true`, `defaultValue` = addressee name from OCR, e.g. `Wójt Gminy Elbląg`; street/postcode lines are not modelled).
2. `Podmiot wniosku` → `RADIO` "Wybierz, w czyim imieniu wnioskujesz" (`Swoim`, `Innej osoby`, `Osoby prawnej lub jednostki organizacyjnej`) and `RADIO` "Wybierz, jako kto wnioskujesz" (`Pełnomocnik`, `Reprezentant`; shown only for legal person).
3. `Twoje dane` → `imie` (`MLPZ.name`), `nazwisko` (`MLPZ.surname`), both read-only.
4. `Adres zamieszkania` → `Kraj` (dictionary `Kraje`, default `["Polska"]`), Poland-only fields (województwo via dictionary `TERYT_DOWODOWY` with `multiLevelTree: true, searchEnabled: true`, kod pocztowy `MLPZ.postCode`, ulica `MLPZ.street`, numer budynku `MLPZ.building`, numer lokalu `MLPZ.apartment`) and country-specific fields for other valid country selections. Include the applicable address components and require those needed to complete the active branch (§12).
5. `Dane podmiotu` (nazwa, NIP, REGON, numer KRS) and `Adres siedziby` (same country/abroad pattern, dictionary `TERYT_4G_DOWODOWY`) — legal person only.
6. `Potwierdzenie, że jesteś reprezentantem` (`FILE_UPLOADER`) — legal person **and** Reprezentant.
7. `Dane innej osoby`, `Adres zamieszkania innej osoby` — "Innej osoby" only.
8. `Pełnomocnictwo` (`FILE_UPLOADER`) and the two `Opłata skarbowa` sections (`RADIO` Tak/Nie, `TEXT_BLOCK` with the 17 zł info, `FILE_UPLOADER` for the transfer confirmation) — adapt these blocks to the evidence and fee rules applicable to the current form.

**Tab `Kontakt z urzędem`** — `Dane do kontaktu`: `numer_telefonu` (`MLPZ.phoneNumber`), `adres_e_mail` (`MLPZ.email`) —
follow the current form’s instructions for requiredness. Add applicable notices, acknowledgments or consent
with the approved wording and the appropriate control (§12).

**Tab `Strona końcowa`** (`FINISH`) — `Podgląd uzupełnionego wniosku` with one `TEXT_BLOCK` (preview text from the reference).

Treat standard blocks as starting points. Review every copied field, default, requirement and visibility condition
for the current form.

## 6. Form-specific tab(s) — derived from the OCR body

Map all explicit and implied answers in the source to fields using §2 and §3. Put related fields in one
`SECTION`. For `test1`:

> `Wnoszę o ustalenie numeru porządkowego budynkowi zlokalizowanemu w miejscowości… przy ulicy… nr ewidencyjny działki… w obrębie…`

→ tab `Informacje o budynku`, section `Lokalizacja budynku` (`lokalizacja_budynku`), children in sentence order:
`Miejscowość` (`miejscowosc`), `Ulica` (`ulica_budynku`), `Numer ewidencyjny działki` (`numer_ewidencyjny_dzialki`), `Obręb` (`obreb_numer`).
All `readOnly: false`, no `defaultValue`.

Use a concise field `title` that identifies the requested answer. For a blank, use the preceding label or noun
phrase where it conveys the answer (capitalised, with no trailing punctuation). Apply §4 to decide how the field
gets its value. Use `FILE_UPLOADER` for an upload obligation established by the source or approved process rules.
Apply the obligation in the same branch as its trigger (§12).
Title of the form: from the heading, sentence case, diacritics restored. The reference uses
`Wniosek o ustalenie numeru porządkowego nieruchomości` while the OCR body says "budynkowi" — if the heading and the
reference differ, prefer the OCR heading and flag it.

## 7. Known mismatches between the sources (decide explicitly, then log)

1. **Typo in schema:** `guidelines.json` names the array `repetingSectionGrid`; the reference uses
   `repeatingSectionGrid`. **Use `repeatingSectionGrid`** (matches the reference) and flag it.
2. **Fields outside the schema** that the reference uses: `minItemRows`, `multiLevelTree`, `searchEnabled`. Keep them
   where the reference does; the schema doesn't forbid extra properties.
3. The reference uses arrays (`[]`, `["Polska"]`) for literal `SELECT` defaults. For a confirmed external pre-fill, use the string reference and `EXTERNAL_SYSTEM` pair in §4.
4. **readOnly vs. the PDF:** the PDF requires registry-fed fields to be read-only, yet in the reference the MLPZ address,
   phone and e-mail fields are editable (only name/surname are read-only). Default: follow the reference for the standard blocks;
   for any **new** registry-fed field follow the PDF (`readOnly: true`). Ask the owner if unsure.
   This exception applies only to `readOnly`. Every external reference still requires the pair from §4.
5. **Reference defects not to copy:** `SELECT` titles that are dictionary names (`TERYT_DOWODOWY`) — use `Województwo`;
   `Zgoda_sekcja` → `Zgoda`; typo `pełnomonictwo`; empty-string `defaultValue` on `ulica_siedziba`; trailing `\r\n` in queries.
   (Keep them only if asked to reproduce `test1-output.json` byte-for-byte.)
6. The reference uses empty `validation` arrays, and the schema leaves the item shape unspecified.
   Apply the string-identifier representation and selection rules in §3 and §11.

## 8. Procedure

1. Read `testN-input.json`; rebuild lines in reading order (§2). Note low-confidence lines.
2. Extract the title, addressee, explicit and implied inputs, choices, and requirements from the source and
   approved rules (§2, §12). Capture each choice’s full option set and selection rules. For each attachment,
   identify the document, who supplies it, when it applies, and whether it is required or optional.
3. Resolve value sources across the whole form and every branch (§4). Record confirmed external mappings first,
   then applicable defaults and remaining manual inputs.
4. Build tabs from §5 + §6. Choose the most specific field types (§3) and serialize the resolved value sources (§4).
   Match choice fields against §13 and bind applicable dictionaries using the target configuration. Generate UUIDs,
   compute grid positions and order, and derive unique `techName`s (§3).
5. Add visibility, validators, and dependencies (§3, §11, §12) using the resolved source and answer format of each
   field. Build `flow.links`.
6. Review the submission paths in §12, check §9 and run the deterministic validator in §10 on the draft.
   Mark the form ready for submission only after mandatory constraints are enforceable and the checks pass.
7. Report the title, tabs, field count, low-confidence OCR lines, resolved source conflicts, unresolved pre-fill mappings,
   and any unresolved rules or submission blockers from §12.

## 9. Hard rules (checklist)

- Valid JSON, UTF-8, real Polish diacritics in `title`/`description`/`name`; ASCII only in `techName`.
- Every UUID unique; every `flow` source/target is an existing tab id; no orphan tab.
- Every tab-level question is a `SECTION`; `repeatingSectionGrid` only on sections.
- Every `techName` unique file-wide; every `states.query` points at existing tab titles / techNames.
- Every external reference in `defaultValue` must have `defaultValueType: "EXTERNAL_SYSTEM"` on the same field.
  Every `"EXTERNAL_SYSTEM"` field must have exactly one allowed reference as its string `defaultValue` (§4, §10).
- Check that every explicit or implied choice has a matching control with all confirmed options, including
  choices written only in prose (§2). Report any unresolved choice or missing option.
- For each dictionary binding, verify scope, permitted control, selection count, technical ID and compatibility
  with any pre-fill or default (§13).
- Review each manual input for a confirmed automatic source belonging to the correct person or entity (§4).
- Verify validator scope, requiredness, relationship checks, and conditional uploads across active branches (§3, §11, §12).
- Review each `TEXT_FIELD` before publication. If the field's meaning and the available controls establish
  a more specific type, use that type (§3).
- Ground substantive form content in the OCR or approved requirements, including any requirement represented
  by an input inferred from prose (§12). Omit the signature
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

## 11. Validation catalog

Here `s` is the answer as a string. Regexes are written as JavaScript regex source, without delimiters.
`—` means the regex is the complete check. Use the `u` flag only where specified. Treat a predicate
exception as a failed check, including invalid calendar dates. The application implements the rules in this
catalog and resolves validator IDs to those implementations. In regex cells, `\|` is Markdown escaping
for the alternation operator `|`.

```js
const d = s => [...s].map(c => /\d/.test(c) ? +c : c.charCodeAt(0) - 55);
const S = (s, w) => w.reduce((a, wi, i) => a + wi * d(s)[i], 0);
```

| Expected value | Validator ID | Regex | Additional JS predicate |
|---|---|---|---|
| PESEL | `PESEL` | `^\d{11}$` | `(10 - S(s,[1,3,7,9,1,3,7,9,1,3]) % 10) % 10 === d(s)[10]` |
| NIP | `NIP` | `^\d{10}$` | `S(s,[6,5,7,2,3,4,5,6,7]) % 11 === d(s)[9]` |
| REGON-9 | `REGON_9` | `^\d{9}$` | `S(s,[8,9,2,3,4,5,6,7]) % 11 % 10 === d(s)[8]` |
| REGON-14 | `REGON_14` | `^\d{14}$` | `S(s,[2,4,8,5,0,9,7,3,6,1,2,4,8]) % 11 % 10 === d(s)[13]` |
| Dowód osobisty | `ID_CARD` | `^[A-Z]{3}\d{6}$` | `S(s,[7,3,1,9,7,3,1,7,3]) % 10 === 0` |
| Paszport | `PASSPORT` | `^[A-Z]{2}\d{7}$` | `S(s,[7,3,9,1,7,3,1,7,3]) % 10 === 0` |
| NRB / IBAN PL (26 cyfr) | `NRB` | `^\d{26}$` | `BigInt(s.slice(2) + "2521" + s.slice(0,2)) % 97n === 1n` |
| Karta płatnicza / IMEI (Luhn) | `LUHN` | `^\d{13,19}$` | `[...s].reverse().reduce((a,c,i)=>{c=+c; if(i%2){c*=2; if(c>9)c-=9} return a+c},0) % 10 === 0` |
| EAN-13 / ISBN-13 | `EAN_13` | `^\d{13}$` | `[...s].reduce((a,c,i)=>a + c*(i%2?3:1),0) % 10 === 0` |
| Księga wieczysta | `LAND_REGISTER` | `^[A-Z0-9]{4}/\d{8}/\d$` | `[...s.replace(/\//g,"")].slice(0,12).reduce((a,c,i)=>a+[1,3,7][i%3]*"0123456789XABCDEFGHIJKLMNOPRSTUWYZ".indexOf(c),0) % 10 === +s.slice(-1)` |
| PWZ lekarza | `PWZ` | `^\d{7}$` | `[1,2,3,4,5,6].reduce((a,w,i)=>a+w*d(s)[i+1],0) % 11 === d(s)[0]` |
| KRS | `KRS` | `^\d{10}$` | — |
| Kod pocztowy | `ZIP_CODE` | `^\d{2}-\d{3}$` | — |
| Telefon PL | `PHONE_PL` | `^(\+48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$` | — |
| Telefon (E.164) | `PHONE_E164` | `^\+[1-9]\d{1,14}$` | — |
| E-mail | `EMAIL` | `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` | `s.length <= 254` |
| PKD | `PKD` | `^\d{2}\.\d{2}\.[A-Z]$` | — |
| SWIFT/BIC | `SWIFT_BIC` | `^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$` | — |
| CVV | `CVV` | `^\d{3,4}$` | — |
| Data ważności karty | `CARD_EXPIRY` | `^(0[1-9]\|1[0-2])\/\d{2}$` | `new Date(2000 + +s.slice(3), +s.slice(0,2), 1) > new Date()` |
| Kwota | `AMOUNT` | `^\d+([.,]\d{1,2})?$` | `parseFloat(s.replace(",", ".")) > 0` |
| Imię i nazwisko | `FULL_NAME` | `^\p{L}[\p{L}'\- ]*$` (flag `u`) | — |
| VIN | `VIN` | `^[A-HJ-NPR-Z0-9]{17}$` | — |
| TERYT (województwo) | `TERYT_WOJEWODZTWO` | `^\d{2}$` | — |
| TERYT (powiat) | `TERYT_POWIAT` | `^\d{4}$` | — |
| TERYT (gmina) | `TERYT_GMINA` | `^\d{7}$` | — |
| IPv4 | `IPV4` | `^(\d{1,3}\.){3}\d{1,3}$` | `s.split(".").every(o => +o <= 255)` |
| UUID | `UUID` | `^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | — |
| Data (RRRR-MM-DD) | `DATE_ISO` | `^\d{4}-\d{2}-\d{2}$` | `new Date(s).toISOString().slice(0,10) === s` |
| Stawka VAT | `VAT_RATE` | `^(0\|5\|8\|23\|zw\|np)$` | — |

## 12. Form logic and submission checks

### Extract obligations and conditions

Before assigning controls, read the complete source text, including footnotes, instructions, option labels,
eligibility statements and attachment lists. For each actionable requirement, identify the affected role,
trigger, required input or action, and evidence in the source. Carry it into the form even when the paper
document expresses it in prose without a dedicated blank. Use approved process rules when they are supplied.
Resolve ambiguous wording against the source and flag any remaining uncertainty.

Apply `REQUIRED` wherever an answer is needed in the active branch. Apply the same rule to a controlling choice
when the rest of a required block depends on it. Mark contact details and other data required only when the
source or an approved process rule establishes that obligation. If the source allows one of several answers
or methods, require an allowed alternative as a group. A default can initialize a choice, but the user must
still make or retain a valid selection when the choice is required. A required read-only field needs a
reliable confirmed value source or an approved way to continue when the value is unavailable.

### Model complete branches and conditional actions

- Give every supported branch a complete path through its required inputs. Use a recognized, non-empty
  controller value before activating a dependent branch. For an unanswered or cleared choice, keep dependent
  branches inactive and require the controller if the decision is mandatory. Revalidate dependencies when
  a controller changes. Inactive values must never satisfy an active branch's requirements or block submission.
- For multi-field data such as addresses, derive the components and requiredness for each address type and
  country from the source and approved rules. Include the components needed to represent the requested address,
  allowing for country-specific variations and cases where a component does not exist. Keep a domestic format
  validator scoped to the domestic field or branch. A mandatory address cannot be submitted as an empty block.
- Use an authoritative, applicable dictionary or supplied list when the answer must identify one member of a
  known set. Verify that the source covers the correct scope and returns the expected values. If the set is
  closed but its entries are missing, report the missing source and keep the membership constraint unresolved.
  Use free text where unrestricted input is permitted.
- For eligibility, enforce only what the form can verify using values, evidence, or declarations called for by
  the source or an approved process rule. A name or a syntactically valid identifier cannot establish eligibility
  by itself. Report any eligibility condition that remains unverified with the available evidence.

### Recognize attachments in paper forms

Read each document mention with its verb, heading, and footnotes. A paper form can ask for an attachment
without a printed input or the word “upload”. A heading such as `Do wniosku załączam` can govern a list
across several OCR lines. Carry its meaning and any qualifications through to each listed item.

| Source wording | Digital form |
|---|---|
| `Do wniosku należy dołączyć kopię mapy` | Add a `FILE_UPLOADER` titled `Kopia mapy` with `REQUIRED`. |
| `Jeżeli wniosek składa pełnomocnik, dołącza pełnomocnictwo` | Show and require the upload only in the proxy branch. |
| `Można dołączyć zdjęcia` | Offer an optional upload. An empty upload must pass validation. |
| `Podaj numer decyzji` or `Dokument należy okazać do wglądu` | Collect the requested number or display the instruction. Neither phrase asks the applicant to submit a copy. |

Create one clearly labelled upload for each independently requested document. Reuse an existing upload
when it covers the same document, person and condition. If either of two documents suffices, accept either
one. Where a declaration, registry lookup or separate delivery channel is expressly allowed, preserve that
path and require a file only on a path that calls for one. If the submission method is ambiguous, flag the
source passage for review.

Before finalizing, trace each attachment in the source to its upload, permitted alternative or review item,
and each generated upload back to a source requirement or approved rule. Check that a missing required file
blocks only the applicable branch. A checkbox confirming an attachment or a list of document names alone
cannot fulfill a requirement to submit the file.

### Enforce value bounds and relationships

- Pair a specialized field type with the supported validation rules needed for the answer. Enforce whole numbers
  for discrete counts, non-negative values for ordinary counts, and a minimum of one where the answer requires at
  least one item. Apply upper and lower bounds and text length limits only when the source, the meaning of the
  answer, or confirmed reference data establishes them. Use the selected option's verified limit for a
  choice-dependent bound.
- Infer the ordering of values when two fields clearly form a beginning and end, a lower and upper limit, or
  another ordered pair. Validate the relationship on typed values after each participating input passes its own
  format checks. Allow equal endpoints when the source or meaning permits equality. Apply temporal and numerical
  comparisons only to the relevant active fields. Missing required values are handled by presence checks.
- Represent range, comparison and conditional requiredness with confirmed runtime validation features. Reference
  the actual output field identifiers and identify the trigger, failure condition and affected field. Use
  `states` for visibility. If visibility exactly matches the required condition, attach `REQUIRED` to that
  branch's field. If a field remains visible while its requiredness changes, use supported conditional validation.
- For a rule the target cannot express, report the affected fields, condition and expected validation in the
  final review. Mark a mandatory unenforced rule as a submission blocker in that review. Keep the draft valid
  JSON and use only supported rule IDs and configuration keys. A control type, help text or a visibility
  condition alone does not enforce a submission constraint.

### Handle notices, acknowledgments and consent

Identify the intended action in the source and any approved wording. Render an informational notice as
content. Add a required acknowledgment only when an approved requirement calls for confirming that it was read.
Use `CONSENT_SECTION` for an actual consent action on the terms confirmed for this process. Preserve approved
wording and explicit user choice where applicable. Refer ambiguous or conflicting privacy text to the responsible
owner for review. Reusable blocks supply layout patterns, while the current approved source determines which
privacy actions and wording belong in the form.

### Review submission paths

Review every branch with a complete valid answer and a missing or invalid required answer. Include unanswered
controllers, branch switches, missing conditional attachments, boundary values, and broken relationships where
applicable. Verify that supported rules can block invalid submission, that valid active paths can complete, and
that required data can actually be entered, retrieved, selected or uploaded. Record unresolved requirements and
any constraints that still need runtime support or confirmation.

## 13. Predefined eUsługi dictionaries

After the pre-fill pass (§4), check each field against the catalog below. A dictionary supplies the allowed
answers. The user's selection or an authorized pre-fill supplies the answer. Bind a dictionary when its scope,
granularity and selection rules match the field. Preserve narrower option sets specified by the source.

| Dictionary from the specification | When to use it | Permitted control |
|---|---|---|
| Województwo | A Polish address asks for a voivodeship. | Dropdown (`SELECT`) only |
| Powiat | A Polish address asks for a county. | Dropdown (`SELECT`) only |
| Gmina | A Polish address asks for a municipality. | Dropdown (`SELECT`) only |
| Miejscowość | A Polish address asks for a locality. Check that the field accepts localities within the dictionary's scope. | Dropdown (`SELECT`) only |
| Kraje | The answer identifies a country, including country of birth, citizenship when expressed as a country, residence or an address abroad. | Dropdown (`SELECT`) only |
| Numery kierunkowe | The answer identifies the international calling prefix for a telephone number. Bind the dictionary to the prefix component. Preserve a complete number supplied by an external source unless the platform supports mapping its components. | Dropdown, radio or checkbox as supported by the configuration. A single phone number takes one prefix. |

### Project dictionary · Rasy psów

When the requested answer identifies a dog's breed, use a single-select dropdown bound to the project dictionary
**Rasy psów**. Recognize both an explicit label such as `Rasa psa` and a label such as `Rasa` in a section titled
`Dane psa`. If the section covers several species, apply the binding only in the dog branch. A question such as
`Czy pies jest rasowy?` keeps its yes/no choices. When the form permits only a specific subset of breeds,
use the dictionary only if the configured selection can enforce that subset (§12).

For this project's generated forms, use the following binding unless the target catalog supplies a different
technical identifier. The example shows only the dictionary-related part of the field.

```json
{
    "type": "SELECT",
    "dictionaryName": "RASY_PSOW",
    "options": []
}
```

The target application must register the breed dictionary under the same identifier. If its catalog is supplied
and lacks the dictionary, report the missing binding under the rules below. Leave the initial selection empty
unless the form provides an approved default. When the form allows answers such as `Mieszaniec` or `Rasa nieznana`,
verify that the catalog or a source-defined alternative accepts them. Report any gap in coverage.

### Project dictionary · Marki samochodów

When the form asks for a car's make, use a single-select dropdown bound to **Marki samochodów**. Recognize
`Marka samochodu` and shorter labels such as `Marka` where the surrounding section identifies a car. For
`Marka pojazdu`, check which vehicle categories the form accepts. If the dictionary covers only some of them,
apply it in the matching branches and preserve the permitted answers in the others.

For a combined prompt such as `Marka i model samochodu`, create two fields in the same vehicle section.
Bind `Marka` to the make dictionary. Use a text field for `Model` when the source permits free entry.
If the form describes multiple cars, keep each make and model together under the corresponding vehicle.

Use this project binding unless the target catalog specifies a different technical identifier for car makes.

```json
{
    "type": "SELECT",
    "dictionaryName": "MARKI_SAMOCHODOW",
    "options": []
}
```

The target application supplies the entries. If a supplied catalog lacks the dictionary, omit the unresolved
binding and report it in the review. Preserve any source-defined restriction on allowed makes (§12).

### Binding and values

**Binding.** Set `field.dictionaryName` to the exact technical identifier from the target configuration.
The reference confirms `Kraje` for countries and shows `TERYT_DOWODOWY` and `TERYT_4G_DOWODOWY` in specific
address blocks. For territorial data, verify which levels the configured dictionary returns, whether it uses
a hierarchy or separate controls, and which values it stores. Reuse the confirmed configuration only for a
matching field. Use a territorial hierarchy only in the Polish branch of an address. If separate controls
depend on a parent selection, scope the child entries to the selected parent and recheck them when it changes.

The catalog labels above identify the dictionaries by meaning. Where a technical identifier is missing,
report the field and the dictionary to bind in the review. Use only verified identifiers in the JSON.
Keep the human-readable field title separate from the binding. Restrict dictionary bindings to dropdowns,
radio buttons and checkboxes, subject to the narrower restrictions in the table. Select one or multiple
entries only as the form requires and the control supports. Use the target's confirmed configuration for
multiplicity and its exact field type token for a checkbox.

**Values.** Let the platform load entries from the bound dictionary. Keep `options: []` where the field
shape requires the array and the dictionary supplies the entries. Store the selected entry in the platform's
expected representation. Check that any initial value, condition or validator uses the same code or label.
A dictionary binding alone does not select a default. For external pre-fill, retain the §4 reference pair and
verify that the resolved value maps unambiguously to an entry through a supported mapping. Report incompatible
mappings for review. For an ordinary dictionary default on a `SELECT`, use the array convention in §7.

**Optional extensions.** When a recurring closed set has no applicable predefined dictionary, the review may
propose a new one. Give its name, item structure (stored identifier, display label and any necessary parent
link), and the fields where it would be used. Bind it in a form only once its technical configuration is confirmed.
