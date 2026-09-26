import { useCallback, useRef, useState, type DragEvent } from "react";

/**
 * Pointer reordering for the builder's lists.
 *
 * Native HTML5 drag and drop rather than a library: the project has no
 * drag-and-drop dependency, and adding one to move list items would be a major
 * dependency bought for a single interaction.
 *
 * Drag is deliberately *not* the only way to reorder. Every list that uses this
 * hook also renders Move up / Move down buttons, because HTML5 drag and drop is
 * unusable from a keyboard and largely unusable with a screen reader. The drag
 * affordance is the shortcut; the buttons are the interface.
 */

export interface DragState {
  /** Id of the item currently being dragged, if any. */
  draggingId: string | null;
  /** Id of the item the pointer is hovering over, and on which side. */
  overId: string | null;
  overAfter: boolean;
}

export interface DragItemProps {
  draggable: true;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
}

export function useDragReorder(onMove: (id: string, toIndex: number) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overAfter, setOverAfter] = useState(false);
  const fromIndex = useRef<number>(-1);

  const reset = useCallback(() => {
    setDraggingId(null);
    setOverId(null);
    setOverAfter(false);
    fromIndex.current = -1;
  }, []);

  const itemProps = useCallback(
    (id: string, index: number): DragItemProps => ({
      draggable: true,

      onDragStart: (event) => {
        setDraggingId(id);
        fromIndex.current = index;
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag unless something is transferred.
        event.dataTransfer.setData("text/plain", id);
      },

      onDragOver: (event) => {
        if (fromIndex.current < 0 || draggingId === id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        // Which half of the row the pointer is on decides whether the item
        // lands before or after it, which is what makes the insertion line
        // agree with where it will actually go.
        const rect = event.currentTarget.getBoundingClientRect();
        setOverId(id);
        setOverAfter(event.clientY > rect.top + rect.height / 2);
      },

      onDragLeave: () => {
        setOverId((current) => (current === id ? null : current));
      },

      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = fromIndex.current;
        if (from < 0 || draggingId === null || draggingId === id) {
          reset();
          return;
        }
        // Removing the dragged item first shifts every later index down by one,
        // so a drop below its origin has to account for the gap it left.
        let to = overAfter ? index + 1 : index;
        if (from < to) to -= 1;
        if (to !== from) onMove(draggingId, to);
        reset();
      },

      onDragEnd: reset,
    }),
    [draggingId, overAfter, onMove, reset],
  );

  return { draggingId, overId, overAfter, itemProps, reset } as const;
}

/** Class names for the row being dragged and the row it would land against. */
export function dragClasses(state: DragState, id: string): string {
  const classes: string[] = [];
  if (state.draggingId === id) classes.push("opacity-45");
  if (state.overId === id && state.draggingId !== id) {
    classes.push(
      state.overAfter
        ? "shadow-[inset_0_-2px_0_0_var(--accent-cta)]"
        : "shadow-[inset_0_2px_0_0_var(--accent-cta)]",
    );
  }
  return classes.join(" ");
}
