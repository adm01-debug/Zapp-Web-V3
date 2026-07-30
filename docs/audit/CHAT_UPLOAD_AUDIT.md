# ChatPanel File Upload, Drag-and-Drop & Media Preview Audit

**Date:** 2026-07-30  
**Scope:** 17 files in `src/features/inbox/` and `src/utils/whatsappFileTypes.ts`

---

## Summary

**7 bugs found** (1 critical, 3 medium, 3 low), **5 design observations**.

---

## BUGS

### 1. [CRITICAL] `classifyError` in `useMediaUrl.ts` doesn't detect HTTP 403

**File:** `src/features/inbox/hooks/useMediaUrl.ts` (line 86)

```ts
// Current check — checks 410, expired, gone — but NOT 403
if (msg.includes('410') || msg.includes('expired') || msg.includes('gone'))
```

WhatsApp CDN returns **HTTP 403 Forbidden** when a signed URL expires (the same expiry that triggers 410 Gone on other CDNs). The `classifyError` function has no `msg.includes('403')` rule, so a 403 falls through to `reason: 'unknown'` with a generic message. The `onError` callback still fires and triggers `runRefresh()`, so the **refresh pipeline works**, but the user-facing error message is generic and the classification is wrong — downstream code that branches on `reason` (e.g. showing "Mídia expirada" vs "Erro desconhecido") will misbehave.

**Fix:** Add `msg.includes('403')` to the expired check:
```ts
if (msg.includes('410') || msg.includes('403') || msg.includes('expired') || msg.includes('gone'))
```

---

### 2. [MEDIUM] `setAttachments([])` leaks object URLs on send

**File:** `src/features/inbox/components/chat/ChatMessageInput.tsx` (lines 136-139)

```ts
const handleSend = () => {
  onSend(attachments.map((a) => a.file));
  setAttachments([]);  // ❌ clears state but does NOT revoke object URLs
};
```

When the user sends queued attachments, `setAttachments([])` clears the component state. The old `preview` strings (created via `URL.createObjectURL`) are garbage-collected from the JS object, but the underlying blob URLs remain registered in the browser's blob registry until `URL.revokeObjectURL()` is explicitly called. For users sending many images per session, this leaks memory.

The `removeAttachment(id)` function (line 128-134) correctly calls `URL.revokeObjectURL()`, but `handleSend` bypasses it.

**Fix:** Before clearing, iterate and revoke:
```ts
const handleSend = () => {
  onSend(attachments.map((a) => a.file));
  attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
  setAttachments([]);
};
```

Also: there's no cleanup on component unmount — if the user navigates away with pending attachments, those blobs leak too. Add a `useEffect` cleanup that revokes remaining previews.

---

### 3. [MEDIUM] Upload progress state variables are never updated

**File:** `src/features/inbox/components/useFileUploadLogic.ts` (lines 62-63)

```ts
const [uploadProgress, _setUploadProgress] = useState(0);
const [uploadStage, _setUploadStage] = useState<'uploading' | 'sending' | null>(null);
```

The underscore-prefixed setters (`_setUploadProgress`, `_setUploadStage`) are **never called anywhere** in the component. The progress bar in `FileUploader.tsx` always renders `0%` and the stage label never updates from its initial value. The UI shows:

> "Fazendo upload... 0%" → "Enviando via WhatsApp... 0%"

This is a broken UX — the user sees no real progress indication. Even the `sendFileViaApi` path has no mechanism to report progress from the Supabase Edge Function upload.

**Fix:** Either wire these into the upload pipeline (e.g. via `XMLHttpRequest.upload.onprogress`) or remove the progress UI entirely to avoid misleading the user.

---

### 4. [MEDIUM] `MediaCard` gallery grid has no media refresh on error

**File:** `src/features/inbox/components/media-gallery/MediaCard.tsx` (lines 57-61)

```tsx
<img
  src={item.url}
  onError={() => { setIsLoading(false); setHasError(true); }}
  // ^^ just hides the broken image — no retry, no refresh
/>
```

The `MediaGallery` directly renders `media_url` from the database. If these are WhatsApp proxy URLs (zapp-media-proxy) that can return 403 on expiry, the card silently shows a fallback icon with **no retry button, no auto-refresh, no user feedback**. The `useMediaRefresh` hook is available in the project but isn't used here.

**Fix:** Either integrate `useMediaRefresh` (requires mapping `media_url` to a `MediaRefreshKey`) or add a retry button on error state.

---

### 5. [LOW] `MediaPreviewDialog` video has no error handling for expired URLs

**File:** `src/features/inbox/components/media-gallery/MediaPreviewDialog.tsx` (line 34)

```tsx
<video src={item.url} controls ... />
```

When the user opens a video in full preview and the URL has expired (403/410), the `<video>` element will simply be blank/black with no error message, retry, or fallback. No `onError` handler is attached.

**Fix:** Add an `onError` handler that shows a retry UI similar to `VideoPreview` in `MediaPreview.tsx`.

---

### 6. [LOW] File `<input>` has `multiple` but `handleFileChange` ignores extra files

**File:** `src/features/inbox/components/FileUploader.tsx` (line 109) + `useFileUploadLogic.ts` (line 366)

```tsx
<input ... multiple />  {/* ✅ multiple enabled */}
```

