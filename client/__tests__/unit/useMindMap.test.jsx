/**
 * UT-60..UT-70 - MFE-05 (editor) + MFE-06 (undo/redo) + MFE-10 (state)
 *
 * Menguji reducer state management mind map untuk:
 *   - SET, REPLACE, ADD_CHILD, RENAME, DELETE
 *   - UNDO / REDO dengan history stack
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMindMap from '../../src/state/useMindMap';

const SAMPLE = {
  concept: 'Root',
  level: 0,
  children: [
    { concept: 'Child A', level: 1, children: [] },
    { concept: 'Child B', level: 1, children: [
      { concept: 'Grand B1', level: 2, children: [] }
    ]}
  ]
};

describe('UT-60..UT-70 [MFE-05/06/10] useMindMap reducer', () => {
  it('UT-60 setTree menetapkan pohon awal', () => {
    const { result } = renderHook(() => useMindMap(null));
    act(() => result.current.setTree(SAMPLE));
    expect(result.current.tree.concept).toBe('Root');
  });

  it('UT-61 addChild menambah node anak ke path tertentu', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.addChild([0], 'Cucu A1'));
    expect(result.current.tree.children[0].children).toHaveLength(1);
    expect(result.current.tree.children[0].children[0].concept).toBe('Cucu A1');
    expect(result.current.tree.children[0].children[0].level).toBe(2);
  });

  it('UT-62 rename mengubah concept tanpa kehilangan struktur', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.rename([1, 0], 'Renamed'));
    expect(result.current.tree.children[1].children[0].concept).toBe('Renamed');
  });

  it('UT-63 remove menghapus node by path', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.remove([1, 0]));
    expect(result.current.tree.children[1].children).toHaveLength(0);
  });

  it('UT-64 undo mengembalikan state sebelumnya', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.rename([0], 'A-renamed'));
    expect(result.current.tree.children[0].concept).toBe('A-renamed');
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.tree.children[0].concept).toBe('Child A');
  });

  it('UT-65 redo memajukan state setelah undo', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.rename([0], 'A-renamed'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.tree.children[0].concept).toBe('A-renamed');
  });

  it('UT-66 setTree me-reset history (canUndo=false)', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.rename([0], 'X'));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.setTree({ concept: 'New', level: 0, children: [] }));
    expect(result.current.canUndo).toBe(false);
  });

  it('UT-67 canUndo=false saat history kosong', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('UT-68 addChild di root path = []', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    const beforeCount = result.current.tree.children.length;
    act(() => result.current.addChild([], 'Direct Branch'));
    expect(result.current.tree.children).toHaveLength(beforeCount + 1);
    expect(result.current.tree.children.at(-1).concept).toBe('Direct Branch');
  });

  it('UT-69 history stack dibatasi 50 entri', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    for (let i = 0; i < 60; i += 1) {
      act(() => result.current.rename([0], `iter-${i}`));
    }
    // setelah 60 perubahan, undo hanya bisa 50x
    let undoCount = 0;
    while (result.current.canUndo && undoCount < 100) {
      act(() => result.current.undo());
      undoCount += 1;
    }
    expect(undoCount).toBeLessThanOrEqual(50);
  });

  it('UT-70 redo dihapus setelah action baru', () => {
    const { result } = renderHook(() => useMindMap(SAMPLE));
    act(() => result.current.rename([0], 'X'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.rename([0], 'Y'));
    expect(result.current.canRedo).toBe(false);
  });
});
