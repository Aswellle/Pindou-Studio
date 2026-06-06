import { describe, it, expect } from 'vitest'
import { pushHistory, undoHistory, redoHistory, MAX_HISTORY } from './historyUtils'

const cell = (color) => [[color, null], [null, null]]

describe('pushHistory', () => {
  it('adds the first entry with canUndo=false', () => {
    const result = pushHistory([], -1, cell('#ff0000'))
    expect(result.history).toHaveLength(1)
    expect(result.historyIndex).toBe(0)
    expect(result.canUndo).toBe(false)
  })

  it('adds a second entry with canUndo=true', () => {
    const first = pushHistory([], -1, cell('#ff0000'))
    const second = pushHistory(first.history, first.historyIndex, cell('#00ff00'))
    expect(second.history).toHaveLength(2)
    expect(second.historyIndex).toBe(1)
    expect(second.canUndo).toBe(true)
  })

  it('truncates redo future when pushing after undo', () => {
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, cell('#bbb'))
    state = pushHistory(state.history, state.historyIndex, cell('#ccc'))
    // Undo once — history array unchanged, only historyIndex moves back to 1
    const afterUndo = undoHistory(state.history, state.historyIndex)
    const newState = pushHistory(state.history, afterUndo.historyIndex, cell('#ddd'))
    // Should have: [#aaa, #bbb, #ddd] — #ccc is gone
    expect(newState.history).toHaveLength(3)
    expect(JSON.parse(newState.history[2])).toEqual(cell('#ddd'))
  })

  it(`caps history at ${MAX_HISTORY} entries`, () => {
    let state = { history: [], historyIndex: -1 }
    for (let i = 0; i <= MAX_HISTORY + 5; i++) {
      state = pushHistory(state.history, state.historyIndex, cell(`#${String(i).padStart(6, '0')}`))
    }
    expect(state.history.length).toBeLessThanOrEqual(MAX_HISTORY)
  })

  it('preserves serialized canvasData correctly', () => {
    const data = [['#ff0000', null], [null, '#00ff00']]
    const result = pushHistory([], -1, data)
    expect(JSON.parse(result.history[0])).toEqual(data)
  })
})

describe('undoHistory', () => {
  it('returns null when at the beginning (nothing to undo)', () => {
    const state = pushHistory([], -1, cell('#aaa'))
    expect(undoHistory(state.history, state.historyIndex)).toBeNull()
  })

  it('restores the previous canvas state', () => {
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, cell('#bbb'))
    const undone = undoHistory(state.history, state.historyIndex)
    expect(undone.canvasData).toEqual(cell('#aaa'))
    expect(undone.historyIndex).toBe(0)
  })

  it('sets canUndo=false after undoing to the first entry', () => {
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, cell('#bbb'))
    const undone = undoHistory(state.history, state.historyIndex)
    expect(undone.canUndo).toBe(false)
  })

  it('sets canUndo=true when more history remains', () => {
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, cell('#bbb'))
    state = pushHistory(state.history, state.historyIndex, cell('#ccc'))
    const undone = undoHistory(state.history, state.historyIndex)
    expect(undone.canUndo).toBe(true)
    expect(undone.canvasData).toEqual(cell('#bbb'))
  })
})

describe('redoHistory', () => {
  it('returns null when at the end (nothing to redo)', () => {
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, cell('#bbb'))
    expect(redoHistory(state.history, state.historyIndex)).toBeNull()
  })

  it('restores the next canvas state after undo', () => {
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, cell('#bbb'))
    const undone = undoHistory(state.history, state.historyIndex)
    const redone = redoHistory(state.history, undone.historyIndex)
    expect(redone.canvasData).toEqual(cell('#bbb'))
    expect(redone.historyIndex).toBe(1)
    expect(redone.canUndo).toBe(true)
  })

  it('undo then redo returns to original state', () => {
    const data = [['#ff0000', '#00ff00'], [null, '#0000ff']]
    let state = pushHistory([], -1, cell('#aaa'))
    state = pushHistory(state.history, state.historyIndex, data)
    const undone = undoHistory(state.history, state.historyIndex)
    const redone = redoHistory(state.history, undone.historyIndex)
    expect(redone.canvasData).toEqual(data)
  })
})
