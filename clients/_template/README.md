# Client template

Copy this folder to `clients/<client-id>/` (or run `npm run frontdesk -- init --client <client-id>`,
which does this for you) and edit `config.json`:

- `clientId` must match the folder name and the `CLIENT_ID` env var for that deployment.
- `hours` covers all 7 days. Use `null`/`null` for closed days.
- `pricesPolicy.note` is what the chat assistant and voice agent say instead of a number
  when `listedPrices` is `false`. Do not put real prices in `faq` if `listedPrices` is `false` -
  the assistant is only as careful as its source text.
- `faq` is the only source the assistant answers from. Anything not covered here gets a
  "let me take a message" response instead of a guess (see docs/DESIGN_NOTES.md, fact
  degradation finding).
- `emergencyRules` are keyword-triggered instructions checked before the general FAQ.
- `ownerNotificationEmail` receives lead and call alerts through Resend.
- `disclosureVersion` is stored on every consent record. Bump it any time the disclosure
  wording changes so old consents stay attributable to the wording they saw.

Run `npm run frontdesk -- verify --client <client-id>` after editing to confirm the config
is valid before provisioning.
