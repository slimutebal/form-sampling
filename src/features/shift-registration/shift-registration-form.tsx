import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import {
  validateShiftRegistrationForm,
  type ShiftRegistrationFieldErrors,
} from '@/application/shift-registration/validate-shift-registration-form'
import { fieldErrorTranslationKey } from '@/features/shift-registration/field-error-messages'

interface FormFieldProps {
  id: string
  label: string
  value: string
  error?: string
  type?: string
  onChange: (value: string) => void
}

function FormField({ id, label, value, error, type = 'text', onChange }: FormFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
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

interface ShiftRegistrationFormProps {
  values: ShiftRegistrationFormValues
  onValuesChange: (values: ShiftRegistrationFormValues) => void
  onSubmit: (values: ShiftRegistrationFormValues) => void
}

export function ShiftRegistrationForm({ values, onValuesChange, onSubmit }: ShiftRegistrationFormProps) {
  const { t } = useTranslation()
  const [fieldErrors, setFieldErrors] = useState<ShiftRegistrationFieldErrors>({})
  const dateId = useId()
  const shiftCodeId = useId()
  const sectorCodeId = useId()
  const samplingHouseCodeId = useId()

  function updateField(field: keyof ShiftRegistrationFormValues, value: string) {
    onValuesChange({ ...values, [field]: value })
    if (fieldErrors[field]) {
      setFieldErrors({ ...fieldErrors, [field]: undefined })
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const validation = validateShiftRegistrationForm(values)
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
      <FormField
        id={dateId}
        type="date"
        label={t('shiftStart.fields.date')}
        value={values.shiftDate}
        error={translatedError(fieldErrors.shiftDate)}
        onChange={(value) => updateField('shiftDate', value)}
      />
      <FormField
        id={shiftCodeId}
        label={t('shiftStart.fields.shiftCode')}
        value={values.shiftCode}
        error={translatedError(fieldErrors.shiftCode)}
        onChange={(value) => updateField('shiftCode', value)}
      />
      <FormField
        id={sectorCodeId}
        label={t('shiftStart.fields.sectorCode')}
        value={values.sectorCode}
        error={translatedError(fieldErrors.sectorCode)}
        onChange={(value) => updateField('sectorCode', value)}
      />
      <FormField
        id={samplingHouseCodeId}
        label={t('shiftStart.fields.samplingHouseCode')}
        value={values.samplingHouseCode}
        error={translatedError(fieldErrors.samplingHouseCode)}
        onChange={(value) => updateField('samplingHouseCode', value)}
      />

      <Button type="submit" size="lg" className="mt-2 w-full">
        {t('shiftStart.form.submit')}
      </Button>
    </form>
  )
}
