/**
 * DashboardAnalyticsCarousel Component
 *
 * A polished horizontal auto-sliding carousel for manufacturing analytics.
 * Features: auto-play, smooth transitions, touch/swipe, keyboard nav, pause on hover.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface CarouselSlide {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
}

interface DashboardCarouselProps {
  slides: CarouselSlide[];
  autoPlayInterval?: number; // milliseconds
  className?: string;
}

const DEFAULT_INTERVAL = 6000; // 6 seconds

export function DashboardCarousel({
  slides,
  autoPlayInterval = DEFAULT_INTERVAL,
  className = "",
}: DashboardCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slides.length;

  const goToSlide = useCallback(
    (index: number) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      const wrappedIndex = ((index % totalSlides) + totalSlides) % totalSlides;
      setCurrentIndex(wrappedIndex);
      setTimeout(() => setIsTransitioning(false), 500);
    },
    [totalSlides, isTransitioning]
  );

  const goNext = useCallback(() => {
    goToSlide(currentIndex + 1);
  }, [currentIndex, goToSlide]);

  const goPrev = useCallback(() => {
    goToSlide(currentIndex - 1);
  }, [currentIndex, goToSlide]);

  // Auto-play — single stable interval; restarts only when play-state or slide count changes,
  // never on unrelated re-renders. Hover/touch pauses without destroying the timer lifecycle.
  useEffect(() => {
    const playing = autoPlayEnabled && !isPaused && totalSlides > 1;
    if (!playing) {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
      return;
    }

    autoPlayRef.current = setInterval(() => {
      setCurrentIndex((prev) => ((prev + 1) % totalSlides));
    }, autoPlayInterval);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [isPaused, autoPlayEnabled, autoPlayInterval, totalSlides]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("keydown", handleKeyDown);
      return () => container.removeEventListener("keydown", handleKeyDown);
    }
  }, [goNext, goPrev]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        goNext();
      } else {
        goPrev();
      }
    }

    setTimeout(() => setIsPaused(false), 1000);
  };

  // Mouse hover handlers
  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  if (totalSlides === 0) {
    return (
      <div className={`dashboard-carousel ${className}`} data-empty="true">
        <div className="dashboard-carousel__empty">
          <p>No analytics slides available</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`dashboard-carousel ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Manufacturing Analytics Dashboard"
      tabIndex={0}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="dashboard-carousel__viewport">
        <div
          className="dashboard-carousel__track"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          aria-live={isPaused ? "polite" : "off"}
        >
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`dashboard-carousel__slide ${
                index === currentIndex ? "dashboard-carousel__slide--active" : ""
              }`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${totalSlides}: ${slide.title}`}
              aria-hidden={index !== currentIndex}
            >
              <div className="dashboard-carousel__slide-header">
                <span className="dashboard-carousel__slide-icon" aria-hidden="true">{slide.icon}</span>
                <h2 className="dashboard-carousel__slide-title">{slide.title}</h2>
              </div>
              <div className="dashboard-carousel__slide-content">{slide.content}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="dashboard-carousel__nav dashboard-carousel__nav--prev"
        onClick={goPrev}
        aria-label="Previous slide"
        disabled={isTransitioning}
      >
        ←
      </button>
      <button
        type="button"
        className="dashboard-carousel__nav dashboard-carousel__nav--next"
        onClick={goNext}
        aria-label="Next slide"
        disabled={isTransitioning}
      >
        →
      </button>

      <div className="dashboard-carousel__footer">
        <span className="dashboard-carousel__counter" aria-live="polite">
          Slide {currentIndex + 1} of {totalSlides}
        </span>
        <div className="dashboard-carousel__indicators" role="tablist" aria-label="Slide selection">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={`dashboard-carousel__dot ${
                index === currentIndex ? "dashboard-carousel__dot--active" : ""
              }`}
              onClick={() => goToSlide(index)}
              role="tab"
              aria-selected={index === currentIndex}
              aria-label={`Go to slide ${index + 1}: ${slide.title}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="dashboard-carousel__play-toggle"
          onClick={() => setAutoPlayEnabled((prev) => !prev)}
          aria-label={autoPlayEnabled ? "Pause auto-play" : "Resume auto-play"}
          aria-pressed={!autoPlayEnabled}
          title={autoPlayEnabled ? "Pause auto-play" : "Resume auto-play"}
        >
          {autoPlayEnabled ? "⏸" : "▶"}
        </button>
      </div>

      {isPaused && autoPlayEnabled && totalSlides > 1 && (
        <div className="dashboard-carousel__pause-indicator" aria-hidden="true">
          ⏸ Paused
        </div>
      )}
    </div>
  );
}