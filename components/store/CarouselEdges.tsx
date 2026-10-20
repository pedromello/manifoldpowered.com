import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./CarouselEdges.module.css";

export function CarouselEdges({
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  hasPrevious = true,
  hasNext = true,
}: {
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}) {
  if (!hasPrevious && !hasNext) return null;
  return (
    <div className={styles.edges}>
      {hasPrevious && (
        <button
          type="button"
          className={`${styles.edge} ${styles.previous}`}
          aria-label={previousLabel}
          onClick={onPrevious}
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          className={`${styles.edge} ${styles.next}`}
          aria-label={nextLabel}
          onClick={onNext}
        >
          <ChevronRight size={28} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
