/**
 * Monthly profit & loss from what the salon already records: invoices (revenue net of GST), back-bar and retail
 * stock used at cost, payroll and the expense book. GST collected is a liability, not income, so it is excluded.
 */
export type PnlInput = {
  invoices: { taxable_value: number; items?: { kind: string; taxable_value: number }[] }[];
  productCost: number; // retail products sold + back-bar consumed, at unit cost
  payroll: number; // employer cost of staff for the period
  expenses: { category: string; amount: number }[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function profitAndLoss(p: PnlInput) {
  const revenue = r2(p.invoices.reduce((s, i) => s + Number(i.taxable_value), 0));
  const productSales = r2(p.invoices.flatMap((i) => i.items ?? []).filter((it) => it.kind === "product").reduce((s, it) => s + Number(it.taxable_value), 0));
  const byCategory = new Map<string, number>();
  for (const e of p.expenses) byCategory.set(e.category, r2((byCategory.get(e.category) ?? 0) + Number(e.amount)));
  const expenses = r2(p.expenses.reduce((s, e) => s + Number(e.amount), 0));
  const grossProfit = r2(revenue - p.productCost);
  const net = r2(grossProfit - p.payroll - expenses);
  return {
    revenue, serviceRevenue: r2(revenue - productSales), productSales, productCost: r2(p.productCost),
    grossProfit, payroll: r2(p.payroll), expenses, expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    net, margin: revenue ? Math.round((net / revenue) * 1000) / 10 : 0,
  };
}
