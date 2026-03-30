import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkItem } from '@projecta/types';
import { WorkItemRow } from './work-item-row';

interface Props {
  item: WorkItem;
  projectId: string;
  calculatedPoints?: number | undefined;
}

export function SortableWorkItemRow({ item, projectId, calculatedPoints }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <WorkItemRow
        item={item}
        projectId={projectId}
        calculatedPoints={calculatedPoints}
        dragHandleProps={listeners}
      />
    </div>
  );
}
