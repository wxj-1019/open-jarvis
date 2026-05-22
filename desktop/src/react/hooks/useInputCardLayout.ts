import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { calculateInputCardBottomInset, parseCssPixels } from '../utils/input-card-layout';

/**
 * Manages the input card layout, measuring the editor and card dimensions
 * and setting CSS custom properties on the parent `.main-content` element.
 */
export function useInputCardLayout(editor: Editor | null) {
  const inputSurfaceRef = useRef<HTMLDivElement>(null);
  const inputCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = inputSurfaceRef.current;
    const card = inputCardRef.current;
    const editorElement = editor?.view.dom;
    const parent = card?.closest('.main-content') as HTMLElement | null;
    if (!surface || !card || !editorElement || !parent) return;

    const updateMetrics = () => {
      const editorStyle = window.getComputedStyle(editorElement);
      const editorFontSize = parseCssPixels(editorStyle.fontSize, 16);
      const editorLineHeight = parseCssPixels(editorStyle.lineHeight, editorFontSize * 1.6);
      const cardRect = card.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const cardHeight = cardRect.height || card.offsetHeight;
      const editorHeight = editorElement.getBoundingClientRect().height || editorElement.offsetHeight;
      const upperChromeHeight = Math.max(0, cardRect.top - surfaceRect.top);
      const bottomInset = calculateInputCardBottomInset({
        cardHeight,
        editorHeight,
        editorLineHeight,
        upperChromeHeight,
      });

      parent.style.setProperty('--input-card-h', `${cardHeight}px`);
      parent.style.setProperty('--input-card-bottom-inset', `${bottomInset}px`);
    };

    updateMetrics();

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        parent.style.removeProperty('--input-card-h');
        parent.style.removeProperty('--input-card-bottom-inset');
      };
    }

    const observer = new ResizeObserver(updateMetrics);
    observer.observe(surface);
    observer.observe(card);
    observer.observe(editorElement);

    return () => {
      observer.disconnect();
      parent.style.removeProperty('--input-card-h');
      parent.style.removeProperty('--input-card-bottom-inset');
    };
  }, [editor]);

  return { inputSurfaceRef, inputCardRef };
}
