# kimo component library

Try every component at `/dev/ui`. Each public component has a named export in `apps/web/src/components/ui/<name>.tsx`, and DOM-rendering components forward their ref. Import from that component's file. Do not restyle appearances in consuming screens: pass named variants, state and layout-only className. Runtime validation rejects appearance classes such as `bg-orange` or `text-t28` passed through a public className.

## Components

| Component        | Public API / behavior                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button           | variant: primary/secondary/ghost/danger; size: xs/sm/md/lg; icon, loading, disabled. An iconOnly button requires icon, aria-label and tooltip. Native Enter/Space; loading preserves its label width and blocks repeat submission.          |
| Input            | Native input props and error. A unique error description is merged with aria-describedby. Caller supplies a label or aria-label.                                                                                                            |
| Textarea         | Native textarea props, error, maxRows. Starts with one row and measures content on input or controlled value changes; scrolls at maxRows.                                                                                                   |
| Pill             | variant: default/live; active controls the live pulse.                                                                                                                                                                                      |
| AttachmentChip   | kind: video/image/audio/doc; name, meta, thumbnail?, progress: 0..1, onRemove?. File removal has a named, keyboard-operable tooltip button.                                                                                                 |
| Tooltip          | children: one trigger element; content, shortcut?, side?. Radix focus/hover, 400ms open delay and immediate close state.                                                                                                                    |
| Menu             | trigger + MenuItem, MenuSeparator. MenuItem takes icon?, shortcut?, disabled and Radix onSelect. Non-modal dropdown; arrows, typeahead, Enter, Escape, focus return.                                                                        |
| ContextMenu      | trigger + ContextMenuItem, ContextMenuSeparator. Right-click, ContextMenu key or Shift+F10 opens it. Arrows, Enter and Escape work.                                                                                                         |
| Popover          | trigger, label and children; PopoverClose supports asChild. Labelled dialog semantics, Escape, outside dismissal and focus return.                                                                                                          |
| Dialog           | trigger + DialogContent; content requires title and description, size: sm/md, actions?. DialogClose supports asChild. Focus trap, Escape, return to trigger, scroll-limited panel.                                                          |
| Toast            | message; tone: info/success/error; optional action. With onDismiss it auto-dismisses at 4s / 8s for errors; hover, keyboard focus and hidden-document state pause the timer.                                                                |
| ToastProvider    | Mount once around a surface. useToast().toast(options) returns an ID; dismiss(id) removes it. At most three toasts are mounted; oldest eviction is immediate. Older entries use scale .96 and opacity .7, with opacity-only reduced motion. |
| Spinner          | size: 14/20; label defaults to loading. A status-labelled SVG with a static arc under reduced motion.                                                                                                                                       |
| Progress         | label required; value: 0..1 or undefined for indeterminate; thin?, running?. Only set running for a currently active agent/render operation.                                                                                                |
| Skeleton         | radius: 4/6/8/12/20/pill, layout dimensions through className. Decorative to assistive technology; the containing screen supplies a loading announcement.                                                                                   |
| SegmentedControl | aria-label, options: {value,label,disabled?}[], value/defaultValue, onValueChange, disabled. Single-selection radiogroup; cannot deselect the selected option.                                                                              |
| Toggle           | aria-label, checked/defaultChecked, onCheckedChange and native button props. Native switch semantics and Enter/Space activation.                                                                                                            |
| Slider           | aria-label, numeric value/defaultValue, onValueChange, min/max/step, formatValue?. Radix arrows/Home/End and pointer/touch drag; drag bubble clears on up, cancel and blur.                                                                 |
| Tabs             | TabsList, TabsTrigger, TabsContent composition. Controlled or uncontrolled; Radix automatic arrow-key activation, Home/End and disabled-tab skipping.                                                                                       |
| Panel            | title, actions?, flush?. Header and body use the fixed system sizing.                                                                                                                                                                       |
| Section          | label, collapsible?, defaultOpen?. Native button with aria-expanded and aria-controls; hidden content leaves the tab order.                                                                                                                 |
| Row              | label, value, dense?. Hover only; no implied click action.                                                                                                                                                                                  |
| Kbd              | Native kbd content/props. Tooltip and menu contexts apply their specified internal treatments.                                                                                                                                              |
| ScrollArea       | Radix root props, children, layout height/width. Viewport is a labelled, keyboard-reachable region; scrollbar appears on hover/scroll.                                                                                                      |
| Avatar           | identity: agent/user; name?, acting?. Agent's accessible name is always kimo. User initial or “you” fallback. Acting ring stops under reduced motion.                                                                                       |

## Composition

```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';

<Dialog trigger={<Button variant="danger">discard</Button>}>
  <DialogContent
    title="discard this edit?"
    description="the original footage stays in your project."
    actions={
      <DialogClose asChild>
        <Button>keep editing</Button>
      </DialogClose>
    }
  />
</Dialog>;
```

Use one primary orange action per product panel. The gallery separates button specimens into individually labelled cells. Active live/agent/progress specimens each get their own cell. The gallery's pause button freezes decorative loops; prefers-reduced-motion supplies static loop frames, opacity-only entry/selection changes and instant positional state updates.

## Testing and review

`pnpm test` includes jsdom + Testing Library user-event keyboard tests, alongside the existing contracts/mock suite. `pnpm e2e` exercises real Chromium keyboard behavior, overlays, autosizing, reflow, reduced motion and axe with no disabled rules. `pnpm shots` captures both registered developer routes at desktop and mobile sizes. Overlay and reduced-motion evidence is saved by `e2e/ui.spec.ts`.

## Brand reference

The user supplied [this logo reference](brand/kimo-reference.png) during Phase 1. The original 50×51 image is retained without upscaling or treating it as a production vector. Phase 1's compact agent avatar uses the existing shared SVG mark; its new permission to appear in agent identity is an explicit extension of Phase 0's placement list. The reference remains available for later branded screens.
