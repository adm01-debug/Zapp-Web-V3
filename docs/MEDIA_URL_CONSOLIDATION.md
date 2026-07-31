# MEDIA URL RESOLUTION CONSOLIDATION

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Problem

Two functions doing the same thing:

```typescript
// In mediaUrl.ts
export function resolveMessageMediaUrl(url: string): string {
  // Does something
}

// In useMediaUrl.ts
export function resolvePublicMediaUrl(url: string): string {
  // Does essentially the same thing
}
```

---

## Solution

Single source of truth:

```typescript
// src/utils/mediaUrl.ts

export interface MediaUrlOptions {
  bucket?: string;
  signed?: boolean;
  expiresIn?: number;
}

/**
 * Resolves a media URL to a public or signed URL.
 * Handles Kong internal URLs, storage URLs, and public buckets.
 */
export function resolveMediaUrl(
  url: string | null | undefined,
  options: MediaUrlOptions = {}
): string | null {
  if (!url) return null;

  // Handle internal Kong URLs
  if (url.includes('kong:8000') || url.includes('localhost:8000')) {
    return resolveInternalUrl(url);
  }

  // Handle already public URLs
  if (url.startsWith('https://')) {
    return url;
  }

  // Handle storage paths
  return resolveStoragePath(url, options);
}
```

---

## Usage

```typescript
// Before: multiple functions
const url1 = resolveMessageMediaUrl(mediaUrl);
const url2 = resolvePublicMediaUrl(mediaUrl);

// After: single function
const url = resolveMediaUrl(mediaUrl);
```

---

## Private Bucket Handling

```typescript
export async function getMediaUrl(
  path: string,
  options: MediaUrlOptions = {}
): Promise<string | null> {
  // Private bucket: create signed URL
  if (options.bucket === 'private') {
    const { data } = await supabase.storage
      .from(options.bucket)
      .createSignedUrl(path, options.expiresIn || 3600);
    return data?.signedUrl || null;
  }

  // Public bucket or signed: resolve URL
  return resolveMediaUrl(path, options);
}
```

---

*Document Status: IN PROGRESS*
