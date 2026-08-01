import { useReducer } from 'react'
import { pushHistory, undoHistory, redoHistory } from '../utils/historyUtils'

const initialState = { canvasData: null, committedData: null, history: [], historyIndex: -1 }

function reducer(state, action) {
  switch (action.type) {
    case 'PUSH': {
      const next = pushHistory(state.history, state.historyIndex, action.data)
      return { canvasData: action.data, committedData: action.data, history: next.history, historyIndex: next.historyIndex }
    }
    // DRAW: update display without creating a history entry (used during drag strokes).
    // committedData intentionally NOT touched here — stats/export consumers key off
    // committedData so a full O(rows*cols) recompute doesn't fire on every mousemove
    // tick of a drag stroke (was causing input backlog / multi-second paint lag on
    // large grids). See Canvas.jsx's rAF-throttled onDraw for the other half of this fix.
    case 'DRAW':
      return { ...state, canvasData: action.data }
    case 'RESET':
      return { canvasData: action.data, committedData: action.data, history: [JSON.stringify(action.data)], historyIndex: 0 }
    case 'UNDO': {
      const result = undoHistory(state.history, state.historyIndex)
      return result ? { ...state, canvasData: result.canvasData, committedData: result.canvasData, historyIndex: result.historyIndex } : state
    }
    case 'REDO': {
      const result = redoHistory(state.history, state.historyIndex)
      return result ? { ...state, canvasData: result.canvasData, committedData: result.canvasData, historyIndex: result.historyIndex } : state
    }
    default:
      return state
  }
}

/**
 * Canvas history management via useReducer.
 * Eliminates the stale-closure bug present in the useState + useEffect approach.
 *
 * setCanvas(data)  — user draw operation (pushed to undo stack)
 * resetCanvas(data) — destructive replace (template load, quantizer apply, grid resize)
 */
export function useHistory() {
  const [state, dispatch] = useReducer(reducer, initialState)
  return {
    canvasData: state.canvasData,
    // committedData only changes on PUSH/RESET/UNDO/REDO (stroke commit or history
    // navigation) — pass this to stats/export UI, not canvasData, to avoid re-running
    // full-grid scans on every in-progress drag tick.
    committedData: state.committedData,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    drawCanvas: (data) => dispatch({ type: 'DRAW', data }),
    setCanvas: (data) => dispatch({ type: 'PUSH', data }),
    resetCanvas: (data) => dispatch({ type: 'RESET', data }),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
  }
}
