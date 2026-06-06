import { useReducer } from 'react'
import { pushHistory, undoHistory, redoHistory } from '../utils/historyUtils'

const initialState = { canvasData: null, history: [], historyIndex: -1 }

function reducer(state, action) {
  switch (action.type) {
    case 'PUSH': {
      const next = pushHistory(state.history, state.historyIndex, action.data)
      return { canvasData: action.data, history: next.history, historyIndex: next.historyIndex }
    }
    case 'RESET':
      return { canvasData: action.data, history: [JSON.stringify(action.data)], historyIndex: 0 }
    case 'UNDO': {
      const result = undoHistory(state.history, state.historyIndex)
      return result ? { ...state, canvasData: result.canvasData, historyIndex: result.historyIndex } : state
    }
    case 'REDO': {
      const result = redoHistory(state.history, state.historyIndex)
      return result ? { ...state, canvasData: result.canvasData, historyIndex: result.historyIndex } : state
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
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    setCanvas: (data) => dispatch({ type: 'PUSH', data }),
    resetCanvas: (data) => dispatch({ type: 'RESET', data }),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
  }
}
