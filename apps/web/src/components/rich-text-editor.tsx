import { useEditor, EditorContent } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '@projecta/ui';

interface RichTextEditorProps {
  content?: Record<string, unknown> | null | undefined;
  placeholder?: string | undefined;
  onChange?: ((json: Record<string, unknown>) => void) | undefined;
  editable?: boolean | undefined;
  className?: string | undefined;
  /** Auto-focus on mount */
  autoFocus?: boolean | undefined;
}

export function RichTextEditor({
  content,
  placeholder,
  onChange,
  editable = true,
  className,
  autoFocus = false,
}: RichTextEditorProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('richTextEditor.startTyping');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder: resolvedPlaceholder }),
    ],
    content: (content as Record<string, unknown>) ?? null,
    editable,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON() as Record<string, unknown>);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2',
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
    <div className={cn('rounded-md border border-gray-300 bg-white', className)}>
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap gap-0.5 border-b border-gray-200 px-2 py-1">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title={t('richTextEditor.bold')}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title={t('richTextEditor.italic')}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title={t('richTextEditor.inlineCode')}
          >
            <span className="font-mono text-xs">&lt;/&gt;</span>
          </ToolbarButton>
          <div className="mx-1 w-px bg-gray-200" />
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title={t('richTextEditor.heading')}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title={t('richTextEditor.subheading')}
          >
            H3
          </ToolbarButton>
          <div className="mx-1 w-px bg-gray-200" />
          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title={t('richTextEditor.bulletList')}
          >
            •
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title={t('richTextEditor.numberedList')}
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title={t('richTextEditor.quote')}
          >
            &ldquo;
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title={t('richTextEditor.codeBlock')}
          >
            <span className="font-mono text-xs">{'{}'}</span>
          </ToolbarButton>
        </div>
      )}

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded px-2 py-0.5 text-xs transition-colors',
        active
          ? 'bg-brand-100 text-brand-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
      )}
    >
      {children}
    </button>
  );
}
