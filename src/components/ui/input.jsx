
import React from "react"
import { cn } from "@/lib/utils"
import {
  detectInputKind,
  detectInputKindFromElement,
  maxLengthByKind,
  sanitizeInputByKind,
} from "@/shared/utils/inputSanitizer"

const Input = React.forwardRef(
  (
    {
      className,
      type,
      onChange,
      onInput,
      disableAutoSanitize = false,
      maxLength,
      ...props
    },
    ref
  ) => {
    const inputKind = React.useMemo(
      () =>
        detectInputKind({
          type,
          name: props.name,
          id: props.id,
          autoComplete: props.autoComplete,
          placeholder: props.placeholder,
          inputMode: props.inputMode,
        }),
      [type, props.name, props.id, props.autoComplete, props.placeholder, props.inputMode]
    )

    const applySanitize = React.useCallback(
      (event) => {
        if (disableAutoSanitize) return
        if (!event?.target) return

        const currentValue = event.target.value
        if (typeof currentValue !== "string") return

        const resolvedKind =
          inputKind && inputKind !== "none"
            ? inputKind
            : detectInputKindFromElement(event.target)

        const nextValue = sanitizeInputByKind(resolvedKind, currentValue)
        if (nextValue !== currentValue) {
          event.target.value = nextValue
        }
      },
      [disableAutoSanitize, inputKind]
    )

    const handleChange = React.useCallback(
      (event) => {
        applySanitize(event)
        onChange?.(event)
      },
      [applySanitize, onChange]
    )

    const handleInput = React.useCallback(
      (event) => {
        applySanitize(event)
        onInput?.(event)
      },
      [applySanitize, onInput]
    )

    const resolvedMaxLength =
      maxLength ?? (!disableAutoSanitize ? maxLengthByKind[inputKind] : undefined)

    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        maxLength={resolvedMaxLength}
        onChange={handleChange}
        onInput={handleInput}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
