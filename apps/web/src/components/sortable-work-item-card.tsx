import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkItem } from '@projecta/types';
import { WorkItemCard } from './work-item-card';

interface Props {
  item: WorkItem;
  projectId: string;
  parentTitle?: string | undefined;
  childTaskCount?: number | undefined;
  calculatedPoints?: number | undefined;
  isBlocked?: boolean | undefined;
  assigneeName?: string | undefined;
  unblocksCount?: number | undefined;
  childDoneCount?: number | undefined;
  vcsSummary?: { openPrCount: number; mergedPrs: number; checksStatus: string | null } | undefined;
}

export function SortableWorkItemCard({
  item,
  projectId,
  parentTitle,
  childTaskCount,
  calculatedPoints,
  isBlocked,
  assigneeName,
  unblocksCount,
  childDoneCount,
  vcsSummary,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkItemCard
        item={item}
        projectId={projectId}
        parentTitle={parentTitle}
        childTaskCount={childTaskCount}
        calculatedPoints={calculatedPoints}
        isBlocked={isBlocked}
        assigneeName={assigneeName}
        unblocksCount={unblocksCount}
        childDoneCount={childDoneCount}
        vcsSummary={vcsSummary}
      />
    </div>
  );
}
