import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ALLOWED_SHIFT_CODES } from '@/application/shift-registration/allowed-shift-codes'
import type { ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import {
  validateShiftRegistrationForm,
  type ShiftRegistrationFieldErrors,
} from '@/application/shift-registration/validate-shift-registration-form'
import type { MasterData } from '@/domain/master/master-data'
import { fieldErrorTranslationKey } from '@/features/shift-registration/field-error-messages'

interface DateFieldProps {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}

function DateField({ id, label, value, error, onChange }: DateFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 rounded-md border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface SelectFieldProps {
  id: string
  label: string
  value: string
  error?: string
  disabled?: boolean
  placeholder: string
  options: readonly { readonly value: string; readonly label: string }[]
  onChange: (value: string) => void
}

function SelectField({ id, label, value, error, disabled, placeholder, options, onChange }: SelectFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 rounded-md border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface ShiftRegistrationFormProps {
  values: ShiftRegistrationFormValues
  masterData: MasterData
  onValuesChange: (values: ShiftRegistrationFormValues) => void
  onSubmit: (values: ShiftRegistrationFormValues) => void
}

/**
 * Shift Registration form (Phase 18 wiring correction §1/§2/§3): Shift
 * Code, Sector, and Sampling House are all closed selectors — never free
 * text. Shift Code is the fixed DS/NS set; Sector/Sampling House render
 * whatever `masterData` actually contains, never a hardcoded list.
 * Sampling House options are filtered to the selected Sector (identity
 * is Sector+Code, never Code alone — the same code can legitimately
 * exist under different sectors), and changing Sector always clears an
 * already-selected Sampling House that is no longer valid under the new
 * Sector, rather than silently keeping a cross-sector selection.
 */
export function ShiftRegistrationForm({ values, masterData, onValuesChange, onSubmit }: ShiftRegistrationFormProps) {
  const { t } = useTranslation()
  const [fieldErrors, setFieldErrors] = useState<ShiftRegistrationFieldErrors>({})
  const dateId = useId()
  const shiftCodeId = useId()
  const sectorCodeId = useId()
  const samplingHouseCodeId = useId()

  const samplingHouseOptions = masterData.samplingHouses
    .filter((house) => house.sectorCode === values.sectorCode)
    .map((house) => ({ value: house.code as string, label: house.code as string }))

  function updateField(field: keyof ShiftRegistrationFormValues, value: string) {
    if (field === 'sectorCode') {
      const stillValid = masterData.samplingHouses.some(
        (house) => house.sectorCode === value && house.code === values.samplingHouseCode,
      )
      onValuesChange({
        ...values,
        sectorCode: value,
        samplingHouseCode: stillValid ? values.samplingHouseCode : '',
      })
      setFieldErrors({ ...fieldErrors, sectorCode: undefined, samplingHouseCode: undefined })
      return
    }
    onValuesChange({ ...values, [field]: value })
    if (fieldErrors[field]) {
      setFieldErrors({ ...fieldErrors, [field]: undefined })
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const validation = validateShiftRegistrationForm(values, masterData)
    if (validation.valid) {
      setFieldErrors({})
      onSubmit(values)
    } else {
      setFieldErrors(validation.fieldErrors)
    }
  }

  function translatedError(code: string | undefined): string | undefined {
    return code ? t(fieldErrorTranslationKey(code)) : undefined
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DateField
        id={dateId}
        label={t('shiftStart.fields.date')}
        value={values.shiftDate}
        error={translatedError(fieldErrors.shiftDate)}
        onChange={(value) => updateField('shiftDate', value)}
      />
      <SelectField
        id={shiftCodeId}
        label={t('shiftStart.fields.shiftCode')}
        value={values.shiftCode}
        error={translatedError(fieldErrors.shiftCode)}
        placeholder={t('shiftStart.fields.selectShiftCode')}
        options={ALLOWED_SHIFT_CODES.map((code) => ({
          value: code,
          label: t(`shiftStart.shiftCodeOptions.${code}`),
        }))}
        onChange={(value) => updateField('shiftCode', value)}
      />
      <SelectField
        id={sectorCodeId}
        label={t('shiftStart.fields.sectorCode')}
        value={values.sectorCode}
        error={translatedError(fieldErrors.sectorCode)}
        placeholder={t('shiftStart.fields.selectSectorCode')}
        options={masterData.sectors.map((sector) => ({ value: sector.code as string, label: sector.code as string }))}
        onChange={(value) => updateField('sectorCode', value)}
      />
      <SelectField
        id={samplingHouseCodeId}
        label={t('shiftStart.fields.samplingHouseCode')}
        value={values.samplingHouseCode}
        error={translatedError(fieldErrors.samplingHouseCode)}
        disabled={!values.sectorCode}
        placeholder={t('shiftStart.fields.selectSamplingHouseCode')}
        options={samplingHouseOptions}
        onChange={(value) => updateField('samplingHouseCode', value)}
      />

      <Button type="submit" size="lg" className="mt-2 w-full">
        {t('shiftStart.form.submit')}
      </Button>
    </form>
  )
}
