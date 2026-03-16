"use client";

import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { BottomListColumn } from "@/components/planner/BottomListColumn";
import { listColumnDndId } from "@/lib/domain/dnd";
import type {
  AccentColor,
  BulletStyle,
  ContainerRef,
  PlannerList,
  Task,
} from "@/types/domain";

interface BottomListsRowProps {
  lists: PlannerList[];
  tasksByListId: Record<string, Task[]>;
  editingTaskId: string | null;
  accentColor: AccentColor;
  bulletStyle: BulletStyle;
  showLines: boolean;
  onSetEditingTaskId: (taskId: string | null) => void;
  onAdd: (container: ContainerRef, title: string, options?: { parentTaskId?: string }) => Promise<Task>;
  onEdit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<unknown>;
  onDeleteList?: (list: PlannerList) => Promise<void>;
}

export function BottomListsRow({
  lists,
  tasksByListId,
  editingTaskId,
  accentColor,
  bulletStyle,
  showLines,
  onSetEditingTaskId,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onDeleteList,
}: BottomListsRowProps) {
  const listCount = Math.max(lists.length, 3);
  const minWidth = Math.max(960, listCount * 260);
  const listItemIds = lists.map((list) => listColumnDndId(list.id));

  return (
    <section className="bottom-lists-scroll h-full min-h-0 overflow-x-auto overflow-y-hidden">
      <SortableContext items={listItemIds} strategy={horizontalListSortingStrategy}>
        <div
          className="bottom-lists-track grid h-full min-h-0 column-stack pr-3"
          style={{
            gridTemplateColumns: `repeat(${lists.length}, minmax(240px, 1fr))`,
            minWidth: `${minWidth}px`,
          }}
        >
          {lists.map((list) => (
            <BottomListColumn
              key={list.id}
              list={list}
              tasks={tasksByListId[list.id] ?? []}
              editingTaskId={editingTaskId}
              accentColor={accentColor}
              bulletStyle={bulletStyle}
              showLines={showLines}
              onSetEditingTaskId={onSetEditingTaskId}
              onAdd={onAdd}
              onEdit={onEdit}
              onToggle={onToggle}
              onDelete={onDelete}
              onDeleteList={onDeleteList}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
