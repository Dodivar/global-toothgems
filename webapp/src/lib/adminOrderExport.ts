import type { AdminOrder } from "../data/adminOrders";
import { customerName, orderItemCount } from "../data/adminOrders";
import { csvAmount, toCsv } from "./adminAnalyticsMapping";

export const ORDER_EXPORT_COLUMNS = [
  "reference",
  "placedOn",
  "status",
  "payment",
  "fulfillment",
  "customer",
  "email",
  "items",
  "currency",
  "subtotal",
  "discount",
  "shipping",
  "tax",
  "total",
  "giftCard",
  "charged",
  "refunded",
] as const;

export type OrderExportColumn = (typeof ORDER_EXPORT_COLUMNS)[number];

/** A spreadsheet reads a cell starting with = + - @ as a formula: customer-typed text gets a leading quote. */
const plain = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

/**
 * The orders as spreadsheet rows (header first). Statuses are the codes the
 * database keeps, so the file reads the same whatever language the back office
 * is in; amounts are plain decimals of the order's own currency.
 */
export function orderExportRows(orders: AdminOrder[], headers: Record<OrderExportColumn, string>): (string | number)[][] {
  return [
    ORDER_EXPORT_COLUMNS.map((column) => headers[column]),
    ...orders.map((order) => [
      order.reference,
      order.placedAt.slice(0, 10),
      order.status,
      order.payment.status,
      order.fulfillment,
      plain(customerName(order.customer)),
      plain(order.customer.email),
      orderItemCount(order),
      order.currency,
      csvAmount(order.amounts.subtotal),
      csvAmount(order.amounts.discount),
      csvAmount(order.amounts.shipping),
      csvAmount(order.amounts.tax),
      csvAmount(order.amounts.total),
      csvAmount(order.amounts.giftCard),
      csvAmount(order.amounts.charged),
      csvAmount(order.amounts.refunded),
    ]),
  ];
}

export function ordersCsv(orders: AdminOrder[], headers: Record<OrderExportColumn, string>): string {
  return toCsv(orderExportRows(orders, headers));
}
