import { useEffect, useCallback } from 'react'

type KeyCombo = {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export function useKeyboardShortcut(
  keyCombo: KeyCombo | string,
  callback: () => void,
  enabled: boolean = true
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const combo = typeof keyCombo === 'string' ? { key: keyCombo } : keyCombo

      const keyMatch = event.key.toLowerCase() === combo.key.toLowerCase()
      const ctrlMatch = combo.ctrl ? event.ctrlKey || event.metaKey : true
      const shiftMatch = combo.shift ? event.shiftKey : true
      const altMatch = combo.alt ? event.altKey : true

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        event.preventDefault()
        callback()
      }
    },
    [keyCombo, callback, enabled]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export function useMultipleKeyboardShortcuts(
  shortcuts: Array<{ combo: KeyCombo | string; callback: () => void }>,
  enabled: boolean = true
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      for (const { combo, callback } of shortcuts) {
        const keyCombo = typeof combo === 'string' ? { key: combo } : combo

        const keyMatch = event.key.toLowerCase() === keyCombo.key.toLowerCase()
        const ctrlMatch = keyCombo.ctrl ? event.ctrlKey || event.metaKey : true
        const shiftMatch = keyCombo.shift ? event.shiftKey : true
        const altMatch = keyCombo.alt ? event.altKey : true

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault()
          callback()
          break
        }
      }
    },
    [shortcuts, enabled]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
