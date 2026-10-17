# Event contract

**Status: agreed** (issue #1). This is the contract client teams integrate against; the server must behave exactly as described here. Any change to it is a contract change and needs a new decision in `docs/DECISIONS.md`.

## Envelope (common to all events)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"page_view"` \| `"purchase"` \| `"error"` | yes | Unknown type is **rejected** with a message naming the field. |
| `source` | `"web"` \| `"mobile"` \| `"server"` | yes | Which client sent the event. Used to split metrics by platform. |
| `occurred_at` | integer, Unix time in **milliseconds** (UTC, e.g. `1792262054802`) | yes | When it happened on the client. Seconds are not accepted: a value in seconds is far too small and is rejected by the range check. Strings (including ISO dates) are rejected. A value more than 5 minutes ahead of the server clock is rejected (5 minutes covers ordinary clock drift between the device and the server; the value is configuration, not hard-coded). Past values are accepted (clients may buffer events offline). |
| `user_id` | string | no | Known (logged-in) user. |
| `device_id` | string | yes for `web` and `mobile` | Device/visitor id. Always sent by clients, for every event type. |
| `payload` | object | yes | Shape depends on `type`. |

The server also stores `created_at` (when we received the event). Clients do not send it.

Identification rules:
- Clients (`web`, `mobile`) always send `device_id`, for every event type; `user_id` is added when the person is logged in. This lets errors be matched with what the same device did (for a possible future analysis of why people do not pay).
- Events with `source = "server"` have neither field required; `user_id` is added when the event concerns a specific person (e.g. a failed confirmation email).
- Unique people are counted by `user_id` when present, otherwise by `device_id`. Known limitation: a person who was anonymous and then logs in is counted twice.

Keys are `snake_case` only. Other spellings (`pageId`) are rejected, not normalised.

## `page_view`

| Field | Type | Required | Notes |
|---|---|---|---|
| `page_id` | `home` \| `catalog` \| `category` \| `item` \| `cart` \| `checkout` \| `my-orders` | yes | Agreed vocabulary, the same for web and mobile. A value outside the vocabulary is still **accepted and stored** (a new page may ship before this list is updated); events with unknown pages can be found by querying for them. |
| `entity_id` | string | required for `category` and `item` | Category id / item id. Not sent for the other pages. |
| `referrer` | string | no | Where the visitor came from. |
| `utm_source` | string | no | e.g. `newsletter`. |
| `utm_medium` | string | no | e.g. `email`. |
| `utm_campaign` | string | no | e.g. `autumn_sale`. |

`cart` and `checkout` mean "the visitor saw this screen", not "did an action". Skipping `cart` (add-last-item-and-go-to-checkout) is legal; funnels are counted by unique people per step, not by sequence.

## `purchase`

| Field | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Idempotency key. |
| `sum` | integer, minor units (kopiyky) | yes | What the customer actually paid (delivery and discounts included). Greater than 0. |
| `items` | array, not empty | yes | Purchased positions. |
| `items[].id` | string | yes | Item id, the same id as `entity_id` of the item page. |
| `items[].unit_price` | integer, minor units | yes | Price of one unit actually paid by the customer (after discounts). Position total is `unit_price * quantity`. |
| `items[].quantity` | integer > 0 | yes | |

`sum` is **not** required to equal the sum of the positions (delivery, promo codes). A mismatch alone never rejects the purchase.
Currency: there is a single currency, UAH. All amounts (`sum`, `unit_price`) are integers in kopiyky (1/100 UAH), and there is no currency field. Selling in another currency would be a contract change.

Duplicates: the first event for an `order_id` wins. A repeated event is not stored again and the client still gets a success response (`201` for a new event, `200` for a duplicate). Uniqueness is meant to be enforced by the database, not by application code.

## `error`

Errors are for analytics (counting, grouping, correlating with users who did not reach payment). Critical errors and stack traces are handled by a dedicated error tracker, not by this service.

| Field | Type | Required | Notes |
|---|---|---|---|
| `operation` | open vocabulary (e.g. `add_to_cart`), any non-empty string accepted | yes | What was being done. Business-level name, stable across routes and platforms. Also covers background work with no user action (cron jobs). |
| `code` | open vocabulary (e.g. `network`), any non-empty string accepted | yes | Short, stable error category used for grouping. |
| `page_id` | open, same as `page_view` (unknown values accepted and stored) | no | Where the user was. Only sent when known (clients). Not sent for background work. |

`operation`, `code` and `page_id` are open on purpose: a new page, operation or error kind must not cause an error event to be rejected and lost. Known values are listed in the TypeScript model for autocomplete only, and unknown values are found by querying the stored data. Decided by the client; the values are not validated against a list.

No free-text message: it is useless for grouping, may contain personal data, and needs a size limit. Stack traces are not accepted. Adding an optional message later is a safe extension.

The platform comes from the envelope `source`, so it is not repeated in the payload.

## Responses

- Accepted: success status (see duplicates above).
- Rejected: error message naming the offending field and the reason.

## Example

```json
{
  "type": "purchase",
  "source": "mobile",
  "occurred_at": 1792262054802,
  "user_id": "u_1842",
  "device_id": "d_77a1",
  "payload": {
    "order_id": "ord_90311",
    "sum": 2750000,
    "items": [
      { "id": "item_48213", "unit_price": 2500000, "quantity": 1 },
      { "id": "item_1002", "unit_price": 250000, "quantity": 1 }
    ]
  }
}
```
