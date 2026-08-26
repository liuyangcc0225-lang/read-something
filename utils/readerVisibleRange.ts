/**
 * DOM-based visible text range scanning for the Reader scroller.
 *
 * Extracted from ReaderMessagePanel so both ReaderMessagePanel and Reader
 * can compute the visible text range.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

export interface VisibleReaderTextRange {
  start: number;
  end: number;
}

export interface VisibleRangeOptions {
  enforceBottomFullLine?: boolean;
}

const collectReaderSegmentTotalLength = (scroller: HTMLElement) => {
  const segments = scroller.querySelectorAll<HTMLElement>('[data-reader-segment="1"]');
  let maxLength = 0;
  segments.forEach((segment) => {
    const start = Number(segment.dataset.start ?? Number.NaN);
    if (!Number.isFinite(start)) return;
    const length = segment.textContent?.length || 0;
    maxLength = Math.max(maxLength, Math.max(0, Math.floor(start)) + length);
  });
  return maxLength;
};

const resolveNodeOffsetToReaderIndex = (node: Node, offset: number, totalLength: number) => {
  let segmentElement: HTMLElement | null = null;
  let resolvedOffset = 0;

  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text;
    segmentElement = textNode.parentElement?.closest('[data-reader-segment="1"]') as HTMLElement | null;
    resolvedOffset = clamp(offset, 0, textNode.data.length);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    segmentElement = element.closest('[data-reader-segment="1"]') as HTMLElement | null;
    if (segmentElement) {
      const textLength = segmentElement.textContent?.length ?? 0;
      resolvedOffset = offset <= 0 ? 0 : textLength;
    }
  }

  if (!segmentElement) return null;
  const start = Number(segmentElement.dataset.start ?? Number.NaN);
  if (!Number.isFinite(start)) return null;
  return clamp(Math.floor(start) + resolvedOffset, 0, totalLength);
};

const resolveReaderIndexFromViewportPoint = (
  scroller: HTMLElement,
  x: number,
  y: number,
  totalLength: number
) => {
  const doc = scroller.ownerDocument as CaretDocument;

  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      const resolved = resolveNodeOffsetToReaderIndex(pos.offsetNode, pos.offset, totalLength);
      if (resolved !== null) return resolved;
    }
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      const resolved = resolveNodeOffsetToReaderIndex(range.startContainer, range.startOffset, totalLength);
      if (resolved !== null) return resolved;
    }
  }

  const hit = doc.elementFromPoint(x, y) as HTMLElement | null;
  const segment = hit?.closest?.('[data-reader-segment="1"]') as HTMLElement | null;
  if (!segment) return null;

  const start = Number(segment.dataset.start ?? Number.NaN);
  if (!Number.isFinite(start)) return null;
  const textLength = segment.textContent?.length || 0;
  return clamp(Math.floor(start) + textLength, 0, totalLength);
};

const scanVisibleReaderBoundaryIndex = (
  scroller: HTMLElement,
  totalLength: number,
  yFrom: number,
  yTo: number,
  step: number,
  xCandidates: number[],
  strategy: 'min' | 'max'
) => {
  const safeStep = Math.max(1, Math.floor(Math.abs(step)));
  const goingDown = yFrom <= yTo;
  const collected: number[] = [];

  for (
    let y = yFrom;
    goingDown ? y <= yTo : y >= yTo;
    y += goingDown ? safeStep : -safeStep
  ) {
    const resolvedAtY = xCandidates
      .map((x) => resolveReaderIndexFromViewportPoint(scroller, x, y, totalLength))
      .filter((value): value is number => value !== null);
    if (resolvedAtY.length === 0) continue;
    collected.push(strategy === 'min' ? Math.min(...resolvedAtY) : Math.max(...resolvedAtY));
  }

  if (collected.length === 0) return null;
  return strategy === 'min' ? Math.min(...collected) : Math.max(...collected);
};

export const resolveVisibleReaderTextRange = (
  scroller: HTMLElement,
  viewportBottomY?: number | null,
  options?: VisibleRangeOptions
): VisibleReaderTextRange | null => {
  const totalLength = collectReaderSegmentTotalLength(scroller);
  if (totalLength <= 0) return null;

  const rect = scroller.getBoundingClientRect();
  if (rect.height <= 1 || rect.width <= 1) return null;
  const unclampedBottom = Number.isFinite(Number(viewportBottomY)) ? Number(viewportBottomY) : rect.bottom;
  const effectiveBottom = clamp(unclampedBottom, rect.top + 1, rect.bottom - 1);
  if (effectiveBottom <= rect.top + 1) return null;

  const article = scroller.querySelector('article') as HTMLElement | null;
  const articleRect = article?.getBoundingClientRect() || rect;
  const sampleLeftBound = clamp(
    Math.max(rect.left + 1, articleRect.left + 1),
    rect.left + 1,
    rect.right - 1
  );
  const sampleRightBound = clamp(
    Math.min(rect.right - 1, articleRect.right - 1),
    sampleLeftBound,
    rect.right - 1
  );
  const topY = clamp(
    Math.max(rect.top + 1, articleRect.top + 1),
    rect.top + 1,
    rect.bottom - 1
  );
  const computedLineHeight = Number.parseFloat(window.getComputedStyle(article || scroller).lineHeight || '');
  const bottomGuardPx =
    options?.enforceBottomFullLine && Number.isFinite(computedLineHeight) && computedLineHeight > 0
      ? clamp(Math.round(computedLineHeight * 0.58), 6, 48)
      : 0;
  const bottomY = clamp(
    Math.min(effectiveBottom - 1 - bottomGuardPx, articleRect.bottom - 1),
    topY,
    rect.bottom - 1
  );

  const xCandidates: number[] = [];
  const samples = 11;
  if (sampleRightBound <= sampleLeftBound + 1) {
    xCandidates.push(sampleLeftBound);
  } else {
    const step = (sampleRightBound - sampleLeftBound) / (samples - 1);
    for (let i = 0; i < samples; i += 1) {
      xCandidates.push(clamp(sampleLeftBound + step * i, sampleLeftBound, sampleRightBound));
    }
  }

  const visibleStart = scanVisibleReaderBoundaryIndex(
    scroller,
    totalLength,
    topY,
    bottomY,
    1,
    xCandidates,
    'min'
  );
  const visibleEnd = scanVisibleReaderBoundaryIndex(
    scroller,
    totalLength,
    bottomY,
    topY,
    1,
    [...xCandidates].reverse(),
    'max'
  );

  if (visibleStart === null && visibleEnd === null) return null;

  const start = clamp(Math.min(visibleStart ?? visibleEnd ?? 0, visibleEnd ?? visibleStart ?? 0), 0, totalLength);
  const end = clamp(Math.max(visibleStart ?? visibleEnd ?? 0, visibleEnd ?? visibleStart ?? 0), start, totalLength);
  return { start, end };
};

/**
 * Offset-based variant that ignores overlay elements (chat panel, etc.).
 * Uses getBoundingClientRect on segments instead of caretPositionFromPoint,
 * so elements behind an overlay are still detected.
 */
export const resolveFullViewportTextRange = (
  scroller: HTMLElement
): VisibleReaderTextRange | null => {
  const segments = scroller.querySelectorAll<HTMLElement>('[data-reader-segment="1"]');
  if (segments.length === 0) return null;

  const scrollerRect = scroller.getBoundingClientRect();
  if (scrollerRect.height <= 1 || scrollerRect.width <= 1) return null;

  let minStart = Infinity;
  let maxEnd = 0;
  let found = false;

  segments.forEach((segment) => {
    const segRect = segment.getBoundingClientRect();
    if (segRect.bottom <= scrollerRect.top || segRect.top >= scrollerRect.bottom) return;

    const dataStart = Number(segment.dataset.start ?? Number.NaN);
    if (!Number.isFinite(dataStart)) return;

    const textLen = segment.textContent?.length || 0;
    const segStart = Math.max(0, Math.floor(dataStart));
    const segEnd = segStart + textLen;

    minStart = Math.min(minStart, segStart);
    maxEnd = Math.max(maxEnd, segEnd);
    found = true;
  });

  if (!found) return null;
  return { start: minStart === Infinity ? 0 : minStart, end: maxEnd };
};
