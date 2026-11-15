/**
 * Indian statutory payroll deductions (rates as notified; verify against current notifications before filing):
 * - EPF: employee 12% of basic (wage ceiling ₹15,000); employer 12% split EPS 8.33% (capped) + EPF 3.67%.
 * - ESI: if gross ≤ ₹21,000/month — employee 0.75%, employer 3.25%.
 * - Professional tax: state slabs on monthly gross (Feb top-up in MH/KA).
 */
export const PF_CEILING = 15000, ESI_CEILING = 21000;

export function professionalTax(stateCode: string | null | undefined, gross: number, month: number, gender?: string | null): number {
  switch (stateCode) {
    case "27": // Maharashtra
      if (gender === "female") return gross <= 25000 ? 0 : month === 2 ? 300 : 200;
      return gross <= 7500 ? 0 : gross <= 10000 ? 175 : month === 2 ? 300 : 200;
    case "29": // Karnataka
      return gross < 25000 ? 0 : month === 2 ? 300 : 200;
    case "19": // West Bengal
      return gross <= 10000 ? 0 : gross <= 15000 ? 110 : gross <= 25000 ? 130 : gross <= 40000 ? 150 : 200;
    case "24": // Gujarat
      return gross <= 12000 ? 0 : 200;
    case "36": case "37": // Telangana, Andhra Pradesh
      return gross <= 15000 ? 0 : gross <= 20000 ? 150 : 200;
    default:
      return 0; // e.g. Delhi, UP, Haryana levy no PT; TN/Kerala are half-yearly (not modelled)
  }
}

export function statutory(p: { basic: number; gross: number; stateCode?: string | null; month: number; gender?: string | null; pf: boolean; esi: boolean }) {
  const pfWage = Math.min(p.basic, PF_CEILING);
  const pf_employee = p.pf ? Math.round(pfWage * 0.12) : 0;
  const eps = p.pf ? Math.round(pfWage * 0.0833) : 0;
  const epf_employer = p.pf ? Math.round(pfWage * 0.12) - eps : 0;
  const esiApplies = p.esi && p.gross > 0 && p.gross <= ESI_CEILING;
  const esi_employee = esiApplies ? Math.ceil(p.gross * 0.0075) : 0;
  const esi_employer = esiApplies ? Math.ceil(p.gross * 0.0325) : 0;
  const pt = professionalTax(p.stateCode, p.gross, p.month, p.gender);
  return {
    pf_employee, eps, epf_employer, esi_employee, esi_employer, pt,
    employee_deductions: pf_employee + esi_employee + pt,
    employer_contributions: eps + epf_employer + esi_employer,
  };
}
