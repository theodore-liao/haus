/** The four Overview pills. Together they equal household net worth. */
export function overviewPillFigures(input: {
  investments: number;
  cash: number;
  realEstate: number;
  /** Vehicles and any other balance that is not cash, an investment, or a debt. */
  otherAssets: number;
  liabilities: number;
}) {
  return {
    investments: input.investments,
    cash: input.cash,
    property: input.realEstate + input.otherAssets,
    liabilities: -Math.abs(input.liabilities),
  };
}