```ts
// useFileUploadLogic.ts line 366
const file = e.target.files?.[0];  // ❌ only reads the first file
```

The `<input multiple>` attribute lets users select multiple files from the OS file picker, but `handleFileChange` discards all but the first. Multi-file upload **only works via drag-and-drop** (which calls `handleExternalFiles`). This is both confusing for users and inconsistent — the UI advertises multi-file but the primary file-picker path doesn't support it.

**Fix:** Read all files from `e.target.files` and route through `handleExternalFiles`:
```ts
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  if (files.length === 1) { /* existing single-file path */ }
  else { handleExternalFiles(Array.from(files)); }
};
```

---

### 7. [LOW] Drag-and-drop has no touch-event fallback

**File:** `src/features/inbox/components/chat/hooks/useChatDragAndDrop.ts`

The hook only handles mouse drag events (`onDragEnter/Leave/Over/Drop`). Touch devices (iOS Safari, Chrome Android, Samsung Internet) do **not** fire these events. Mobile users cannot drag files into the chat area.

**Fix:** Add touch-event handlers (`onTouchStart/Move/End`) that detect file transfer and route to the same drop handler, or add a note that mobile drag-and-drop is unsupported.

---

## DESIGN OBSERVATIONS (not bugs, but worth noting)

### A. `validateFile` accepts by extension OR MIME — not both

**File:** `src/utils/whatsappFileTypes.ts` (line 118)

```ts
if (matchesMime || matchesExt) { ... }
```

A file renamed `virus.exe` → `photo.jpg` passes client-side validation because the `.jpg` extension matches, even though the MIME type is `application/x-msdownload`. The `secure-upload` edge function may catch this server-side (we can't verify from frontend code), but the client validation should ideally require **both** extension AND MIME type to match the same category.

### B. Video gallery cards show static icons — no video thumbnails

`MediaCard.tsx` (line 64-72): Videos in the gallery display a generic `FileVideo` icon instead of a video frame/thumbnail. Users can't distinguish videos at a glance.

### C. No server-side validation visible in the frontend code

All file size, type, and content validation happens client-side. A malicious client could bypass the React app entirely and POST directly to `secure-upload` with oversized or dangerous files. The edge function should independently validate.

### D. `useChatDragAndDrop` doesn't set `dropEffect`

No `e.dataTransfer.dropEffect = 'copy'` is set in `handleDragOver`. Most browsers default to 'copy' for file drops, but Firefox and Safari may show a 'move' cursor or no-drop cursor without an explicit effect.

### E. `useFileUploadLogic` creates object URLs in 3 separate places

Pattern duplication in `processFilesToQueue`, `handleExternalFile`, and `handleFileChange` (lines 74-78, 335-337, 369-371). Each creates `URL.createObjectURL(file)` with the same condition. Extracting to a helper would reduce risk of missing cleanup.

---

## Files audited (17)

| # | File | Lines |
|---|------|-------|
| 1 | `src/features/inbox/components/FileUploader.tsx` | 240 |
| 2 | `src/features/inbox/components/useFileUploadLogic.ts` | 419 |
| 3 | `src/features/inbox/components/useFileUploadLogicTypes.ts` | 35 |
| 4 | `src/features/inbox/components/chat/ChatDragOverlay.tsx` | 37 |
| 5 | `src/features/inbox/components/chat/hooks/useChatDragAndDrop.ts` | 53 |
| 6 | `src/features/inbox/components/chat/ChatAttachmentsPreview.tsx` | 72 |
| 7 | `src/features/inbox/components/MediaPreview.tsx` | 347 |
| 8 | `src/features/inbox/components/MediaGallery.tsx` | 383 |
| 9 | `src/features/inbox/components/media-gallery/MediaCard.tsx` | 95 |
| 10 | `src/features/inbox/components/media-gallery/MediaPreviewDialog.tsx` | 47 |
| 11 | `src/features/inbox/components/media-gallery/mediaUtils.ts` | 28 |
| 12 | `src/features/inbox/components/ImagePreview.tsx` | 199 |
| 13 | `src/features/inbox/hooks/useMediaUrl.ts` | 289 |
| 14 | `src/features/inbox/hooks/useMediaRefresh.ts` | 73 |
| 15 | `src/utils/whatsappFileTypes.ts` | 211 |
| 16 | `src/features/inbox/components/chat/ChatMessageInput.tsx` | 327 |
| 17 | `src/types/mediaRefresh.ts` | 15 |

---

## Fix priority guide

| Priority | Bug | Effort | Impact |
|----------|-----|--------|--------|
| 🔴 P0 | Add 403 to `classifyError` | 1 line | Wrong error messages for expired media |
| 🟠 P1 | Revoke object URLs on `setAttachments([])` | 2 lines | Memory leak per sent file |
| 🟠 P1 | Wire up upload progress | 10-20 lines | Progress bar stuck at 0% |
| 🟠 P2 | MediaCard refresh on error | 20-40 lines | Gallery shows broken images silently |
| 🟢 P3 | Fix `multiple` file picker | 5 lines | Multi-file only works via drag-and-drop |
| 🟢 P3 | MediaPreviewDialog video error handling | 25 lines | Expired gallery video = blank player |
| 🟢 P3 | Touch drag-and-drop fallback | 40-80 lines | Mobile DnD unsupported |
