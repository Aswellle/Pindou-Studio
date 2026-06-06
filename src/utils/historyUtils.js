/**
 * Pure history helpers for canvas undo/redo.
 * Extracted from App.jsx so the logic can be tested independently.
 */

export const MAX_HISTORY = 50

/**
 * Push a new canvasData snapshot onto history.
 * Truncates any redo future (entries after historyIndex) and caps at MAX_HISTORY.
 */
export function pushHistory(history, historyIndex, canvasData) {
  const newHistory = history.slice(0, historyIndex + 1)
  newHistory.push(JSON.stringify(canvasData))
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  return {
    history: newHistory,
    historyIndex: newHistory.length - 1,
    canUndo: newHistory.length > 1,
  }
}

/**
 * Step back one entry. Returns null if already at the beginning.
 */
export function undoHistory(history, historyIndex) {
  if (historyIndex <= 0) return null
  const newIndex = historyIndex - 1
  return {
    historyIndex: newIndex,
    canvasData: JSON.parse(history[newIndex]),
    canUndo: newIndex > 0,
  }
}

/**
 * Step forward one entry. Returns null if already at the end.
 */
export function redoHistory(history, historyIndex) {
  if (historyIndex >= history.length - 1) return null
  const newIndex = historyIndex + 1
  return {
    historyIndex: newIndex,
    canvasData: JSON.parse(history[newIndex]),
    canUndo: true,
  }
}
