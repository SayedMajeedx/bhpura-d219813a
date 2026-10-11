/**
 * What an incubator still owes for its confirmed sales, to the fils. The parts are summed as
 * binary fractions, so 53.6 can come out as 53.599999999999994: shown as 53.600, but as the
 * payment field's maximum it refused the very amount on screen. Rounded to three decimals, the
 * precision the database keeps.
 */
export function incubatorAmountDue(
  sales: ReadonlyArray<{ status: string; net_due: number | string; paid_amount: number | string }>,
): number {
  const due = sales
    .filter((sale) => sale.status === "confirmed")
    .reduce((sum, sale) => sum + Number(sale.net_due) - Number(sale.paid_amount), 0);
  return Math.round(due * 1000) / 1000;
}
