# Tiptap Rich Text Editing Design

## Goal

Add headless rich text editing to both regular canvas nodes and imported HTML rendered in an iframe. A user enters editing mode by double-clicking a leaf text element. Selecting a text range shows a contextual floating toolbar.

The first release supports bold, italic, underline, strike-through, left/center/right alignment, and links. Link URLs are entered in an inline panel within the toolbar.

## Architecture

### Core model

`@muscat/core` remains DOM- and Tiptap-independent. `EditorNode` gains an optional `richContent` HTML string. A `node.setRichContent` command updates it through the existing transaction and inverse-transaction history system.

`content` remains supported for plain text nodes and existing documents. When `richContent` is present, DOM renderers use it in preference to `content`.

### DOM boundary

`@muscat/dom` owns rich HTML sanitization, parsing, rendering, import, and export. It accepts only the inline markup required by the supported formatting controls and strips blocked elements, event handlers, unsafe style declarations, and unsafe URL schemes.

During import, inline markup inside an editable leaf element becomes that element's `richContent`. Block elements continue to be represented by the existing Muscat node tree. During export, sanitized `richContent` is emitted as ordinary HTML without editor metadata.

### Rich-text package

`@muscat/rich-text` is the reusable editing adapter. It owns the active editing snapshot, toolbar, commit, cancellation, cross-document stylesheet adoption, and cleanup. Tiptap is an internal implementation detail of this package and no public interface exposes Tiptap or ProseMirror types.

The package depends on `@muscat/dom` for rich HTML sanitization and URL policy. It can mount against either the main document or an imported iframe document. `apps/demo` only creates the controller, translates commits into Muscat commands, and coordinates canvas interactions.

Only one editor instance may be active. Starting another edit first commits the current edit. Editing completion destroys the Tiptap instance and removes transient editor UI.

Although the requested UI floats, the implementation uses Tiptap's `BubbleMenu`, because BubbleMenu is the selection-anchored menu intended for applying marks. Tiptap's `FloatingMenu` targets cursor contexts such as empty paragraphs.

## User Interaction

1. The user double-clicks a leaf text element to enter editing mode.
2. Tiptap initializes from the node's current rich HTML or escaped plain text.
3. Selecting a non-empty text range shows the Bubble Menu near the selection. A collapsed cursor hides it.
4. Toolbar buttons toggle bold, italic, underline, strike-through, left alignment, center alignment, and right alignment.
5. Active formatting is visually selected. Unsupported commands are disabled.
6. The link button expands a URL input, Apply button, and Remove button inside the same menu. The selected range remains available while the input is focused.
7. `Escape` cancels the entire editing session and restores the initial snapshot.
8. Clicking or focusing outside the active editor and its toolbar commits the session.
9. `Enter` retains Tiptap's normal line-break or paragraph behavior.
10. Dragging, resizing, and the Muscat selection overlay are suspended while rich text editing is active.

The menu uses icon buttons with accessible names, tooltips, fixed dimensions, visible active states, and keyboard focus styles. The URL input panel must remain usable in constrained canvas and iframe viewports.

## Data Flow

At edit start, the controller records the node ID and its initial `content` and `richContent`. Tiptap updates only the active DOM during the session; keystrokes do not create Muscat history entries.

On commit, the controller obtains Tiptap HTML, normalizes and sanitizes it through `@muscat/dom`, and dispatches one `node.setRichContent` command only when the normalized result differs from the initial value. The transaction is therefore one undoable editor action. On cancellation, the controller restores the initial DOM without dispatching a command.

Regular canvas editing and iframe editing share this lifecycle. Their only environmental differences are the owner `Document`, mount element, and Bubble Menu append target. The iframe menu is mounted inside the iframe document so selection coordinates do not require cross-document translation.

## Sanitization

The rich content allowlist covers the markup emitted by the selected Tiptap extensions: paragraphs or line breaks, `strong`, `em`, `u`, `s`, text alignment declarations, and `a` elements.

Allowed links use `http:`, `https:`, `mailto:`, `tel:`, fragment, or relative URLs. Scriptable and unsafe schemes are removed. Event attributes, arbitrary styles, scripts, embedded documents, and editor-only attributes are never persisted. Links do not automatically gain `target="_blank"`.

Sanitization runs both when external HTML enters the model and when edited HTML is committed. Rendering does not trust stored HTML merely because it originated from the model.

## Error Handling

If the target node no longer exists, the controller aborts without dispatching. If Tiptap cannot mount or parse the current content, the original DOM and model remain unchanged and the editing UI is cleaned up. Invalid link input is not applied and the input exposes an accessible validation state.

Cleanup is idempotent so iframe reloads, node removal, editor disposal, and repeated focus events cannot dispatch duplicate commits or leave event listeners behind.

## Package Boundaries

The dependency direction is:

```text
@muscat/core <- @muscat/dom <- @muscat/rich-text <- @muscat/demo
```

`@muscat/rich-text` contains Tiptap, StarterKit marks, underline, link, text alignment, Bubble Menu, Floating UI, the rich-text controller, menu construction, and its shared stylesheet. `@muscat/dom` remains usable for parsing, rendering, and HTML import/export without installing Tiptap. `@muscat/core` remains DOM-free. The demo contains no direct Tiptap imports.

## Testing

### Core unit tests

- Apply, undo, and redo `node.setRichContent`.
- Preserve existing plain-text behavior.
- Avoid an editor dispatch when normalized rich content is unchanged.

### DOM tests

- Import, render, and export supported rich HTML without losing formatting.
- Remove blocked elements, attributes, declarations, and URL schemes.
- Render legacy `content` when `richContent` is absent.

### Rich-text tests

- Exercise controller initialization, commit, cancellation, and exceptional cleanup through only the public `@muscat/rich-text` API.
- Verify the package declaration exports no Tiptap or ProseMirror types.
- Verify both the main document and foreign iframe documents receive the same menu behavior and stylesheet.

### Playwright tests

- A regular node enters edit mode on double-click and shows the menu only for a non-empty selection.
- Bold, italic, underline, strike-through, and alignment affect rendering and exported HTML.
- A URL can be applied and removed through the inline link panel.
- The same editing workflow works inside an imported iframe.
- `Escape` cancels; outside interaction commits.
- Undo and redo treat one completed editing session as one operation.
- Editing suppresses drag and resize behavior.
- The menu stays visible, correctly positioned, and non-overlapping at desktop and mobile viewport sizes.

## Completion Criteria

The feature is complete when all focused tests pass, the full unit and browser suites pass, formatting survives import/export and undo/redo, no unsafe rich HTML reaches the rendered document, and visual verification confirms that the toolbar works in both document contexts without layout overlap.
