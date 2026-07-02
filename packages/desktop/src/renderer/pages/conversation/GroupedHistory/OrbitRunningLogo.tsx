/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

const ORBIT_FRAME_COUNT = 36;
const ORBIT_FRAME_RATE = 18;
const ORBIT_FRAME_INTERVAL_MS = 1000 / ORBIT_FRAME_RATE;

const buildOrbitFrames = (folder: string) =>
  Array.from({ length: ORBIT_FRAME_COUNT }, (_, index) => {
    const value = String(index).padStart(2, '0');
    return new URL(`../../../assets/${folder}/frame_${value}.svg`, import.meta.url).href;
  });

const LIGHT_ORBIT_FRAMES = buildOrbitFrames('logo-orbit');
const DARK_ORBIT_FRAMES = buildOrbitFrames('logo-orbit-inverted');

const getDocumentTheme = () => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
};

const useDocumentTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getDocumentTheme);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(getDocumentTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    setTheme(getDocumentTheme());
    return () => observer.disconnect();
  }, []);

  return theme;
};

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
};

type OrbitRunningLogoProps = {
  className?: string;
  size?: number;
  ariaLabel?: string;
};

const OrbitRunningLogo: React.FC<OrbitRunningLogoProps> = ({ className, size = 16, ariaLabel = 'DeepOrganiser running' }) => {
  const theme = useDocumentTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<HTMLImageElement[]>([]);
  const readyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const accumulatorRef = useRef(0);
  const frameRef = useRef(0);
  const sizeRef = useRef(size);
  const shouldAnimate = !prefersReducedMotion;
  const frameSources = theme === 'dark' ? DARK_ORBIT_FRAMES : LIGHT_ORBIT_FRAMES;

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || frames.length === 0) return;
    const image = frames[index] || frames[0];
    if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

    const currentSize = Math.max(1, sizeRef.current);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const targetSize = Math.round(currentSize * dpr);
    if (canvas.width !== targetSize || canvas.height !== targetSize) {
      canvas.width = targetSize;
      canvas.height = targetSize;
      canvas.style.width = `${currentSize}px`;
      canvas.style.height = `${currentSize}px`;
    }

    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAnimation = useCallback(() => {
    if (rafRef.current !== null || !shouldAnimate) return;
    lastTimeRef.current = performance.now();
    accumulatorRef.current = 0;

    const tick = (now: number) => {
      if (!readyRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatorRef.current += delta;
      if (accumulatorRef.current >= ORBIT_FRAME_INTERVAL_MS) {
        const steps = Math.floor(accumulatorRef.current / ORBIT_FRAME_INTERVAL_MS);
        accumulatorRef.current -= steps * ORBIT_FRAME_INTERVAL_MS;
        frameRef.current = (frameRef.current + steps) % ORBIT_FRAME_COUNT;
        drawFrame(frameRef.current);
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [drawFrame, shouldAnimate]);

  useEffect(() => {
    sizeRef.current = size;
    drawFrame(frameRef.current);
  }, [drawFrame, size]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    stopAnimation();
    readyRef.current = false;
    frameRef.current = 0;
    accumulatorRef.current = 0;

    const images = frameSources.map((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });
    framesRef.current = images;

    let readyCount = 0;
    const handleReady = () => {
      readyCount += 1;
      if (readyCount < images.length || cancelled) return;
      readyRef.current = true;
      drawFrame(0);
      if (shouldAnimate) {
        startAnimation();
      }
    };

    images.forEach((image) => {
      if (image.complete) {
        handleReady();
      } else {
        image.addEventListener('load', handleReady, { once: true });
        image.addEventListener('error', handleReady, { once: true });
      }
    });

    return () => {
      cancelled = true;
      images.forEach((image) => {
        image.removeEventListener('load', handleReady);
        image.removeEventListener('error', handleReady);
      });
      stopAnimation();
    };
  }, [drawFrame, frameSources, shouldAnimate, startAnimation, stopAnimation]);

  useEffect(() => {
    if (!shouldAnimate) {
      stopAnimation();
      frameRef.current = 0;
      accumulatorRef.current = 0;
      drawFrame(0);
      return;
    }
    if (readyRef.current) {
      startAnimation();
    }
    return stopAnimation;
  }, [drawFrame, shouldAnimate, startAnimation, stopAnimation]);

  return (
    <canvas
      ref={canvasRef}
      role='img'
      aria-label={ariaLabel}
      className={classNames('block flex-shrink-0', className)}
      style={{ width: size, height: size }}
    />
  );
};

export default OrbitRunningLogo;
