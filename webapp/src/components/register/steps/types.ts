import type { FieldName, RegistrationData } from "../../../lib/registration";

/** What every step receives from the page, which owns the one form state. */
export interface StepProps {
  data: RegistrationData;
  /** Translated error per field, already filtered to the ones that should show. */
  errors: Partial<Record<FieldName, string>>;
  set: <K extends FieldName>(name: K, value: RegistrationData[K]) => void;
  blur: (name: FieldName) => void;
  /** Registers a control so the page can move focus to the first invalid one. */
  fieldRef: (name: FieldName) => (el: HTMLElement | null) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}
