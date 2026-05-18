/**
 * state/useMindMap.js - Modul State Management (MFE-10)
 *
 * Reducer berbasis useReducer untuk operasi mind map dengan dukungan
 * undo/redo (MFE-06). Operasi yang didukung:
 *   - SET          : ganti seluruh pohon
 *   - ADD_CHILD    : tambah anak ke node tertentu (by path)
 *   - DELETE       : hapus node by path
 *   - RENAME       : ubah concept node by path
 *   - UNDO / REDO  : pakai stack history
 *
 * Path direpresentasikan sebagai array index, mis. [0,2] = root.children[0].children[2].
 * History dibatasi 50 entri agar tidak boros memori.
 */

import { useReducer, useCallback } from 'react';

const HISTORY_LIMIT = 50;

/**
 * Buat clone dalam tree (immutable updates).
 */
function clone(node) {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Update node berdasarkan path lalu kembalikan root baru.
 * @param {object} root
 * @param {number[]} path
 * @param {(node:object, parent:object|null)=>object} updater
 */
function updateAtPath(root, path, updater) {
  const next = clone(root);
  if (!path.length) {
    return updater(next, null);
  }
  let parent = null;
  let current = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    parent = current;
    current = current.children[path[i]];
  }
  const idx = path[path.length - 1];
  const target = current.children[idx];
  const result = updater(target, current);
  if (result === null) {
    current.children.splice(idx, 1);
  } else {
    current.children[idx] = result;
  }
  return next;
}

const initialState = {
  tree: null,
  past: [],
  future: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET': {
      return { tree: action.tree, past: [], future: [] };
    }
    case 'REPLACE': {
      const past = [...state.past, state.tree].slice(-HISTORY_LIMIT);
      return { tree: action.tree, past, future: [] };
    }
    case 'ADD_CHILD': {
      if (!state.tree) return state;
      const past = [...state.past, state.tree].slice(-HISTORY_LIMIT);
      const next = updateAtPath(state.tree, action.path, (node) => {
        const newChild = {
          concept: action.concept || 'Konsep baru',
          level: (node.level || 0) + 1,
          children: []
        };
        node.children = [...(node.children || []), newChild];
        return node;
      });
      return { tree: next, past, future: [] };
    }
    case 'DELETE': {
      if (!state.tree || !action.path.length) return state;
      const past = [...state.past, state.tree].slice(-HISTORY_LIMIT);
      const next = updateAtPath(state.tree, action.path, () => null);
      return { tree: next, past, future: [] };
    }
    case 'RENAME': {
      if (!state.tree) return state;
      const past = [...state.past, state.tree].slice(-HISTORY_LIMIT);
      const next = updateAtPath(state.tree, action.path, (node) => {
        node.concept = action.concept;
        return node;
      });
      return { tree: next, past, future: [] };
    }
    case 'UNDO': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        tree: previous,
        past: state.past.slice(0, -1),
        future: [state.tree, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }
    case 'REDO': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        tree: next,
        past: [...state.past, state.tree].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

/**
 * Hook publik. Mengembalikan state dan operasi.
 */
export function useMindMap(initialTree = null) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    tree: initialTree,
  });

  const setTree   = useCallback((t) => dispatch({ type: 'SET', tree: t }), []);
  const replace   = useCallback((t) => dispatch({ type: 'REPLACE', tree: t }), []);
  const addChild  = useCallback((path, concept) => dispatch({ type: 'ADD_CHILD', path, concept }), []);
  const remove    = useCallback((path) => dispatch({ type: 'DELETE', path }), []);
  const rename    = useCallback((path, concept) => dispatch({ type: 'RENAME', path, concept }), []);
  const undo      = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo      = useCallback(() => dispatch({ type: 'REDO' }), []);

  return {
    tree: state.tree,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    setTree, replace, addChild, remove, rename, undo, redo,
  };
}

export default useMindMap;
