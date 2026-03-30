import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { cn } from '@projecta/ui';

interface RichTextDisplayProps {
  content: Record<string, unknown> | null | undefined;
  className?: string | undefined;
}

/**
 * Read-only display of Tiptap JSON content.
 * Falls back to plain text for legacy { text: "..." } format.
 */
export function RichTextDisplay({ content, className }: RichTextDisplayProps) {
  // Handle legacy plain text format
  if (content && typeof content === 'object' && 'text' in content && !('type' in content)) {
    const text = String(content.text);
    return (
      <div className={cn('text-sm text-gray-700', className)}>
        {text.split('\n').map((line, i) => (
          <p key={i} className={line ? '' : 'h-4'}>{line}</p>
        ))}
      </div>
    );
  }

  return <TiptapDisplay content={content} className={className} />;
}

function TiptapDisplay({
  content,
  className,
}: {
  content: Record<string, unknown> | null | undefined;
  className?: string | undefined;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: (content as Record<string, unknown>) ?? null,
    editable: false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none',
          'prose-headings:font-semibold prose-headings:text-gray-900',
          'prose-p:text-gray-700 prose-p:leading-relaxed',
          'prose-ul:text-gray-700 prose-ol:text-gray-700',
          'prose-code:text-brand-700 prose-code:bg-brand-50 prose-code:rounded prose-code:px-1',
          'prose-blockquote:border-l-brand-300 prose-blockquote:text-gray-600',
        ),
      },
    },
  });

  if (!editor) return null;

  return (
    <div className={className}>
      <EditorContent editor={editor} />
    </div>
  );
}
