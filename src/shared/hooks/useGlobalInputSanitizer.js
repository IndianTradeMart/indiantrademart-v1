import { useEffect } from "react"
import {
  detectInputKindFromElement,
  sanitizeInputByKind,
} from "@/shared/utils/inputSanitizer"

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
])

const isTextLikeField = (target) => {
  if (!target || target.disabled || target.readOnly) return false

  const tagName = target.tagName?.toLowerCase()
  if (tagName === "textarea") return true
  if (tagName !== "input") return false

  const inputType = String(
    target.getAttribute?.("type") || target.type || "text"
  ).toLowerCase()
  return !NON_TEXT_INPUT_TYPES.has(inputType)
}

export const sanitizeInputElementValue = (target) => {
  if (!isTextLikeField(target)) return

  const currentValue = target.value
  if (typeof currentValue !== "string") return

  const kind = detectInputKindFromElement(target)
  if (kind === "none") return

  const nextValue = sanitizeInputByKind(kind, currentValue)
  if (nextValue === currentValue) return

  const selectionStart = target.selectionStart
  const selectionEnd = target.selectionEnd

  target.value = nextValue

  if (
    document.activeElement === target &&
    typeof selectionStart === "number" &&
    typeof selectionEnd === "number"
  ) {
    const safeStart = Math.min(selectionStart, nextValue.length)
    const safeEnd = Math.min(selectionEnd, nextValue.length)
    target.setSelectionRange(safeStart, safeEnd)
  }
}

export const useGlobalInputSanitizer = ({ enabled = true } = {}) => {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined

    const handleInput = (event) => {
      if (event?.isComposing) return
      sanitizeInputElementValue(event?.target)
    }

    document.addEventListener("input", handleInput, true)
    document.addEventListener("change", handleInput, true)

    return () => {
      document.removeEventListener("input", handleInput, true)
      document.removeEventListener("change", handleInput, true)
    }
  }, [enabled])
}

