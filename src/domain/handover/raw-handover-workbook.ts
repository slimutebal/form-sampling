/**
 * The still-untrusted, per-sheet shape produced by the Excel integration
 * layer (`@/integrations/excel/handover-workbook-reader`) after SheetJS
 * has done its parsing. Declared here — in domain, with no SheetJS
 * dependency — so both the integration layer (producer) and the
 * application layer (consumer, `@/application/handover/parse-handover-archive`)
 * can depend on this single plain-data contract without either one
 * depending on the other (rule 10: domain/application must not import
 * SheetJS).
 */
export interface RawHandoverWorkbook {
  /** `App_Data`'s Key/Value rows, reduced to a flat object. */
  readonly appData: Readonly<Record<string, unknown>>
  /** `Shift_Info`'s single data row, if present. */
  readonly shiftInfo: Readonly<Record<string, unknown>> | undefined
  readonly pendingSample: readonly Readonly<Record<string, unknown>>[]
  readonly samplePosition: readonly Readonly<Record<string, unknown>>[]
}
