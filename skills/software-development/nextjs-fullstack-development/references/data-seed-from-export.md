# Seed a Prisma DB from an exported data file (Money Manager XLSX pattern)

Goal: load legacy/exported rows into the app DB so the dashboard shows real (not sample) data.

## Parse step (xlsx → json)

openpyxl available at `C:/Python314/python.exe` (openpyxl 3.1.5) — the git-bash `python` is a different venv WITHOUT openpyxl, so invoke the explicit interpreter path.

Keys on the Money Manager sheet: `Date | Account | Category | Subcategory | Note | IDR | Income/Expense | Description | Amount | Currency | Account`.

- Sum column F (`IDR`), never `Amount` (text mirror) or trailing `Account` (duplicate).
- `Income/Expense` ∈ {Income, Expense, Transfer-Out}.
- Clean: `Date` gives a datetime; serialize to string; skip rows with empty/`None`/`Date` header leak. The 1291-row export survives to 1291 clean rows.
- Normalize contaminated categories BEFORE seeding: rows whose `Category` equals an account name (`Blu by BCA`, `BCA`, `BTN`, `Jago`, `HSBC`) are transfers — map to a `Transfer` category, not their account-name string.
- Write result to `money_data.json` (list of dicts) as the single seed source.

## Seed step (json → prisma)

`prisma/seed.ts` (tsx, bcryptjs):

1. `JSON.parse(readFileSync(...))` the exported json.
2. Upsert users: a role enum (`owner` / `manager`) for multi-user dashboards, bcrypt-hashed passwords.
3. Collect distinct account names → `account.createMany`; map name → id for FK linkage.
4. Build category set unique per `(type, name)`, `category.upsert` each, map → id.
5. `transaction.createMany` in batches of ~200 (Prisma default fluent limit); each row gets `userId` + resolved `accountId` + `categoryId`.

Confirm with `transaction.count()` at the end of the seed.

## Balance calculation

Derived account balance from transactions (NOT a stored field):

| Transaction Type | Effect on Account |
|------------------|-------------------|
| Income           | + amount to `accountId` |
| Expense          | – amount from `accountId` |
| Transfer-Out     | – amount from source (`accountId`), + amount to destination (lookup `rawCategory` name → `accountId`) |

Implement in `app/lib/balances.ts` as a server function that queries transactions, groups by account, and derives the running balance. Return with API response for the Accounts page.

**Key insight**: Transfer-Out rows reference the destination bank in `rawCategory`. If it matches an account name, credit that account; otherwise the transfer is to an unregistered destination (treated as external).