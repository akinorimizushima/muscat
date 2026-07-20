# Keyboard Delete Design

## Goal

Allow users to remove the currently selected editor element with either Backspace or Delete while preserving normal text-entry behavior.

## Scope

- Support selected regular canvas elements and selected elements rendered inside the imported-HTML iframe.
- Use the existing `node.remove` command so deletion remains undoable and redoable.
- Clear the selection after deletion so stale overlays and node references are not retained.
- Do not add multi-selection, deletion confirmation, or a toolbar delete control.

## Architecture

The DOM package owns the keyboard-to-editor-command policy because it depends on `KeyboardEvent`, editable DOM targets, iframe event forwarding, and `preventDefault()`. It will expose an element-deletion controller that receives the editor plus callbacks for reading and clearing application-owned selection and detecting application-owned editing state.

The demo remains responsible for composing features. It creates the controller with `getSelectedNodeId`, `clearSelection`, and `isEditing`, then passes the same controller handler to the parent document and iframe renderer. Keyboard events originating in an iframe do not bubble to the parent document, so `createIframeRenderer` exposes a small keyboard-event callback in `IframeRendererOptions`.

## Event Rules

A key event deletes the selection only when all of the following are true:

- The key is `Backspace` or `Delete`.
- The event has not already been prevented and is not part of IME composition.
- No Alt, Meta, or Control modifier is held.
- A selected node still exists and the editor reports that its remove command is applicable.
- The target is not an `input`, `textarea`, `select`, or contenteditable element.
- Rich-text editing is not active.

Shift does not block deletion because Shift+Delete is commonly emitted as a deletion key combination. When deletion is accepted, the handler prevents the browser default, dispatches the remove command, and clears `selectedNodeId`.

## Imported HTML

The iframe renderer will add and remove its keydown listener together with its existing document listeners. The callback receives the original `KeyboardEvent`, allowing the application to apply the same target and modifier checks used for parent-document events.

After an imported node is removed, rendering must no longer show that node. Existing iframe synchronization behavior will be exercised by the browser test; if it does not remove missing nodes, synchronization will be minimally extended to do so based on managed node identifiers.

## Undo and Selection

Deletion is dispatched through the editor's existing transaction history. Undo restores the removed subtree in its original position. Undo does not automatically reselect the restored node; selection remains empty until the user selects an element again.

## Testing

Browser tests will cover:

1. Backspace removes a selected regular canvas element and clears its selection overlay.
2. Delete removes a selected imported-HTML element from inside the iframe.
3. Undo restores a keyboard-deleted element.
4. Backspace and Delete retain their normal behavior in form controls and during rich-text editing without removing the selected editor node.

Unit coverage will be added for iframe keyboard forwarding and listener cleanup if the browser-level contract cannot exercise cleanup deterministically. Tests will be written and observed failing before production changes.
