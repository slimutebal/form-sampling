# Google Apps Script Web App contract

The PWA uses one public, deployed Google Apps Script Web App endpoint configured at build time:

```dotenv
VITE_GOOGLE_APPS_SCRIPT_URL=
```

It sends no OAuth token, client secret, service-account credential, or Google client ID. Do not commit a production endpoint value.

## Master data read

The PWA loads master data with JSONP because Apps Script ContentService can
redirect to `script.googleusercontent.com`, where a browser `fetch` request
does not reliably receive CORS permission. The PWA generates the callback name
itself; it never accepts a callback name from configuration or user input.

The PWA requests:

```text
GET {VITE_GOOGLE_APPS_SCRIPT_URL}?action=masterData&callback={callbackName}
```

Apps Script must respond with JavaScript content, invoking that callback exactly
once with the following payload. Each table is an array of rows, including the
existing required header row as row zero. Cell values must preserve numeric
values in `Ore_Sampling_Config` as JavaScript numbers.

```js
callbackName({
  "tables": {
    "Employees": [["Employee_ID", "Name"]],
    "Crews": [["Crew_ID", "Name", "Job"]],
    "Sectors": [["Sector_Code"]],
    "Sampling_Houses": [["Sector_Code", "Sampling_House_Code"]],
    "Pile_Areas": [["Sector_Code", "Stockpile_Code", "Pile_ID", "Ore"]],
    "Haulers": [["Hauler_Code", "Name"]],
    "Trucks": [["Truck_ID", "Hauler_Code"]],
    "Ore_Sampling_Config": [["Ore", "Sampling_Interval", "Batch_Size", "Packing"]]
  }
});
```

The Apps Script implementation must validate the `callback` query parameter
before interpolating it into a response. Permit only a JavaScript identifier:
`/^[A-Za-z_$][A-Za-z0-9_$]*$/`. If it is missing or invalid, return a normal
error response and do not emit it. For a valid callback, use
`ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ');')`
and set its MIME type to `ContentService.MimeType.JAVASCRIPT`.

All eight tables are required. The PWA passes rows through its existing header, row, duplicate, and cross-reference validation before replacing IndexedDB cache. An invalid or failed response never replaces a valid cache.

## Future Shift Summary write

The future compatible call is:

```text
POST {VITE_GOOGLE_APPS_SCRIPT_URL}
Content-Type: application/json
```

with an `action` of `shiftSummary` and a payload representing the existing nine-column `Shift_Summary` contract, in this order:

```text
Shift_ID, Date, Shift, Sector, Sampling_House_Code, Rit_Total, Batch_Total, Increment_Total, Wrong_Truck_Total
```

This document does not introduce a new write workflow or business rules; it only reserves the endpoint shape.

## New Pile Master write

Creating a Pile_ID that does not yet exist in any master (the "New Pile Master" flow) writes it to the shared `Pile_Areas` sheet so it is available to every future shift, not just the one that created it. Because this mutates shared master data, the PWA only attempts this write while online (`src/infrastructure/device/connectivity.ts`); it never queues it for later like the offline outbox used elsewhere. This flow is reachable both from the post-workspace Piles list (`src/application/pile-master/activate-new-pile.ts`) and from the pre-workspace Fleet Setup step (`src/application/pile-master/create-pile-area-for-setup.ts`) — the transport and server contract below are identical for both.

### Transport: CORS-simple POST, write-then-verify

An earlier version of this contract specified `Content-Type: application/json` and read the response body directly. Both turned out not to work reliably against a deployed Apps Script Web App:

- `Content-Type: application/json` triggers a CORS preflight (`OPTIONS`) request, which the deployed Web App fails.
- Even a non-preflighted POST's response is not reliably readable: Apps Script responses redirect through `script.googleusercontent.com`, the same redirect/CORS behavior that makes a plain `fetch` GET unusable for the master-data read above (hence JSONP there).

The PWA therefore sends a **CORS-simple, fire-and-forget** POST and never reads its response body:

```text
POST {VITE_GOOGLE_APPS_SCRIPT_URL}
Content-Type: text/plain;charset=utf-8
mode: no-cors
```

with body:

```json
{
  "action": "addPileArea",
  "sectorCode": "BR1",
  "stockpileCode": "LS_18",
  "pileId": "L18_S99",
  "oreCode": "SAP"
}
```

`Content-Type: text/plain;charset=utf-8` keeps the request CORS-simple (no preflight); it must never be `application/json`. The request is sent with `mode: "no-cors"`, so the PWA cannot and does not inspect the response's status or body — it is purely fire-and-send.

Confirmation instead comes from a **write-then-verify** step: immediately after the POST, the PWA re-reads master data through the existing JSONP `MasterDataRemoteReader` (`src/integrations/google/apps-script-master-data-remote-reader.ts`) and checks the exact new row:

- no `Pile_ID` matching what was just sent → `APPS_SCRIPT_PILE_WRITE_UNVERIFIED` (the write may or may not have landed; the PWA cannot tell, and never assumes success);
- a matching `Pile_ID` but with a different `Sector_Code`/`Stockpile_Code`/`Ore` than what was sent → `DUPLICATE_PILE_ID` (someone/something else created a conflicting row, most likely a race with another shift);
- an exact match on all four columns → success.

The new Pile is never activated/selected locally (workspace or setup-time in-memory MasterData) before this verification succeeds — see `src/integrations/google/apps-script-pile-area-writer.ts`.

### Server contract (`doPost`)

```js
function doPost(e) {
  const payload = JSON.parse(e.postData.contents)
  // payload.action === "addPileArea"
}
```

Before appending the row, the Apps Script implementation must:

- validate `action` is `"addPileArea"`;
- validate all required fields (`sectorCode`, `stockpileCode`, `pileId`, `oreCode`) are present and non-blank;
- reject a `sectorCode` that does not exist in `Sectors`;
- reject an `oreCode` that does not exist in `Ore_Sampling_Config`;
- reject a `pileId` that already exists in `Pile_Areas`;
- on success, append exactly one row — `Sector_Code, Stockpile_Code, Pile_ID, Ore`, in that column order — to `Pile_Areas`.

Because the PWA never reads `doPost`'s response body (see above), the exact shape of that response is not part of this contract and does not need to match any particular format — the PWA's own guard is entirely the write-then-verify JSONP re-read.

Use `LockService` around the duplicate-`pileId` check and the row append together, so two concurrent requests for the same `Pile_ID` cannot both pass validation and both append (which would otherwise produce two conflicting rows for the same `Pile_ID`, defeating the PWA's own verification match). Do not hold the lock around anything else (e.g. the whole request) — only the check-then-append critical section needs it.

The Apps Script Web App URL must never be hardcoded in source; it is always read from `VITE_GOOGLE_APPS_SCRIPT_URL` at build time, per the top of this document.

The PWA's own `createPileAreaFromDraft` (`src/application/pile-master/create-pile-area-from-draft.ts`) performs the equivalent pre-flight checks (including canonical Pile_ID grammar derivation, see `docs/BUSINESS_RULES.md` BR-MASTER-004) against its own already-cached master data before this request is ever sent, but Apps Script remains the authoritative guard for the shared sheet — the PWA never assumes its local check is sufficient on its own.
