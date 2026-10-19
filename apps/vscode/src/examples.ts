export const EMPTY_BOARD = 'title New board\n';

const EXAMPLE_TITLE = 'title Order Checkout';

const EXAMPLE_CONTENT = `actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290] (id agg_order)
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
command Ship Order [980, 300]
aggregate Order [1160, 290] (id agg_order_2)
event Order Shipped [1340, 300]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Design-level session: checkout flow [80, 80]

Customer -> Place Order
Place Order -> #agg_order
Place Order -> Payment Provider
#agg_order -> Order Placed
Order Placed -> Order Status
Order Placed -> When order placed, ship it
When order placed, ship it -> Ship Order
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped
`;

/** Order-checkout example (identical to the demo webapp), as a starting point. */
export const EXAMPLE_BOARD = `${EXAMPLE_TITLE}\n\n${EXAMPLE_CONTENT}`;

/**
 * The document with the example's stickies and arrows appended. What the file already holds (its
 * title, comments, other config lines) stays, so "Insert example" needs no confirmation (guide
 * §13.5); the line break style follows the document.
 */
export function withExampleInserted(documentText: string): string {
  const lineBreak = documentText.includes('\r\n') ? '\r\n' : '\n';
  const content = EXAMPLE_CONTENT.replace(/\n/g, lineBreak);
  if (documentText.trim() === '') return `${documentText}${content}`;
  const terminated = /\r?\n$/.test(documentText) ? documentText : `${documentText}${lineBreak}`;
  const separated = /(\r?\n)[ \t]*\r?\n$/.test(terminated)
    ? terminated
    : `${terminated}${lineBreak}`;
  return `${separated}${content}`;
}
