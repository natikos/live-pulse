export type EventModel = BaseEvent & SpecificEvent;

interface BaseEvent {
  source: 'web' | 'mobile' | 'server';
  occurred_at: Date;
  user_id?: string;
  device_id?: string;
}

type SpecificEvent =
  | {
      type: 'page_view';
      payload: {
        page_id: PageId | (string & {});
        entity_id?: string;
        referrer?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
      };
    }
  | {
      type: 'purchase';
      payload: {
        order_id: string;
        sum: number;
        items: Array<{ id: string; unit_price: number; quantity: number }>;
      };
    }
  | {
      type: 'error';
      payload: {
        // Open on purpose: new values must not reject events (EVENT_CONTRACT.md).
        code:
          | 'validation'
          | 'unauthorized'
          | 'not_found'
          | 'conflict'
          | 'payment_declined'
          | 'network'
          | 'timeout'
          | 'internal'
          | 'unknown'
          | (string & {});
        operation:
          | 'add_to_cart'
          | 'remove_from_cart'
          | 'apply_promo'
          | 'create_order'
          | 'process_payment'
          | 'send_order_confirmation'
          | (string & {});
        page_id?: PageId | (string & {});
      };
    };

type PayloadOf<T extends SpecificEvent['type']> = Extract<
  SpecificEvent,
  { type: T }
>['payload'];

type PageViewEventPayload = PayloadOf<'page_view'>;
type PurchaseEventPayload = PayloadOf<'purchase'>;
type ErrorEventPayload = PayloadOf<'error'>;

// Shared by the model and the DTO, so the page list lives in one place.
export const PAGES = ['home', 'catalog', 'category', 'item', 'cart', 'checkout', 'my-orders'] as const;
export type PageId = (typeof PAGES)[number];
